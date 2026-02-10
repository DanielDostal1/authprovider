import { Link } from 'react-router-dom'
import { AppRouter } from './router'
import { useAuth } from './auth/useAuth'

function App() {
  const { isAuthenticated, logout, user } = useAuth()

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Auth Client (Library Stack)</h1>
          <p>React + Axios + axios-auth-refresh + broadcast-channel</p>
        </div>
        <nav>
          <Link to="/">Home</Link>
          {isAuthenticated ? <Link to="/profile">Profile</Link> : <Link to="/login">Login</Link>}
          {isAuthenticated ? (
            <button type="button" onClick={() => void logout()}>
              Logout {user ? `(${user.login_name})` : ''}
            </button>
          ) : null}
        </nav>
      </header>
      <main>
        <AppRouter />
      </main>
    </div>
  )
}

export default App
