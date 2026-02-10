import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import type { ApiError } from '../auth/types'

export function ProfilePage() {
  const { user, refreshNow, isRefreshing } = useAuth()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleRefresh = async () => {
    setMessage('')
    setError('')

    try {
      await refreshNow()
      setMessage('Refresh succeeded and profile data reloaded.')
    } catch (refreshError) {
      const err = refreshError as ApiError
      setError(`Refresh failed (${err.errorCode ?? 'unknown'})`)
    }
  }

  return (
    <section className="panel">
      <h2>Profile</h2>
      {user ? (
        <dl className="profile-grid">
          <dt>User ID</dt>
          <dd>{user.user_id}</dd>
          <dt>Login Name</dt>
          <dd>{user.login_name}</dd>
          <dt>Active</dt>
          <dd>{String(user.is_active)}</dd>
        </dl>
      ) : (
        <p>No user loaded.</p>
      )}

      <button type="button" onClick={handleRefresh} disabled={isRefreshing}>
        {isRefreshing ? 'Refreshing...' : 'Refresh now'}
      </button>

      {message ? <p className="ok-text">{message}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </section>
  )
}
