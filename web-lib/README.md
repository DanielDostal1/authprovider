# @authprovider/auth-client

Configurable authentication client with:

- Axios request auth headers
- Automatic token refresh with `axios-auth-refresh`
- Proactive refresh before access token expiry
- Cross-tab synchronization via `broadcast-channel`
- Optional React bindings (`AuthProvider`, `useAuth`)

This package is built for backend contracts that expose:

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

and return token payloads containing `access_token`, optional `refresh_token`, and `expires_at`.

## Install

```bash
npm install @authprovider/auth-client
```

## Core Usage (Framework-agnostic)

```ts
import { createAuthClient } from '@authprovider/auth-client'

const auth = createAuthClient({
  baseURL: 'http://localhost:5002',
  clientType: 'mobile',
})

const http = auth.getHttpClient()

await auth.bootstrap()
await auth.login({ loginName: 'demo', password: 'secret' })

const user = await auth.me()
console.log(user)
```

You can use `auth.getHttpClient()` as your app's API client. It is already configured with:

- auth request headers
- automatic 401 refresh handling
- refresh queueing for concurrent requests

## React Usage

```tsx
import { createAuthClient } from '@authprovider/auth-client'
import { AuthProvider, useAuth } from '@authprovider/auth-client/react'

const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  clientType: 'mobile',
})

function LoginButton() {
  const { login, isAuthenticated } = useAuth()

  if (isAuthenticated) {
    return null
  }

  return (
    <button onClick={() => void login({ loginName: 'demo', password: 'secret' })}>
      Login
    </button>
  )
}

function Root() {
  return (
    <AuthProvider client={authClient}>
      <LoginButton />
    </AuthProvider>
  )
}
```

`AuthProvider` bootstraps automatically by default. Set `autoBootstrap={false}` if you want full manual control.

## Configuration

```ts
import { createAuthClient, localStorageStorage } from '@authprovider/auth-client'

const auth = createAuthClient({
  baseURL: 'https://api.example.com',
  clientType: 'web',

  endpoints: {
    login: '/auth/login',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    me: '/auth/me',
  },

  headers: {
    clientTypeHeader: 'X-Client-Type',
  },

  refresh: {
    strategy: 'cookie',
    withCredentials: true,
    retryOn401: true,
  },

  proactiveRefresh: {
    enabled: true,
    leadTimeMs: 60_000,
    jitterMs: 10_000,
    minIntervalMs: 5_000,
  },

  multiTab: {
    enabled: true,
    channelName: 'auth_channel',
    lockKey: 'auth.refresh.lock',
    lockTtlMs: 10_000,
    waitTimeoutMs: 10_000,
  },

  storage: {
    adapter: localStorageStorage('myapp.auth'),
  },

  hooks: {
    onAuthFailure: (error) => {
      console.error('Auth failed', error)
    },
    onTokenUpdate: (tokenInfo) => {
      console.log('Token update', tokenInfo.expiresAt)
    },
  },
})
```

## Storage Adapters

Built-in helpers:

- `memoryStorage()` (default)
- `localStorageStorage(prefix?)`

You can provide your own `AuthStorageAdapter` if needed.

## API Surface

From `@authprovider/auth-client`:

- `createAuthClient(config)`
- `memoryStorage()`
- `localStorageStorage(prefix?)`

Client methods:

- `bootstrap()`
- `login({ loginName, password })`
- `logout()`
- `refreshNow()`
- `me()`
- `getHttpClient()`
- `getRefreshHttpClient()`
- `getState()`
- `subscribe(listener)`
- `destroy()`

From `@authprovider/auth-client/react`:

- `AuthProvider`
- `useAuth`

## Security Notes

- For browser apps, prefer `clientType: 'web'` with cookie refresh strategy when your backend supports HttpOnly refresh cookies.
- Access tokens are automatically refreshed before expiry when proactive refresh is enabled.
- 401-based refresh fallback remains active for race conditions and browser sleep/wake scenarios.

## Development

```bash
npm run lint
npm run typecheck
npm run build
npm run audit
```
