**Auth Design (Draft)**

**Goals**
Token-based auth with short-lived JWT access tokens and opaque refresh tokens stored in the database. Support the following endpoints:
`POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `GET /auth/me`.

**Assumptions**

- There is an existing `users` table: `user_id`, `login_name`, `password_hash`, ...
- `users` table lives in `users_schema` DB schema.
- Database functions exist in schema `auth` (the name of "auth" schema is configurable per project):
    - `_get_auth_user_by_login_name_and_password(_login_name VARCHAR, _password VARCHAR)`
    - `_get_auth_user_by_id(_user_id INTEGER)`
    - Both return a single record on success (e.g., `user_id`, `login_name`, `is_active`, ...) or throw an exception on failure.
- Access tokens are JWTs signed server-side.
- Refresh tokens are random opaque strings stored server-side.
- Clients identify themselves with a custom header (default: `X-Client-Type: web|mobile`) on endpoints that issue refresh tokens.

**Database Changes**
Add a refresh token storage table and indexes to support lookup and revocation.

`auth_refresh_tokens`

- `refresh_token_id` (PK, bigint/uuid)
- `user_id` (FK -> users.user_id, NOT NULL)
- `token_hash` (unique, NOT NULL)
    - Store a hash of the refresh token (never store raw token). Hashing is done inside DB functions.
- `issued_at` (timestamp without time zone, NOT NULL)
- `expires_at` (timestamp without time zone, NOT NULL)
- `revoked_at` (timestamp without time zone, NULL)
- `family_id` (varchar/uuid, NOT NULL)
    - Groups a rotation “family” to detect reuse of older tokens after rotation.
- `client_type` (varchar, NOT NULL)
    - Copied from the request on `/auth/login` and from the old token on `/auth/refresh`.

Schema note:

- `auth_refresh_tokens` table and related functions and their result (composite) types live in `{auth_schema}`.

**Token Properties**

- `access_token`: JWT, short TTL (e.g., 5-15 minutes)
- `refresh_token`: opaque random string, longer TTL (e.g., 7-30 days)
- Rotate refresh tokens on every use.
- Store only a hash of refresh tokens in DB.
- JWT signing algorithm: `RS256`.
- JWT claims: `sub`, `iat`, `exp`, `iss`, `aud`.

**Client Differentiation**

Clients MUST send a custom header on endpoints that issue refresh tokens (recommended default):

- `X-Client-Type: web`
- `X-Client-Type: mobile`

`X-Client-Type` is required on `/auth/login` and `/auth/refresh`, optional on `/auth/logout`, and not required on `/auth/me`.

**Token Delivery Rules**

- **If `X-Client-Type == 'web'`:**
- The server generates the `refresh_token`.
- It sets a `Set-Cookie` header with `HttpOnly`, `Secure`, and `SameSite=Strict` (or `Lax` or `None`).
- The JSON response body contains **only** the `access_token` and `expires_at`.

- **If `X-Client-Type == 'mobile'`:**
- The server generates the `refresh_token`.
- The JSON response body contains **both** the `access_token` and the `refresh_token`, plus `expires_at`.
- No cookie is set.

**Refresh Token Lookup Priority**

For `/auth/refresh` and `/auth/logout`, the server MUST search for the refresh token in this order:

1. **Cookies:** check for the configured refresh token cookie name (e.g., `refresh_token`).
2. **Request Body:** if not in cookies, parse JSON body for `refresh_token`.
3. **Header Fallback:** if still not found, check `X-Refresh-Token`.

**Endpoint Steps**

`POST /auth/login {login_name, password}`

1. Validate `login_name` and `password` presence.
2. Call `{auth_schema}._get_auth_user_by_login_name_and_password(...)`.
3. If the function throws, return `403 {error}`.
4. If `is_active = false`, return `403 {error}`.
5. Create JWT access token for `user_id` with expiry.
6. Generate refresh token string; store it via DB function `{auth_schema}._create_refresh_token(...)` (hashing is internal) with expiry and `client_type`.
    - `family_id` and token hashing are generated internally by the DB function on creation.
7. Deliver refresh token per **Token Delivery Rules** (cookie for web, JSON for mobile).
8. Return response body per **Token Delivery Rules** with `access_token` and `expires_at`.

`POST /auth/logout` (refresh token required)

1. **Extraction:** try cookie, then JSON body, then header fallback.
2. If token missing, return `204`.
3. Pass the refresh token to DB revoke function.
4. Mark token as revoked (`revoked_at = now`) inside the DB function.
    - Optional: to revoke the entire family, call `{auth_schema}._revoke_refresh_token(_token, true)` instead of single-token revoke.
5. If web client, clear the `refresh_token` cookie.
6. Return `204`.

`POST /auth/refresh` (refresh token required)

1. **Extraction:** try cookie, then JSON body, then header fallback.
2. If token missing, return `403 {error}`.
3. Pass token to DB lookup/rotation function (hashing is internal).
4. Validate: token exists, not revoked, not expired.
5. Create new JWT access token for `user_id`.
6. Rotate refresh token: create a new refresh token record and mark old one `revoked_at`.
    - If the old token is already revoked, treat it as reuse: revoke the entire `family_id` and return error.
    - Because family revoke must be outside the rotation transaction, on reuse error call `{auth_schema}._revoke_refresh_token(_token, true)` in a separate transaction.
    - Copy `client_type` from the old token into the new token record.
7. Deliver refresh token per **Token Delivery Rules** (cookie for web, JSON for mobile).
8. Return response body per **Token Delivery Rules** with `access_token` and `expires_at`.

`GET /auth/me + header: Authorization: Bearer <access_token>`

1. Read access token from header; if missing, return `401 {}`.
2. Verify JWT signature and expiry.
3. Extract `user_id` from token; call `{auth_schema}._get_auth_user_by_id(...)`.
4. Return `200 {user_id, ...}`.

**HTTP response status codes**

`POST /auth/login`

- **200 OK:** Credentials are valid; tokens are returned per **Token Delivery Rules** with `access_token` and `expires_at`.
- **401 Unauthorized:** Invalid login_name or password.
- **400 Bad Request:** Missing required fields (login_name or password).

`POST /auth/refresh`

- **200 OK:** Refresh token is valid; tokens are returned per **Token Delivery Rules** with `access_token` and `expires_at`.
- **401 Unauthorized:** The refresh token is expired, revoked, or has an invalid signature.
- **400 Bad Request:** Refresh token is missing from the request.

`GET /auth/me`

- **200 OK:** Access token is valid; user profile data is returned.
- **401 Unauthorized:** Access token is missing, expired, or tampered with.
- **404 Not Found:** The token is valid, but the user ID inside the token no longer exists in the database.

`POST /auth/logout`

- **204 No Content:** The logout was successful, and the refresh token has been deleted/revoked.
- **400 Bad Request:** No refresh token was provided to invalidate.

**Important Missing Aspects / Decisions**

- **Password hashing**: handled internally by `{auth_schema}._get_auth_user_by_login_name_and_password(...)`.
- **JWT signing**: `RS256` (define key storage and rotation plan).
- **Token claims**: `sub`, `iat`, `exp`, `iss`, `aud`.
- **Cross-domain support**: enable CORS for an allowlist of origins, or all (`*`) if acceptable. If cookies are used cross-site, use `SameSite=None` + `Secure` and include CSRF protection.
- **Rate limiting**: deferred.
- **Account status**: `is_active` is returned by the DB function; treat as login failure when FALSE.
- **Revocation strategy**: access tokens are not stored server-side, so they remain valid until expiry. Revocation happens via refresh-token records in `auth_refresh_tokens`, which can be revoked immediately. This is why access tokens should be short-lived.
- **CSRF**: require a CSRF token for cookie-based `/auth/refresh` and `/auth/logout` when cross-site cookies are enabled.
- **Logging/audit**: deferred.
- **Error responses**: use a generic error payload and status for login failures (e.g., always `403 {error: \"invalid_credentials\"}`) so attackers can’t distinguish “unknown user” vs “bad password”.

**Maintenance**

- Cleanup expired refresh tokens with a safety buffer:
    - `SELECT {auth_schema}._cleanup_refresh_tokens(interval '72 hours');`
