using AuthProvider.Api.Models;

namespace AuthProvider.Api.Services;

public sealed class TokenIssueResult
{
    public required string AccessToken { get; init; }
    public required string RefreshToken { get; init; }
    public required DateTime AccessTokenExpiresAt { get; init; }
    public required DateTime RefreshTokenExpiresAt { get; init; }
    public required string ClientType { get; init; }
}

public sealed class MeResult
{
    public required MeResponse User { get; init; }
}
