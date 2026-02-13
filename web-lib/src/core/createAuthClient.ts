import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import createAuthRefreshInterceptor from 'axios-auth-refresh'
import { resolveConfig } from './config'
import { createHttp } from './http'
import { memoryStorage } from './storage'
import { normalizeApiError } from './errors'
import { createScheduler } from './scheduler'
import { createChannel } from './channel'
import { extractTokenExpiryMs, parseExpiresAt } from './jwt'
import type { AuthClient, AuthClientConfig, AuthState, AuthUser, LoginInput, TokenPayload } from './types'

interface AuthTokenResponseDto {
  access_token?: string
  refresh_token?: string
  expires_at?: string
}

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  skipAuthRefresh?: boolean
}

function noopAsync() {
  return Promise.resolve()
}

export function createAuthClient(config: AuthClientConfig): AuthClient {
  const resolved = resolveConfig(config)
  const storage = resolved.storage.adapter ?? memoryStorage()
  const { http, refreshHttp } = createHttp(resolved.baseURL)

  const listeners = new Set<(state: AuthState) => void>()
  const channel = resolved.multiTab.enabled
    ? createChannel(resolved.multiTab)
    : {
        subscribe: () => () => undefined,
        broadcastTokens: () => noopAsync(),
        broadcastLogout: () => noopAsync(),
        waitForMessage: async () => null,
        tryAcquireLock: () => true,
        releaseLock: () => undefined,
        close: () => noopAsync(),
      }

  let state: AuthState = {
    user: null,
    isAuthenticated: false,
    isBootstrapping: false,
    isRefreshing: false,
    accessTokenExpiresAtMs: null,
    nextRefreshAtMs: null,
    clientType: resolved.clientType,
  }

  let refreshInFlight: Promise<void> | null = null
  let destroyed = false

  const scheduler = createScheduler({
    leadTimeMs: resolved.proactiveRefresh.leadTimeMs,
    jitterMs: resolved.proactiveRefresh.jitterMs,
    minIntervalMs: resolved.proactiveRefresh.minIntervalMs,
    onTrigger: () => {
      void runRefresh('proactive')
    },
  })

  const setState = (next: Partial<AuthState>) => {
    state = { ...state, ...next }
    listeners.forEach((listener) => listener(state))
  }

  const clearScheduling = () => {
    scheduler.cancel()
    setState({
      accessTokenExpiresAtMs: null,
      nextRefreshAtMs: null,
    })
  }

  const scheduleFromToken = (payload: TokenPayload) => {
    const expiresAtMs = parseExpiresAt(payload.expiresAt) ?? extractTokenExpiryMs(payload.accessToken)

    if (!expiresAtMs) {
      clearScheduling()
      return
    }

    if (!resolved.proactiveRefresh.enabled) {
      scheduler.cancel()
      setState({
        accessTokenExpiresAtMs: expiresAtMs,
        nextRefreshAtMs: null,
      })
      return
    }

    const { nextRefreshAtMs } = scheduler.reschedule(expiresAtMs)
    setState({
      accessTokenExpiresAtMs: expiresAtMs,
      nextRefreshAtMs,
    })
  }

  const applyTokenPayload = (payload: TokenPayload) => {
    storage.setAccessToken(payload.accessToken)
    storage.setRefreshToken(payload.refreshToken)
    scheduleFromToken(payload)
    resolved.hooks.onTokenUpdate?.(payload)
  }

  const clearTokens = async (broadcast: boolean) => {
    storage.clearAccessToken()
    storage.clearRefreshToken()
    clearScheduling()
    setState({
      user: null,
      isAuthenticated: false,
      isRefreshing: false,
    })

    if (broadcast) {
      await channel.broadcastLogout()
    }
  }

  const requestInterceptorId = http.interceptors.request.use((request) => {
    const next = { ...request }
    next.headers = next.headers ?? {}

    const accessToken = storage.getAccessToken()
    if (accessToken) {
      next.headers.Authorization = `Bearer ${accessToken}`
    }

    next.headers[resolved.headers.clientTypeHeader] = resolved.clientType
    if (resolved.refresh.withCredentials) {
      next.withCredentials = true
    }

    return next
  })

  const isAuthEndpoint = (url?: string) => {
    if (!url) {
      return false
    }

    return (
      url.includes(resolved.endpoints.login) ||
      url.includes(resolved.endpoints.refresh)
    )
  }

  const refreshInterceptorId = createAuthRefreshInterceptor(
    http,
    async (failedRequest) => {
      const requestConfig = failedRequest.response?.config as RetriableRequestConfig | undefined
      if (!requestConfig || isAuthEndpoint(requestConfig.url)) {
        throw failedRequest
      }

      const refreshToken = storage.getRefreshToken()
      if (resolved.refresh.strategy === 'body' && !refreshToken) {
        await clearTokens(true)
        resolved.hooks.onAuthFailure?.(failedRequest)
        throw failedRequest
      }

      if (!channel.tryAcquireLock()) {
        const message = await channel.waitForMessage()
        if (message?.type === 'tokens' && message.accessToken) {
          applyTokenPayload({
            accessToken: message.accessToken,
            refreshToken: message.refreshToken,
            expiresAt: message.expiresAt,
          })

          requestConfig.headers = requestConfig.headers ?? {}
          requestConfig.headers.Authorization = `Bearer ${message.accessToken}`
          return Promise.resolve()
        }

        await clearTokens(true)
        resolved.hooks.onAuthFailure?.(failedRequest)
        throw failedRequest
      }

      setState({ isRefreshing: true })

      try {
        const payload = resolved.refresh.strategy === 'body' ? { refresh_token: refreshToken } : {}
        const refreshResponse = await refreshHttp.post(
          resolved.endpoints.refresh,
          payload,
          {
            headers: {
              [resolved.headers.clientTypeHeader]: resolved.clientType,
            },
            withCredentials: resolved.refresh.withCredentials,
            skipAuthRefresh: true,
          } as unknown as RetriableRequestConfig,
        )

        const data = refreshResponse.data as AuthTokenResponseDto
        const nextToken = data.access_token ?? null
        const nextRefreshToken = data.refresh_token ?? null
        const nextExpiresAt = data.expires_at ?? null

        if (!nextToken) {
          throw failedRequest
        }

        applyTokenPayload({
          accessToken: nextToken,
          refreshToken: nextRefreshToken,
          expiresAt: nextExpiresAt,
        })

        await channel.broadcastTokens(nextToken, nextRefreshToken, nextExpiresAt)

        requestConfig.headers = requestConfig.headers ?? {}
        requestConfig.headers.Authorization = `Bearer ${nextToken}`
      } catch (error) {
        await clearTokens(true)
        resolved.hooks.onAuthFailure?.(error)
        throw error
      } finally {
        channel.releaseLock()
        setState({ isRefreshing: false })
      }
    },
    {
      statusCodes: [401],
      pauseInstanceWhileRefreshing: true,
      shouldRefresh: (error: AxiosError) => {
        const request = error.config as RetriableRequestConfig | undefined
        if (!request || request.skipAuthRefresh || isAuthEndpoint(request.url)) {
          return false
        }
        return resolved.refresh.retryOn401
      },
    },
  )

  const fetchMe = async () => {
    const response = await http.get<AuthUser>(resolved.endpoints.me)
    setState({ user: response.data, isAuthenticated: true })
    return response.data
  }

  const runRefresh = async (reason: 'manual' | 'proactive' | 'bootstrap' | 'lifecycle') => {
    if (destroyed) {
      return
    }

    if (!state.isAuthenticated && reason !== 'bootstrap') {
      return
    }

    const refreshToken = storage.getRefreshToken()
    if (resolved.refresh.strategy === 'body' && !refreshToken) {
      if (reason === 'manual' || reason === 'bootstrap') {
        await clearTokens(true)
      }
      return
    }

    if (state.isRefreshing) {
      return
    }

    setState({ isRefreshing: true })

    let attempts = 0
    while (attempts < 2) {
      try {
        const payload = resolved.refresh.strategy === 'body' ? { refresh_token: refreshToken } : {}
        const response = await refreshHttp.post<AuthTokenResponseDto>(
          resolved.endpoints.refresh,
          payload,
          {
            headers: {
              [resolved.headers.clientTypeHeader]: resolved.clientType,
            },
            withCredentials: resolved.refresh.withCredentials,
            skipAuthRefresh: true,
          } as unknown as RetriableRequestConfig,
        )

        const nextToken = response.data.access_token ?? null
        const nextRefreshToken = response.data.refresh_token ?? null
        const nextExpiresAt = response.data.expires_at ?? null
        if (!nextToken) {
          throw new Error('refresh_missing_token')
        }

        applyTokenPayload({
          accessToken: nextToken,
          refreshToken: nextRefreshToken,
          expiresAt: nextExpiresAt,
        })
        await channel.broadcastTokens(nextToken, nextRefreshToken, nextExpiresAt)
        await fetchMe()
        setState({ isRefreshing: false })
        return
      } catch (error) {
        const authError = normalizeApiError(error)
        const transient = authError.status === 0

        if ((reason === 'proactive' || reason === 'lifecycle') && transient && attempts === 0) {
          attempts += 1
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 5000)
          })
          continue
        }

        if (authError.status === 401 || authError.errorCode === 'invalid_refresh_token') {
          await clearTokens(true)
          resolved.hooks.onAuthFailure?.(error)
          setState({ isRefreshing: false })
          return
        }

        if (reason === 'proactive' || reason === 'lifecycle') {
          const fallbackExpiry = Date.now() + resolved.proactiveRefresh.leadTimeMs + resolved.proactiveRefresh.minIntervalMs
          const { nextRefreshAtMs } = scheduler.reschedule(fallbackExpiry)
          setState({ nextRefreshAtMs })
          setState({ isRefreshing: false })
          return
        }

        setState({ isRefreshing: false })
        throw normalizeApiError(error)
      }
    }

    setState({ isRefreshing: false })
  }

  const ensureRefresh = (reason: 'manual' | 'proactive' | 'bootstrap' | 'lifecycle') => {
    if (refreshInFlight) {
      return refreshInFlight
    }

    refreshInFlight = runRefresh(reason).finally(() => {
      refreshInFlight = null
    })
    return refreshInFlight
  }

  const channelUnsubscribe = channel.subscribe((message) => {
    if (destroyed) {
      return
    }

    if (message.type === 'logout') {
      void clearTokens(false)
      return
    }

    applyTokenPayload({
      accessToken: message.accessToken,
      refreshToken: message.refreshToken,
      expiresAt: message.expiresAt,
    })

    void fetchMe().catch(() => {
      void clearTokens(false)
    })
  })

  const triggerLifecycleRefresh = () => {
    if (!resolved.proactiveRefresh.enabled || !state.accessTokenExpiresAtMs) {
      return
    }

    if (state.accessTokenExpiresAtMs - Date.now() <= resolved.proactiveRefresh.leadTimeMs) {
      void ensureRefresh('lifecycle')
    }
  }

  const onVisibilityChange = () => {
    if (!document.hidden) {
      triggerLifecycleRefresh()
    }
  }

  const onFocus = () => {
    triggerLifecycleRefresh()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', onFocus)

  const bootstrap = async () => {
    setState({ isBootstrapping: true })
    const access = storage.getAccessToken()
    if (access) {
      scheduleFromToken({
        accessToken: access,
        refreshToken: storage.getRefreshToken(),
        expiresAt: null,
      })
    }

    try {
      if (!access && resolved.refresh.strategy === 'cookie') {
        await ensureRefresh('bootstrap')
      }

      if (storage.getAccessToken()) {
        await fetchMe()
      } else {
        setState({ user: null, isAuthenticated: false })
      }
    } catch {
      await clearTokens(false)
    } finally {
      setState({ isBootstrapping: false })
    }
  }

  const login = async (input: LoginInput) => {
    try {
      const response = await http.post<AuthTokenResponseDto>(
        resolved.endpoints.login,
        {
          login_name: input.loginName,
          password: input.password,
        },
        {
          headers: {
            [resolved.headers.clientTypeHeader]: resolved.clientType,
          },
          withCredentials: resolved.refresh.withCredentials,
          skipAuthRefresh: true,
        } as unknown as RetriableRequestConfig,
      )

      applyTokenPayload({
        accessToken: response.data.access_token ?? null,
        refreshToken: response.data.refresh_token ?? null,
        expiresAt: response.data.expires_at ?? null,
      })

      await channel.broadcastTokens(
        response.data.access_token ?? null,
        response.data.refresh_token ?? null,
        response.data.expires_at ?? null,
      )

      return await fetchMe()
    } catch (error) {
      throw normalizeApiError(error)
    }
  }

  const logout = async () => {
    try {
      const payload = resolved.refresh.strategy === 'body'
        ? { refresh_token: storage.getRefreshToken() }
        : {}

      await http.post(
        resolved.endpoints.logout,
        payload,
        {
          withCredentials: resolved.refresh.withCredentials,
          skipAuthRefresh: true,
        } as unknown as RetriableRequestConfig,
      )
    } catch {
      // best effort logout
    } finally {
      await clearTokens(true)
    }
  }

  const me = async () => {
    try {
      return await fetchMe()
    } catch (error) {
      throw normalizeApiError(error)
    }
  }

  const refreshNow = async () => {
    await ensureRefresh('manual')
  }

  const subscribe = (listener: (snapshot: AuthState) => void) => {
    listeners.add(listener)
    listener(state)
    return () => {
      listeners.delete(listener)
    }
  }

  const getState = () => state

  const destroy = () => {
    if (destroyed) {
      return
    }

    destroyed = true
    scheduler.cancel()
    http.interceptors.request.eject(requestInterceptorId)
    http.interceptors.response.eject(refreshInterceptorId)
    channelUnsubscribe()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('focus', onFocus)
    void channel.close()
    listeners.clear()
  }

  return {
    bootstrap,
    login,
    logout,
    refreshNow,
    me,
    getState,
    subscribe,
    destroy,
  }
}
