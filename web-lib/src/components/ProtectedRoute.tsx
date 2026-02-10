import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation()
  const { isAuthenticated, isBootstrapping } = useAuth()

  if (isBootstrapping) {
    return <section className="panel">Checking session...</section>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <>{children}</>
}
