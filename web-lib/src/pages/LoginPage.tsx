import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import type { ApiError, LoginInput } from '../auth/types'

const errorMessages: Record<string, string> = {
  invalid_request: 'Please provide both login name and password.',
  invalid_credentials: 'The login name or password is incorrect.',
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isAuthenticated, isBootstrapping, clientType } = useAuth()

  const [form, setForm] = useState<LoginInput>({ loginName: 'demo', password: 'secret' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!isBootstrapping && isAuthenticated) {
    const target = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/profile'
    return <Navigate to={target} replace />
  }

  const handleChange = (field: keyof LoginInput) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await login(form)
      navigate('/profile', { replace: true })
    } catch (loginError) {
      const err = loginError as ApiError
      setError(errorMessages[err.errorCode] ?? `Login failed (${err.errorCode ?? 'unknown'})`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="panel auth-panel">
      <h2>Sign in</h2>
      <p>
        This client runs in <strong>{clientType}</strong> mode.
      </p>
      <form onSubmit={handleSubmit} className="stack">
        <label>
          Login Name
          <input
            autoComplete="username"
            value={form.loginName}
            onChange={handleChange('loginName')}
            name="login_name"
          />
        </label>
        <label>
          Password
          <input
            autoComplete="current-password"
            type="password"
            value={form.password}
            onChange={handleChange('password')}
            name="password"
          />
        </label>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
      {error ? <p className="error-text">{error}</p> : null}
    </section>
  )
}
