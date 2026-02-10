import { http } from '../api/http'
import { normalizeApiError } from '../api/normalizeError'
import type { AuthUser, LoginInput, TokenResponse } from './types'

interface AuthTokenResponseDto {
  access_token?: string
  refresh_token?: string
  expires_at?: string
}

const clientType = import.meta.env.VITE_CLIENT_TYPE ?? 'mobile'

export async function login({ loginName, password }: LoginInput): Promise<TokenResponse> {
  try {
    const response = await http.post<AuthTokenResponseDto>(
      '/auth/login',
      {
        login_name: loginName,
        password,
      },
      {
        headers: {
          'X-Client-Type': clientType,
        },
      },
    )

    return {
      accessToken: response.data?.access_token ?? null,
      refreshToken: response.data?.refresh_token ?? null,
      expiresAt: response.data?.expires_at ?? null,
    }
  } catch (error) {
    throw normalizeApiError(error)
  }
}

export async function refresh(refreshToken: string | null): Promise<TokenResponse> {
  try {
    const payload = clientType === 'mobile' ? { refresh_token: refreshToken } : {}
    const response = await http.post<AuthTokenResponseDto>('/auth/refresh', payload, {
      headers: {
        'X-Client-Type': clientType,
      },
      withCredentials: clientType === 'web',
    })

    return {
      accessToken: response.data?.access_token ?? null,
      refreshToken: response.data?.refresh_token ?? null,
      expiresAt: response.data?.expires_at ?? null,
    }
  } catch (error) {
    throw normalizeApiError(error)
  }
}

export async function me(): Promise<AuthUser> {
  try {
    const response = await http.get<AuthUser>('/auth/me')
    return response.data
  } catch (error) {
    throw normalizeApiError(error)
  }
}

export async function logout(refreshToken: string | null): Promise<void> {
  try {
    const payload = clientType === 'mobile' ? { refresh_token: refreshToken } : {}
    await http.post('/auth/logout', payload, {
      withCredentials: clientType === 'web',
    })
  } catch (error) {
    throw normalizeApiError(error)
  }
}

export function getClientType() {
  return clientType
}
