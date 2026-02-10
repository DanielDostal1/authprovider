CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.auth_refresh_tokens (
    refresh_token_id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users_schema.users(user_id),
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    issued_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITHOUT TIME ZONE NULL,
    family_id UUID NOT NULL,
    client_type VARCHAR(32) NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_auth_refresh_tokens_user_id
    ON auth.auth_refresh_tokens(user_id);

CREATE INDEX IF NOT EXISTS ix_auth_refresh_tokens_expires_at
    ON auth.auth_refresh_tokens(expires_at);

CREATE INDEX IF NOT EXISTS ix_auth_refresh_tokens_family_id
    ON auth.auth_refresh_tokens(family_id);
