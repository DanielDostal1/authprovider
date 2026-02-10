namespace AuthProvider.Api.Models;

public sealed class AuthBehaviorOptions
{
    public string AuthSchema { get; init; } = "auth";
    public int RefreshTokenDays { get; init; } = 14;
    public string RefreshCookieName { get; init; } = "refresh_token";
    public string RefreshTokenHeaderName { get; init; } = "X-Refresh-Token";
    public string ClientHeaderName { get; init; } = "X-Client-Type";
    public string CookieSameSite { get; init; } = "Strict";
    public bool CookieSecure { get; init; } = true;
    public bool CookieHttpOnly { get; init; } = true;
}
