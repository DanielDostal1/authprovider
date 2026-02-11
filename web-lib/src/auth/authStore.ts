import type { ReactNode } from 'react'
import { createElement, useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { setupInterceptors } from '../api/interceptors'
import { AuthContext } from './authContext'
import { getClientType, login as loginRequest, logout as logoutRequest, me, refresh } from './authService'
import { broadcastLogout, broadcastTokens, subscribeAuthChannel } from './channel'
import { createProactiveRefreshScheduler } from './proactiveRefreshScheduler'
import { extractTokenExpiryMs, parseExpiresAt } from './jwt'
import {
  clearAllTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from '../utils/tokenStorage'
import type { ApiError, AuthContextValue, AuthUser, LoginInput, TokenUpdate } from './types'

function parseBooleanEnv(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue
  }

  return value.toLowerCase() === 'true'
}

function parseNumberEnv(value: string | undefined, defaultValue: number) {
  if (value === undefined) {
    return defaultValue
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

const proactiveRefreshPolicy = {
  enabled: parseBooleanEnv(import.meta.env.VITE_PROACTIVE_REFRESH_ENABLED, true),
  leadTimeMs: parseNumberEnv(import.meta.env.VITE_PROACTIVE_REFRESH_LEAD_TIME_MS, 60_000),
  jitterMs: parseNumberEnv(import.meta.env.VITE_PROACTIVE_REFRESH_JITTER_MS, 10_000),
  minIntervalMs: parseNumberEnv(import.meta.env.VITE_PROACTIVE_REFRESH_MIN_INTERVAL_MS, 5_000),
}

const NETWORK_RETRY_DELAY_MS = 5_000

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isBootstrapping: boolean
  isRefreshing: boolean
  accessTokenExpiresAtMs: number | null
  nextRefreshAtMs: number | null
}

type AuthAction =
  | { type: 'LOGIN_SUCCESS'; payload: AuthUser }
  | { type: 'SET_USER'; payload: AuthUser }
  | { type: 'SET_REFRESHING'; payload: boolean }
  | { type: 'SET_TOKEN_TIMING'; payload: { accessTokenExpiresAtMs: number | null; nextRefreshAtMs: number | null } }
  | { type: 'BOOTSTRAP_DONE' }
  | { type: 'LOGOUT' }

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isBootstrapping: true,
  isRefreshing: false,
  accessTokenExpiresAtMs: null,
  nextRefreshAtMs: null,
}

function reducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
      }
    case 'SET_USER':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
      }
    case 'SET_REFRESHING':
      return {
        ...state,
        isRefreshing: action.payload,
      }
    case 'SET_TOKEN_TIMING':
      return {
        ...state,
        accessTokenExpiresAtMs: action.payload.accessTokenExpiresAtMs,
        nextRefreshAtMs: action.payload.nextRefreshAtMs,
      }
    case 'BOOTSTRAP_DONE':
      return {
        ...state,
        isBootstrapping: false,
      }
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isRefreshing: false,
        accessTokenExpiresAtMs: null,
        nextRefreshAtMs: null,
      }
    default:
      return state
  }
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const clientType = getClientType()
  const stateRef = useRef(state)
  const refreshInFlightRef = useRef<Promise<void> | null>(null)
  const schedulerRef = useRef<ReturnType<typeof createProactiveRefreshScheduler> | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const clearTokenTiming = useCallback(() => {
    schedulerRef.current?.cancel()
    dispatch({
      type: 'SET_TOKEN_TIMING',
      payload: { accessTokenExpiresAtMs: null, nextRefreshAtMs: null },
    })
  }, [])

  const scheduleTokenTiming = useCallback((expiresAt: string | null, accessToken: string | null) => {
    const parsedFromResponse = parseExpiresAt(expiresAt)
    const parsedFromJwt = extractTokenExpiryMs(accessToken)
    const accessTokenExpiresAtMs = parsedFromResponse ?? parsedFromJwt

    if (!accessTokenExpiresAtMs) {
      clearTokenTiming()
      return
    }

    if (!proactiveRefreshPolicy.enabled) {
      schedulerRef.current?.cancel()
      dispatch({
        type: 'SET_TOKEN_TIMING',
        payload: { accessTokenExpiresAtMs, nextRefreshAtMs: null },
      })
      return
    }

    const scheduler = schedulerRef.current
    if (!scheduler) {
      return
    }

    const { nextRefreshAtMs } = scheduler.reschedule(accessTokenExpiresAtMs)
    dispatch({
      type: 'SET_TOKEN_TIMING',
      payload: { accessTokenExpiresAtMs, nextRefreshAtMs },
    })
  }, [clearTokenTiming])

  const applyTokenUpdate = useCallback((update: TokenUpdate) => {
    setAccessToken(update.accessToken)
    setRefreshToken(update.refreshToken)
    scheduleTokenTiming(update.expiresAt, update.accessToken)
  }, [scheduleTokenTiming])

  const performLogout = useCallback(async (shouldBroadcast: boolean) => {
    clearAllTokens()
    clearTokenTiming()
    dispatch({ type: 'LOGOUT' })

    if (shouldBroadcast) {
      await broadcastLogout()
    }
  }, [clearTokenTiming])

  const refreshCore = useCallback(async (reason: 'manual' | 'proactive' | 'lifecycle' | 'bootstrap') => {
    const currentState = stateRef.current
    if (!currentState.isAuthenticated && reason !== 'bootstrap') {
      return
    }

    if (currentState.isRefreshing) {
      return
    }

    const refreshToken = getRefreshToken()
    if (clientType !== 'web' && !refreshToken) {
      if (reason !== 'proactive' && reason !== 'lifecycle') {
        await performLogout(true)
      }
      return
    }

    let attempts = 0
    while (attempts < 2) {
      try {
        const result = await refresh(refreshToken)
        applyTokenUpdate({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt,
        })

        await broadcastTokens(result.accessToken, result.refreshToken, result.expiresAt)

        const user = await me()
        dispatch({ type: 'SET_USER', payload: user })
        return
      } catch (error) {
        const authError = error as ApiError
        const isTransient = authError.status === 0

        if ((reason === 'proactive' || reason === 'lifecycle') && isTransient && attempts === 0) {
          attempts += 1
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, NETWORK_RETRY_DELAY_MS)
          })
          continue
        }

        if (authError.status === 401 || authError.errorCode === 'invalid_refresh_token') {
          await performLogout(true)
          return
        }

        if (reason === 'proactive' || reason === 'lifecycle') {
          if (stateRef.current.accessTokenExpiresAtMs && schedulerRef.current) {
            const futureExpiry = Date.now() + proactiveRefreshPolicy.leadTimeMs + proactiveRefreshPolicy.minIntervalMs
            const { nextRefreshAtMs } = schedulerRef.current.reschedule(futureExpiry)
            dispatch({
              type: 'SET_TOKEN_TIMING',
              payload: {
                accessTokenExpiresAtMs: stateRef.current.accessTokenExpiresAtMs,
                nextRefreshAtMs,
              },
            })
          }
          return
        }

        throw error
      }
    }
  }, [applyTokenUpdate, clientType, performLogout])

  const runRefresh = useCallback((reason: 'manual' | 'proactive' | 'lifecycle' | 'bootstrap') => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current
    }

    const promise = refreshCore(reason).finally(() => {
      refreshInFlightRef.current = null
    })

    refreshInFlightRef.current = promise
    return promise
  }, [refreshCore])

  useEffect(() => {
    schedulerRef.current = createProactiveRefreshScheduler({
      leadTimeMs: proactiveRefreshPolicy.leadTimeMs,
      jitterMs: proactiveRefreshPolicy.jitterMs,
      minIntervalMs: proactiveRefreshPolicy.minIntervalMs,
      onTrigger: () => {
        void runRefresh('proactive')
      },
    })

    return () => {
      schedulerRef.current?.cancel()
      schedulerRef.current = null
    }
  }, [runRefresh])

  useEffect(() => {
    const teardown = setupInterceptors({
      clientType,
      getAccessToken,
      getRefreshToken,
      setAccessToken,
      setRefreshToken,
      clearAllTokens,
      onTokenUpdate: (update) => {
        applyTokenUpdate(update)
      },
      onAuthFailure: () => {
        void performLogout(false)
      },
      onRefreshStateChange: (isRefreshing) => {
        dispatch({ type: 'SET_REFRESHING', payload: isRefreshing })
      },
    })

    return teardown
  }, [applyTokenUpdate, clientType, performLogout])

  useEffect(() => {
    const unsubscribe = subscribeAuthChannel((message) => {
      if (message.type === 'logout') {
        void performLogout(false)
        return
      }

      if (!message.accessToken) {
        return
      }

      applyTokenUpdate({
        accessToken: message.accessToken,
        refreshToken: message.refreshToken,
        expiresAt: message.expiresAt,
      })

      void me()
        .then((user) => {
          dispatch({ type: 'SET_USER', payload: user })
        })
        .catch(() => {
          void performLogout(false)
        })
    })

    return unsubscribe
  }, [applyTokenUpdate, performLogout])

  useEffect(() => {
    async function bootstrap() {
      const accessToken = getAccessToken()

      if (accessToken) {
        scheduleTokenTiming(null, accessToken)
      }

      if (!accessToken && clientType !== 'web') {
        dispatch({ type: 'BOOTSTRAP_DONE' })
        return
      }

      try {
        if (!accessToken && clientType === 'web') {
          await runRefresh('bootstrap')
        }

        const user = await me()
        dispatch({ type: 'SET_USER', payload: user })
      } catch {
        await performLogout(false)
      } finally {
        dispatch({ type: 'BOOTSTRAP_DONE' })
      }
    }

    void bootstrap()
  }, [clientType, performLogout, runRefresh, scheduleTokenTiming])

  useEffect(() => {
    const triggerIfNeeded = () => {
      if (!proactiveRefreshPolicy.enabled) {
        return
      }

      const expiresAt = stateRef.current.accessTokenExpiresAtMs
      if (!expiresAt) {
        return
      }

      const now = Date.now()
      const shouldRefresh = expiresAt - now <= proactiveRefreshPolicy.leadTimeMs
      if (shouldRefresh) {
        void runRefresh('lifecycle')
      }
    }

    const onVisibilityChange = () => {
      if (!document.hidden) {
        triggerIfNeeded()
      }
    }

    const onFocus = () => {
      triggerIfNeeded()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onFocus)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onFocus)
    }
  }, [runRefresh])

  const login = useCallback(async ({ loginName, password }: LoginInput): Promise<AuthUser> => {
    const result = await loginRequest({ loginName, password })

    applyTokenUpdate({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
    })

    await broadcastTokens(result.accessToken, result.refreshToken, result.expiresAt)

    const user = await me()
    dispatch({ type: 'LOGIN_SUCCESS', payload: user })
    return user
  }, [applyTokenUpdate])

  const logout = useCallback(async (): Promise<void> => {
    const refreshToken = getRefreshToken()
    try {
      await logoutRequest(refreshToken)
    } finally {
      await performLogout(true)
    }
  }, [performLogout])

  const refreshNow = useCallback(async (): Promise<void> => {
    await runRefresh('manual')
  }, [runRefresh])

  const value: AuthContextValue = useMemo(
    () => ({
      ...state,
      login,
      logout,
      refreshNow,
      clientType,
    }),
    [state, clientType, login, logout, refreshNow],
  )

  return createElement(AuthContext.Provider, { value }, children)
}
