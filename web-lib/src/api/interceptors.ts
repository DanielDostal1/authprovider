import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import createAuthRefreshInterceptor from 'axios-auth-refresh'
import { http, refreshHttp } from './http'
import {
  broadcastLogout,
  broadcastTokens,
  releaseRefreshLock,
  tryAcquireRefreshLock,
  waitForChannelMessage,
} from '../auth/channel'

interface RefreshResponsePayload {
  access_token?: string
  refresh_token?: string
}

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  skipAuthRefresh?: boolean
}

interface InterceptorOptions {
  clientType: string
  getAccessToken: () => string | null
  getRefreshToken: () => string | null
  setAccessToken: (value: string | null) => void
  setRefreshToken: (value: string | null) => void
  clearAllTokens: () => void
  onAuthFailure?: () => void
  onRefreshStateChange?: (isRefreshing: boolean) => void
}

const CROSS_TAB_WAIT_MS = 10000

function isAuthEndpoint(url?: string) {
  if (!url) {
    return false
  }

  return url.includes('/auth/login') || url.includes('/auth/refresh')
}

export function setupInterceptors({
  clientType,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  clearAllTokens,
  onAuthFailure,
  onRefreshStateChange,
}: InterceptorOptions) {
  const requestInterceptorId = http.interceptors.request.use((config) => {
    const token = getAccessToken()
    const nextConfig = { ...config }
    nextConfig.headers = nextConfig.headers ?? {}

    if (token) {
      nextConfig.headers.Authorization = `Bearer ${token}`
    }

    nextConfig.headers['X-Client-Type'] = clientType

    if (clientType === 'web') {
      nextConfig.withCredentials = true
    }

    return nextConfig
  })

  const refreshInterceptorId = createAuthRefreshInterceptor(
    http,
    async (failedRequest) => {
      const requestConfig = failedRequest.response?.config as RetriableRequestConfig | undefined

      if (!requestConfig || isAuthEndpoint(requestConfig.url)) {
        throw failedRequest
      }

      const refreshToken = getRefreshToken()
      if (clientType !== 'web' && !refreshToken) {
        clearAllTokens()
        await broadcastLogout()
        onAuthFailure?.()
        throw failedRequest
      }

      if (!tryAcquireRefreshLock()) {
        const message = await waitForChannelMessage(CROSS_TAB_WAIT_MS)

        if (message?.type === 'tokens' && message.accessToken) {
          setAccessToken(message.accessToken)
          if (message.refreshToken) {
            setRefreshToken(message.refreshToken)
          }

          requestConfig.headers = requestConfig.headers ?? {}
          requestConfig.headers.Authorization = `Bearer ${message.accessToken}`
          return Promise.resolve()
        }

        clearAllTokens()
        await broadcastLogout()
        onAuthFailure?.()
        throw failedRequest
      }

      onRefreshStateChange?.(true)

      try {
        const payload = clientType === 'mobile' ? { refresh_token: refreshToken } : {}
        const refreshResponse = await refreshHttp.post('/auth/refresh', payload, {
          headers: {
            'X-Client-Type': clientType,
          },
          withCredentials: clientType === 'web',
          skipAuthRefresh: true,
        } as unknown as RetriableRequestConfig)

        const refreshData = refreshResponse.data as RefreshResponsePayload

        const nextAccessToken = refreshData?.access_token
        const nextRefreshToken = refreshData?.refresh_token

        if (!nextAccessToken) {
          throw failedRequest
        }

        setAccessToken(nextAccessToken)
        if (nextRefreshToken) {
          setRefreshToken(nextRefreshToken)
        }

        await broadcastTokens(nextAccessToken, nextRefreshToken ?? null)

        requestConfig.headers = requestConfig.headers ?? {}
        requestConfig.headers.Authorization = `Bearer ${nextAccessToken}`
        return Promise.resolve()
      } catch (error) {
        clearAllTokens()
        await broadcastLogout()
        onAuthFailure?.()
        throw error
      } finally {
        releaseRefreshLock()
        onRefreshStateChange?.(false)
      }
    },
    {
      statusCodes: [401],
      pauseInstanceWhileRefreshing: true,
      shouldRefresh: (error: AxiosError) => {
        const config = error.config as RetriableRequestConfig | undefined
        if (!config) {
          return false
        }

        return !config.skipAuthRefresh && !isAuthEndpoint(config.url)
      },
    },
  )

  return () => {
    http.interceptors.request.eject(requestInterceptorId)
    http.interceptors.response.eject(refreshInterceptorId)
  }
}
