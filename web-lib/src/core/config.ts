import type {
  AuthClientConfig,
  ClientType,
  EndpointConfig,
  HeaderConfig,
  MultiTabConfig,
  ProactiveRefreshConfig,
  AuthStorageAdapter,
} from './types'

export interface ResolvedAuthClientConfig {
  baseURL: string
  clientType: ClientType
  endpoints: EndpointConfig
  headers: HeaderConfig
  refresh: {
    strategy: 'cookie' | 'body'
    withCredentials: boolean
    retryOn401: boolean
  }
  proactiveRefresh: ProactiveRefreshConfig
  multiTab: MultiTabConfig
  storage: {
    adapter?: AuthStorageAdapter
  }
  hooks: {
    onAuthFailure?: (error?: unknown) => void
    onTokenUpdate?: (tokenInfo: { accessToken: string | null; refreshToken: string | null; expiresAt: string | null }) => void
  }
}

const defaultEndpoints: EndpointConfig = {
  login: '/auth/login',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
  me: '/auth/me',
}

const defaultHeaders: HeaderConfig = {
  clientTypeHeader: 'X-Client-Type',
}

const defaultProactive: ProactiveRefreshConfig = {
  enabled: true,
  leadTimeMs: 60_000,
  jitterMs: 10_000,
  minIntervalMs: 5_000,
}

const defaultMultiTab: MultiTabConfig = {
  enabled: true,
  channelName: 'auth_channel',
  lockKey: 'auth.refresh.lock',
  lockTtlMs: 10_000,
  waitTimeoutMs: 10_000,
}

export function resolveConfig(config: AuthClientConfig): ResolvedAuthClientConfig {
  if (!config.baseURL) {
    throw new Error('baseURL is required')
  }

  const clientType = config.clientType ?? 'mobile'
  const refreshStrategy = config.refresh?.strategy ?? (clientType === 'web' ? 'cookie' : 'body')

  return {
    baseURL: config.baseURL,
    clientType,
    endpoints: { ...defaultEndpoints, ...config.endpoints },
    headers: { ...defaultHeaders, ...config.headers },
    refresh: {
      strategy: refreshStrategy,
      withCredentials: config.refresh?.withCredentials ?? refreshStrategy === 'cookie',
      retryOn401: config.refresh?.retryOn401 ?? true,
    },
    proactiveRefresh: { ...defaultProactive, ...config.proactiveRefresh },
    multiTab: { ...defaultMultiTab, ...config.multiTab },
    storage: {
      adapter: config.storage?.adapter,
    },
    hooks: {
      onAuthFailure: config.hooks?.onAuthFailure,
      onTokenUpdate: config.hooks?.onTokenUpdate,
    },
  }
}
