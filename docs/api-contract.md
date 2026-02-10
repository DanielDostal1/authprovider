# Auth API Contract

## Headers
- `X-Client-Type`: required on `POST /auth/login` and `POST /auth/refresh`, values: `web` or `mobile`.
- `Authorization: Bearer <access_token>`: required on `GET /auth/me`.

## Endpoints

### POST /auth/login
Request:
```json
{
  "login_name": "demo",
  "password": "secret"
}
```

Success (`X-Client-Type: web`):
```json
{
  "access_token": "<jwt>",
  "expires_at": "2026-02-09T15:28:00Z"
}
```
Refresh token is returned as cookie.

Success (`X-Client-Type: mobile`):
```json
{
  "access_token": "<jwt>",
  "refresh_token": "<opaque>",
  "expires_at": "2026-02-09T15:28:00Z"
}
```

Errors:
- `400 { "error": "invalid_request" }`
- `401 { "error": "invalid_credentials" }`

### POST /auth/refresh
Refresh token lookup order:
1. Refresh cookie
2. Body `refresh_token`
3. Header `X-Refresh-Token`

Request body (optional when cookie/header is used):
```json
{
  "refresh_token": "<opaque>"
}
```

Success (`web`):
```json
{
  "access_token": "<jwt>",
  "expires_at": "2026-02-09T15:40:00Z"
}
```

Success (`mobile`):
```json
{
  "access_token": "<jwt>",
  "refresh_token": "<new opaque>",
  "expires_at": "2026-02-09T15:40:00Z"
}
```

Errors:
- `400 { "error": "invalid_request" }`
- `401 { "error": "invalid_refresh_token" }`

### POST /auth/logout
Refresh token lookup order is the same as refresh.
Always returns `204`.

### GET /auth/me
Success:
```json
{
  "user_id": 1,
  "login_name": "demo",
  "is_active": true
}
```

Errors:
- `401 { "error": "unauthorized" }`
- `404 { "error": "user_not_found" }`
