CREATE OR REPLACE FUNCTION auth._create_refresh_token(
    _user_id INTEGER,
    _token TEXT,
    _expires_at TIMESTAMP WITHOUT TIME ZONE,
    _client_type VARCHAR
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    _new_id BIGINT;
BEGIN
    INSERT INTO auth.auth_refresh_tokens (
        user_id,
        token_hash,
        issued_at,
        expires_at,
        family_id,
        client_type
    )
    VALUES (
        _user_id,
        encode(digest(_token, 'sha256'), 'hex'),
        NOW(),
        _expires_at,
        gen_random_uuid(),
        _client_type
    )
    RETURNING refresh_token_id INTO _new_id;

    RETURN _new_id;
END;
$$;

CREATE OR REPLACE FUNCTION auth._rotate_refresh_token(
    _old_token TEXT,
    _new_token TEXT,
    _new_expires_at TIMESTAMP WITHOUT TIME ZONE
)
RETURNS TABLE (
    status TEXT,
    user_id INTEGER,
    client_type VARCHAR
)
LANGUAGE plpgsql
AS $$
DECLARE
    _old_record auth.auth_refresh_tokens%ROWTYPE;
    _old_hash TEXT;
    _new_hash TEXT;
BEGIN
    _old_hash := encode(digest(_old_token, 'sha256'), 'hex');
    _new_hash := encode(digest(_new_token, 'sha256'), 'hex');

    SELECT *
    INTO _old_record
    FROM auth.auth_refresh_tokens
    WHERE token_hash = _old_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'invalid', NULL::INTEGER, NULL::VARCHAR;
        RETURN;
    END IF;

    IF _old_record.revoked_at IS NOT NULL THEN
        UPDATE auth.auth_refresh_tokens
        SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE family_id = _old_record.family_id;

        RETURN QUERY SELECT 'reuse', NULL::INTEGER, _old_record.client_type;
        RETURN;
    END IF;

    IF _old_record.expires_at <= NOW() THEN
        RETURN QUERY SELECT 'invalid', NULL::INTEGER, _old_record.client_type;
        RETURN;
    END IF;

    UPDATE auth.auth_refresh_tokens
    SET revoked_at = NOW()
    WHERE refresh_token_id = _old_record.refresh_token_id;

    INSERT INTO auth.auth_refresh_tokens (
        user_id,
        token_hash,
        issued_at,
        expires_at,
        revoked_at,
        family_id,
        client_type
    )
    VALUES (
        _old_record.user_id,
        _new_hash,
        NOW(),
        _new_expires_at,
        NULL,
        _old_record.family_id,
        _old_record.client_type
    );

    RETURN QUERY SELECT 'ok', _old_record.user_id, _old_record.client_type;
END;
$$;

CREATE OR REPLACE FUNCTION auth._revoke_refresh_token(
    _token TEXT,
    _revoke_family BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    _target auth.auth_refresh_tokens%ROWTYPE;
    _token_hash TEXT;
BEGIN
    _token_hash := encode(digest(_token, 'sha256'), 'hex');

    SELECT *
    INTO _target
    FROM auth.auth_refresh_tokens
    WHERE token_hash = _token_hash;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF _revoke_family THEN
        UPDATE auth.auth_refresh_tokens
        SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE family_id = _target.family_id;
    ELSE
        UPDATE auth.auth_refresh_tokens
        SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE refresh_token_id = _target.refresh_token_id;
    END IF;

    RETURN TRUE;
END;
$$;
