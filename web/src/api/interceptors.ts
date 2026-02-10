import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { http, refreshHttp } from './http'
import {
  broadcastLogout,
  broadcastTokens,
  releaseRefreshLock,
  tryAcquireRefreshLock,
  waitForTokenOrLogout,
} from '../auth/authChannel'

interface RefreshResponsePayload {
  access_token?: string
  refresh_token?: string
}

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

interface QueueItem {
  resolve: (accessToken: string) => void
  reject: (error: unknown) => void
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
  let isRefreshing = false
  let waitingRequests: QueueItem[] = []

  const flushQueue = (error: unknown, accessToken: string | null) => {
    waitingRequests.forEach((item) => {
      if (error || !accessToken) {
        item.reject(error)
        return
      }

      item.resolve(accessToken)
    })

    waitingRequests = []
  }

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

  const responseInterceptorId = http.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as RetriableRequestConfig | undefined
      const status = error.response?.status

      if (!originalRequest || status !== 401 || originalRequest._retry || isAuthEndpoint(originalRequest.url)) {
        throw error
      }

      originalRequest._retry = true

      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          waitingRequests.push({ resolve, reject })
        }).then((newAccessToken) => {
          originalRequest.headers = originalRequest.headers ?? {}
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
          return http(originalRequest)
        })
      }

      const refreshToken = getRefreshToken()
      if (clientType !== 'web' && !refreshToken) {
        clearAllTokens()
        broadcastLogout()
        onAuthFailure?.()
        throw error
      }

      if (!tryAcquireRefreshLock()) {
        const externalMessage = await waitForTokenOrLogout(CROSS_TAB_WAIT_MS)

        if (externalMessage?.type === 'tokens' && externalMessage.accessToken) {
          setAccessToken(externalMessage.accessToken)
          if (externalMessage.refreshToken) {
            setRefreshToken(externalMessage.refreshToken)
          }

          originalRequest.headers = originalRequest.headers ?? {}
          originalRequest.headers.Authorization = `Bearer ${externalMessage.accessToken}`
          return http(originalRequest)
        }

        clearAllTokens()
        broadcastLogout()
        onAuthFailure?.()
        throw error
      }

      isRefreshing = true
      onRefreshStateChange?.(true)

      try {
        const refreshPayload = clientType === 'mobile' ? { refresh_token: refreshToken } : {}
        const refreshResponse = await refreshHttp.post<RefreshResponsePayload>('/auth/refresh', refreshPayload, {
          headers: {
            'X-Client-Type': clientType,
          },
          withCredentials: clientType === 'web',
        })

        const nextAccessToken = refreshResponse.data?.access_token
        const nextRefreshToken = refreshResponse.data?.refresh_token

        if (!nextAccessToken) {
          throw error
        }

        setAccessToken(nextAccessToken)
        if (nextRefreshToken) {
          setRefreshToken(nextRefreshToken)
        }

        broadcastTokens({ accessToken: nextAccessToken, refreshToken: nextRefreshToken ?? null })

        flushQueue(null, nextAccessToken)
        originalRequest.headers = originalRequest.headers ?? {}
        originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`
        return http(originalRequest)
      } catch (refreshError) {
        flushQueue(refreshError, null)
        clearAllTokens()
        broadcastLogout()
        onAuthFailure?.()
        throw refreshError
      } finally {
        isRefreshing = false
        releaseRefreshLock()
        onRefreshStateChange?.(false)
      }
    },
  )

  return () => {
    http.interceptors.request.eject(requestInterceptorId)
    http.interceptors.response.eject(responseInterceptorId)
  }
}
