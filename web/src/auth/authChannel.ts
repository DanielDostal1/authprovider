import type { TokenResponse } from './types'

type AuthChannelMessage =
  | { type: 'tokens'; accessToken: string | null; refreshToken: string | null }
  | { type: 'logout' }

type AuthChannelListener = (message: AuthChannelMessage) => void

const CHANNEL_NAME = 'auth_channel'
const REFRESH_LOCK_KEY = 'auth.refresh.lock'
const REFRESH_LOCK_TTL_MS = 10000

const tabId = `${Date.now()}-${Math.random().toString(16).slice(2)}`

let channel: BroadcastChannel | null = null
const listeners = new Set<AuthChannelListener>()

if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  channel = new BroadcastChannel(CHANNEL_NAME)
  channel.onmessage = (event: MessageEvent<AuthChannelMessage>) => {
    listeners.forEach((listener) => listener(event.data))
  }
}

function postMessage(message: AuthChannelMessage) {
  if (!channel) {
    return
  }

  channel.postMessage(message)
}

export function subscribeAuthChannel(listener: AuthChannelListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function broadcastTokens(tokens: Pick<TokenResponse, 'accessToken' | 'refreshToken'>) {
  postMessage({
    type: 'tokens',
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  })
}

export function broadcastLogout() {
  postMessage({ type: 'logout' })
}

export function waitForTokenOrLogout(timeoutMs: number) {
  return new Promise<AuthChannelMessage | null>((resolve) => {
    const unsubscribe = subscribeAuthChannel((message) => {
      if (message.type === 'tokens' || message.type === 'logout') {
        clearTimeout(timeout)
        unsubscribe()
        resolve(message)
      }
    })

    const timeout = window.setTimeout(() => {
      unsubscribe()
      resolve(null)
    }, timeoutMs)
  })
}

interface RefreshLock {
  owner: string
  expiresAt: number
}

function parseLock(raw: string | null): RefreshLock | null {
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as RefreshLock
  } catch {
    return null
  }
}

export function tryAcquireRefreshLock() {
  const now = Date.now()
  const existing = parseLock(window.localStorage.getItem(REFRESH_LOCK_KEY))

  if (existing && existing.expiresAt > now && existing.owner !== tabId) {
    return false
  }

  const nextLock: RefreshLock = {
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
