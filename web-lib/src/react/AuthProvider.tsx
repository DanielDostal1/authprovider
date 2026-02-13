import type { ReactNode } from 'react'
import { createElement, useEffect, useState } from 'react'
import type { AuthClient, AuthState } from '../core/types'
import { AuthReactContext } from './AuthContext'

interface AuthProviderProps {
  client: AuthClient
  children: ReactNode
  autoBootstrap?: boolean
}

export function AuthProvider({ client, children, autoBootstrap = true }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>(client.getState())

  useEffect(() => {
    const unsubscribe = client.subscribe((nextState) => {
      setState(nextState)
    })

    if (autoBootstrap) {
      void client.bootstrap()
    }

    return unsubscribe
  }, [autoBootstrap, client])

  return createElement(AuthReactContext.Provider, { value: { client, state } }, children)
}
