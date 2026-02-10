import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export function HomePage() {
  const { user, isRefreshing } = useAuth()

  return (
    <section className="panel">
      <h2>Welcome</h2>
      <p>This route is protected by `ProtectedRoute` and the JWT access token.</p>
      {user ? (
        <p>
          Logged in as <strong>{user.login_name}</strong> (id: {user.user_id}).
        </p>
      ) : null}
      <p>Refresh in progress: {isRefreshing ? 'yes' : 'no'}.</p>
      <Link to="/profile">Open profile</Link>
    </section>
  )
}
