import type { ReactNode } from 'react'
import { createElement, useEffect, useMemo, useReducer } from 'react'
import { setupInterceptors } from '../api/interceptors'
import { AuthContext } from './authContext'
import { getClientType, login as loginRequest, logout as logoutRequest, me, refresh } from './authService'
import { broadcastLogout, broadcastTokens, subscribeAuthChannel } from './authChannel'
import {
  clearAllTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from '../utils/tokenStorage'
import type { AuthContextValue, AuthUser, LoginInput } from './types'

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isBootstrapping: boolean
  isRefreshing: boolean
}

type AuthAction =
  | { type: 'LOGIN_SUCCESS'; payload: AuthUser }
  | { type: 'SET_USER'; payload: AuthUser }
  | { type: 'SET_REFRESHING'; payload: boolean }
  | { type: 'BOOTSTRAP_DONE' }
  | { type: 'LOGOUT' }

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isBootstrapping: true,
  isRefreshing: false,
}

function reducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
      }
    case 'SET_USER':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
      }
    case 'SET_REFRESHING':
      return {
        ...state,
        isRefreshing: action.payload,
      }
    case 'BOOTSTRAP_DONE':
      return {
        ...state,
        isBootstrapping: false,
      }
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isRefreshing: false,
      }
    default:
      return state
  }
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const clientType = getClientType()

  useEffect(() => {
    const teardown = setupInterceptors({
      clientType,
      getAccessToken,
      getRefreshToken,
      setAccessToken,
      setRefreshToken,
      clearAllTokens,
      onAuthFailure: () => {
        dispatch({ type: 'LOGOUT' })
      },
      onRefreshStateChange: (isRefreshing) => {
        dispatch({ type: 'SET_REFRESHING', payload: isRefreshing })
      },
    })

    return teardown
  }, [clientType])

  useEffect(() => {
    const unsubscribe = subscribeAuthChannel((message) => {
      if (message.type === 'logout') {
        clearAllTokens()
        dispatch({ type: 'LOGOUT' })
        return
      }

      if (!message.accessToken) {
        return
      }

      setAccessToken(message.accessToken)
      if (message.refreshToken) {
        setRefreshToken(message.refreshToken)
      }

      void me()
        .then((user) => {
          dispatch({ type: 'SET_USER', payload: user })
        })
        .catch(() => {
          clearAllTokens()
          dispatch({ type: 'LOGOUT' })
        })
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    async function bootstrap() {
      const accessToken = getAccessToken()

      if (!accessToken && clientType !== 'web') {
        dispatch({ type: 'BOOTSTRAP_DONE' })
        return
      }

      try {
        if (!accessToken && clientType === 'web') {
          const refreshed = await refresh(getRefreshToken())
          if (refreshed.accessToken) {
            setAccessToken(refreshed.accessToken)
          }
          if (refreshed.refreshToken) {
            setRefreshToken(refreshed.refreshToken)
          }
        }

        const user = await me()
        dispatch({ type: 'SET_USER', payload: user })
      } catch {
        clearAllTokens()
        dispatch({ type: 'LOGOUT' })
      } finally {
        dispatch({ type: 'BOOTSTRAP_DONE' })
      }
    }

    void bootstrap()
  }, [clientType])

  const login = async ({ loginName, password }: LoginInput): Promise<AuthUser> => {
    const result = await loginRequest({ loginName, password })

    if (result.accessToken) {
      setAccessToken(result.accessToken)
    }
    if (result.refreshToken) {
      setRefreshToken(result.refreshToken)
    }

    broadcastTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken })

    const user = await me()
    dispatch({ type: 'LOGIN_SUCCESS', payload: user })
    return user
  }

  const logout = async (): Promise<void> => {
    const refreshToken = getRefreshToken()
    try {
      await logoutRequest(refreshToken)
    } finally {
      clearAllTokens()
      broadcastLogout()
      dispatch({ type: 'LOGOUT' })
    }
  }

  const refreshNow = async (): Promise<void> => {
    const refreshToken = getRefreshToken()
    const result = await refresh(refreshToken)

    if (result.accessToken) {
      setAccessToken(result.accessToken)
    }
    if (result.refreshToken) {
      setRefreshToken(result.refreshToken)
    }

    broadcastTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken })

    const user = await me()
    dispatch({ type: 'SET_USER', payload: user })
  }

  const value: AuthContextValue = useMemo(
    () => ({
      ...state,
      login,
      logout,
      refreshNow,
      clientType,
    }),
    [state, clientType],
  )

  return createElement(AuthContext.Provider, { value }, children)
}
