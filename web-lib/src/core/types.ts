export type ClientType = 'web' | 'mobile'

export interface AuthUser {
  user_id: number
  login_name: string
  is_active: boolean
}

export interface LoginInput {
  loginName: string
  password: string
}

export interface ApiError {
  status: number
  errorCode: string
  message: string
}

export interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isBootstrapping: boolean
  isRefreshing: boolean
  accessTokenExpiresAtMs: number | null
  nextRefreshAtMs: number | null
  clientType: ClientType
}

export interface EndpointConfig {
  login: string
  refresh: string
  logout: string
  me: string
}

export interface HeaderConfig {
  clientTypeHeader: string
}

export interface ProactiveRefreshConfig {
  enabled: boolean
  leadTimeMs: number
  jitterMs: number
  minIntervalMs: number
}

export interface MultiTabConfig {
  enabled: boolean
  channelName: string
  lockKey: string
  lockTtlMs: number
  waitTimeoutMs: number
}

export interface AuthStorageAdapter {
  getAccessToken: () => string | null
  setAccessToken: (value: string | null) => void
  clearAccessToken: () => void
  getRefreshToken: () => string | null
  setRefreshToken: (value: string | null) => void
  clearRefreshToken: () => void
}

export interface AuthClientConfig {
  baseURL: string
  clientType?: ClientType
  endpoints?: Partial<EndpointConfig>
  headers?: Partial<HeaderConfig>
  refresh?: {
    strategy?: 'cookie' | 'body'
    withCredentials?: boolean
    retryOn401?: boolean
  }
  proactiveRefresh?: Partial<ProactiveRefreshConfig>
  multiTab?: Partial<MultiTabConfig>
  storage?: {
    adapter?: AuthStorageAdapter
  }
  hooks?: {
    onAuthFailure?: (error?: unknown) => void
    onTokenUpdate?: (tokenInfo: { accessToken: string | null; refreshToken: string | null; expiresAt: string | null }) => void
  }
}

export interface TokenPayload {
  accessToken: string | null
  refreshToken: string | null
  expiresAt: string | null
}

export interface AuthClient {
  bootstrap: () => Promise<void>
  login: (input: LoginInput) => Promise<AuthUser>
  logout: () => Promise<void>
  refreshNow: () => Promise<void>
  me: () => Promise<AuthUser>
  getState: () => AuthState
  subscribe: (listener: (state: AuthState) => void) => () => void
  destroy: () => void
}
