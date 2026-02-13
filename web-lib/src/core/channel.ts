import { BroadcastChannel } from 'broadcast-channel'

export type AuthChannelMessage =
  | { type: 'tokens'; accessToken: string | null; refreshToken: string | null; expiresAt: string | null }
  | { type: 'logout' }

interface MultiTabRuntimeConfig {
  channelName: string
  lockKey: string
  lockTtlMs: number
  waitTimeoutMs: number
}

export function createChannel(config: MultiTabRuntimeConfig) {
  const tabId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const authChannel = new BroadcastChannel<AuthChannelMessage>(config.channelName)

  const subscribe = (listener: (message: AuthChannelMessage) => void) => {
    const handler = (message: AuthChannelMessage) => listener(message)
    authChannel.addEventListener('message', handler)
    return () => {
      authChannel.removeEventListener('message', handler)
    }
  }

  const broadcastTokens = async (accessToken: string | null, refreshToken: string | null, expiresAt: string | null) => {
    await authChannel.postMessage({ type: 'tokens', accessToken, refreshToken, expiresAt })
  }

  const broadcastLogout = async () => {
    await authChannel.postMessage({ type: 'logout' })
  }

  const waitForMessage = () => {
    return new Promise<AuthChannelMessage | null>((resolve) => {
      const unsubscribe = subscribe((message) => {
        clearTimeout(timeoutId)
        unsubscribe()
        resolve(message)
      })

      const timeoutId = window.setTimeout(() => {
        unsubscribe()
        resolve(null)
      }, config.waitTimeoutMs)
    })
  }

  const parseLock = (raw: string | null): { owner: string; expiresAt: number } | null => {
    if (!raw) {
      return null
    }
    try {
      return JSON.parse(raw) as { owner: string; expiresAt: number }
    } catch {
      return null
    }
  }

  const tryAcquireLock = () => {
    const now = Date.now()
    const existing = parseLock(window.localStorage.getItem(config.lockKey))

    if (existing && existing.expiresAt > now && existing.owner !== tabId) {
      return false
    }

    const next = { owner: tabId, expiresAt: now + config.lockTtlMs }
    window.localStorage.setItem(config.lockKey, JSON.stringify(next))
    const verify = parseLock(window.localStorage.getItem(config.lockKey))
    return verify?.owner === tabId
  }

  const releaseLock = () => {
    const current = parseLock(window.localStorage.getItem(config.lockKey))
    if (!current || current.owner !== tabId) {
      return
    }
    window.localStorage.removeItem(config.lockKey)
  }

  const close = async () => {
    await authChannel.close()
  }

  return {
    subscribe,
    broadcastTokens,
    broadcastLogout,
    waitForMessage,
    tryAcquireLock,
    releaseLock,
    close,
  }
}
