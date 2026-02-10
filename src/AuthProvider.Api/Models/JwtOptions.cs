namespace AuthProvider.Api.Models;

public sealed class JwtOptions
{
    public string Issuer { get; init; } = string.Empty;
    public string Audience { get; init; } = string.Empty;
    public int AccessTokenMinutes { get; init; } = 15;
    public string PrivateKeyPem { get; init; } = string.Empty;
    public string PublicKeyPem { get; init; } = string.Empty;
}
