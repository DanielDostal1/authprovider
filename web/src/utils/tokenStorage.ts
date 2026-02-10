const ACCESS_TOKEN_KEY = 'auth.access_token'
const REFRESH_TOKEN_KEY = 'auth.refresh_token'

let memoryAccessToken: string | null = null
let memoryRefreshToken: string | null = null

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value) {
      window.localStorage.setItem(key, value)
      return
    }

    window.localStorage.removeItem(key)
  } catch {
    // ignore storage errors in private or restricted mode
  }
}

export function getAccessToken() {
  if (memoryAccessToken) {
    return memoryAccessToken
  }

  memoryAccessToken = readStorage(ACCESS_TOKEN_KEY)
  return memoryAccessToken
}

export function setAccessToken(value: string | null) {
  memoryAccessToken = value ?? null
  writeStorage(ACCESS_TOKEN_KEY, memoryAccessToken)
}

export function clearAccessToken() {
  setAccessToken(null)
}

export function getRefreshToken() {
  if (memoryRefreshToken) {
    return memoryRefreshToken
  }

  memoryRefreshToken = readStorage(REFRESH_TOKEN_KEY)
  return memoryRefreshToken
}

export function setRefreshToken(value: string | null) {
  memoryRefreshToken = value ?? null
  writeStorage(REFRESH_TOKEN_KEY, memoryRefreshToken)
}

export function clearRefreshToken() {
  setRefreshToken(null)
}

export function clearAllTokens() {
  clearAccessToken()
  clearRefreshToken()
}
