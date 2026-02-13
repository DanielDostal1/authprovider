import { useContext, useMemo } from 'react'
import { AuthReactContext } from './AuthContext'

export function useAuth() {
  const context = useContext(AuthReactContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  const { client, state } = context

  return useMemo(
    () => ({
      ...state,
      login: client.login,
      logout: client.logout,
      refreshNow: client.refreshNow,
      me: client.me,
    }),
    [client, state],
  )
}
