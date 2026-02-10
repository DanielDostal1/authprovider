CREATE OR REPLACE FUNCTION auth._cleanup_refresh_tokens(_older_than INTERVAL)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    _deleted BIGINT;
BEGIN
    WITH deleted_rows AS (
        DELETE FROM auth.auth_refresh_tokens
        WHERE expires_at < NOW() - _older_than
        RETURNING 1
    )
    SELECT COUNT(*)
    INTO _deleted
    FROM deleted_rows;

    RETURN _deleted;
END;
$$;
