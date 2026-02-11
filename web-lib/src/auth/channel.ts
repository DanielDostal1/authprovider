import { BroadcastChannel } from 'broadcast-channel'

export type AuthChannelMessage =
  | { type: 'tokens'; accessToken: string | null; refreshToken: string | null; expiresAt: string | null }
  | { type: 'logout' }

const CHANNEL_NAME = 'auth_channel'
const REFRESH_LOCK_KEY = 'auth.refresh.lock'
const REFRESH_LOCK_TTL_MS = 10000
const tabId = `${Date.now()}-${Math.random().toString(16).slice(2)}`

const authChannel = new BroadcastChannel<AuthChannelMessage>(CHANNEL_NAME)

function parseLock(raw: string | null): { owner: string; expiresAt: number } | null {
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as { owner: string; expiresAt: number }
  } catch {
    return null
  }
}

export function subscribeAuthChannel(listener: (message: AuthChannelMessage) => void) {
  const handler = (message: AuthChannelMessage) => listener(message)
  authChannel.addEventListener('message', handler)

  return () => {
    authChannel.removeEventListener('message', handler)
  }
}

export async function broadcastTokens(accessToken: string | null, refreshToken: string | null, expiresAt: string | null) {
  await authChannel.postMessage({ type: 'tokens', accessToken, refreshToken, expiresAt })
}

export async function broadcastLogout() {
  await authChannel.postMessage({ type: 'logout' })
}

export function waitForChannelMessage(timeoutMs: number) {
  return new Promise<AuthChannelMessage | null>((resolve) => {
    const unsubscribe = subscribeAuthChannel((message) => {
      clearTimeout(timeoutId)
      unsubscribe()
      resolve(message)
    })

    const timeoutId = window.setTimeout(() => {
      unsubscribe()
      resolve(null)
    }, timeoutMs)
  })
}

export function tryAcquireRefreshLock() {
  const now = Date.now()
  const existing = parseLock(window.localStorage.getItem(REFRESH_LOCK_KEY))

  if (existing && existing.expiresAt > now && existing.owner !== tabId) {
    return false
  }

  const nextLock = {
    owner: tabId,
    expiresAt: now + REFRESH_LOCK_TTL_MS,
  }

  window.localStorage.setItem(REFRESH_LOCK_KEY, JSON.stringify(nextLock))
  const verify = parseLock(window.localStorage.getItem(REFRESH_LOCK_KEY))
  return verify?.owner === tabId
}

export function releaseRefreshLock() {
  const current = parseLock(window.localStorage.getItem(REFRESH_LOCK_KEY))
  if (!current || current.owner !== tabId) {
    return
  }

  window.localStorage.removeItem(REFRESH_LOCK_KEY)
}
