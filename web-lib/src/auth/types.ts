export interface AuthUser {
  user_id: number
  login_name: string
  is_active: boolean
}

export interface TokenResponse {
  accessToken: string | null
  refreshToken: string | null
  expiresAt: string | null
}

export interface TokenUpdate {
  accessToken: string | null
  refreshToken: string | null
  expiresAt: string | null
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

export interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isBootstrapping: boolean
  isRefreshing: boolean
  accessTokenExpiresAtMs: number | null
  nextRefreshAtMs: number | null
  clientType: string
  login: (input: LoginInput) => Promise<AuthUser>
  logout: () => Promise<void>
  refreshNow: () => Promise<void>
}
