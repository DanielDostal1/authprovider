using System.Data;
using Dapper;
using Npgsql;

namespace AuthProvider.Api.Data;

public sealed class AuthRepository(DbConnectionFactory connectionFactory, IConfiguration configuration)
{
    private readonly DbConnectionFactory _connectionFactory = connectionFactory;
    private readonly string _authSchema = configuration.GetSection("Auth").GetValue<string>("AuthSchema") ?? "auth";

    public async Task<AuthUserRecord?> GetAuthUserByLoginAndPasswordAsync(string loginName, string password, CancellationToken cancellationToken)
    {
        var sql = $"SELECT user_id AS {nameof(AuthUserRecord.UserId)}, login_name AS {nameof(AuthUserRecord.LoginName)}, is_active AS {nameof(AuthUserRecord.IsActive)} FROM {_authSchema}._get_auth_user_by_login_name_and_password(@_login_name, @_password);";
        await using var connection = _connectionFactory.CreateConnection();

        try
        {
            return await connection.QuerySingleOrDefaultAsync<AuthUserRecord>(new CommandDefinition(
                sql,
                new { _login_name = loginName, _password = password },
                cancellationToken: cancellationToken));
        }
        catch (PostgresException)
        {
            return null;
        }
    }

    public async Task<AuthUserRecord?> GetAuthUserByIdAsync(int userId, CancellationToken cancellationToken)
    {
        var sql = $"SELECT user_id AS {nameof(AuthUserRecord.UserId)}, login_name AS {nameof(AuthUserRecord.LoginName)}, is_active AS {nameof(AuthUserRecord.IsActive)} FROM {_authSchema}._get_auth_user_by_id(@_user_id);";
        await using var connection = _connectionFactory.CreateConnection();

        try
        {
            return await connection.QuerySingleOrDefaultAsync<AuthUserRecord>(new CommandDefinition(
                sql,
                new { _user_id = userId },
                cancellationToken: cancellationToken));
        }
        catch (PostgresException)
        {
            return null;
        }
    }

    public async Task CreateRefreshTokenAsync(int userId, string refreshToken, DateTime expiresAtUtc, string clientType, CancellationToken cancellationToken)
    {
        var sql = $"SELECT {_authSchema}._create_refresh_token(@_user_id, @_token, @_expires_at, @_client_type);";
        await using var connection = _connectionFactory.CreateConnection();
        await connection.ExecuteAsync(new CommandDefinition(
            sql,
            new { _user_id = userId, _token = refreshToken, _expires_at = expiresAtUtc, _client_type = clientType },
            cancellationToken: cancellationToken));
    }

    public async Task<RotateRefreshTokenResult> RotateRefreshTokenAsync(string oldToken, string newToken, DateTime newExpiresAtUtc, CancellationToken cancellationToken)
    {
        var sql = $"SELECT status AS {nameof(RotateRefreshTokenResult.Status)}, user_id AS {nameof(RotateRefreshTokenResult.UserId)}, client_type AS {nameof(RotateRefreshTokenResult.ClientType)} FROM {_authSchema}._rotate_refresh_token(@_old_token, @_new_token, @_new_expires_at);";
        await using var connection = _connectionFactory.CreateConnection();

        var result = await connection.QuerySingleOrDefaultAsync<RotateRefreshTokenResult>(new CommandDefinition(
            sql,
            new { _old_token = oldToken, _new_token = newToken, _new_expires_at = newExpiresAtUtc },
            cancellationToken: cancellationToken));

        return result ?? new RotateRefreshTokenResult { Status = "invalid" };
    }

    public async Task RevokeRefreshTokenAsync(string refreshToken, bool revokeFamily, CancellationToken cancellationToken)
    {
        var sql = $"SELECT {_authSchema}._revoke_refresh_token(@_token, @_revoke_family);";
        await using var connection = _connectionFactory.CreateConnection();
        await connection.ExecuteAsync(new CommandDefinition(
            sql,
            new { _token = refreshToken, _revoke_family = revokeFamily },
            cancellationToken: cancellationToken));
    }

    public async Task<long> CleanupRefreshTokensAsync(TimeSpan olderThan, CancellationToken cancellationToken)
    {
        var sql = $"SELECT {_authSchema}._cleanup_refresh_tokens(@_older_than);";
        await using var connection = _connectionFactory.CreateConnection();
        return await connection.ExecuteScalarAsync<long>(new CommandDefinition(
            sql,
            new { _older_than = olderThan },
            cancellationToken: cancellationToken));
    }
}
