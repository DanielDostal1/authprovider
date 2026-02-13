import { createContext } from 'react'
import type { AuthClient, AuthState } from '../core/types'

export interface AuthReactContextValue {
  client: AuthClient
  state: AuthState
}

export const AuthReactContext = createContext<AuthReactContextValue | null>(null)
