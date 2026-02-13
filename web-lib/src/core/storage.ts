import type { AuthStorageAdapter } from './types'

function noop() {
  return null
}

export function memoryStorage(): AuthStorageAdapter {
  let accessToken: string | null = null
  let refreshToken: string | null = null

  return {
    getAccessToken: () => accessToken,
    setAccessToken: (value) => {
      accessToken = value
    },
    clearAccessToken: () => {
      accessToken = null
    },
    getRefreshToken: () => refreshToken,
    setRefreshToken: (value) => {
      refreshToken = value
    },
    clearRefreshToken: () => {
      refreshToken = null
    },
  }
}

export function localStorageStorage(prefix = 'auth'): AuthStorageAdapter {
  const accessKey = `${prefix}.access_token`
  const refreshKey = `${prefix}.refresh_token`

  const read = (key: string) => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  }

  const write = (key: string, value: string | null) => {
    try {
      if (value) {
        window.localStorage.setItem(key, value)
        return
      }

      window.localStorage.removeItem(key)
    } catch {
      noop()
    }
  }

  return {
    getAccessToken: () => read(accessKey),
    setAccessToken: (value) => write(accessKey, value),
    clearAccessToken: () => write(accessKey, null),
    getRefreshToken: () => read(refreshKey),
    setRefreshToken: (value) => write(refreshKey, value),
    clearRefreshToken: () => write(refreshKey, null),
  }
}
