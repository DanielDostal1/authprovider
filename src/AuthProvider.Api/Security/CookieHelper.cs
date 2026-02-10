using AuthProvider.Api.Models;
using Microsoft.Extensions.Options;

namespace AuthProvider.Api.Security;

public sealed class CookieHelper(IOptions<AuthBehaviorOptions> options)
{
    private readonly AuthBehaviorOptions _options = options.Value;

    public void SetRefreshTokenCookie(HttpResponse response, string refreshToken, DateTime expiresAtUtc)
    {
        response.Cookies.Append(_options.RefreshCookieName, refreshToken, new CookieOptions
        {
            HttpOnly = _options.CookieHttpOnly,
            Secure = _options.CookieSecure,
            SameSite = ParseSameSite(_options.CookieSameSite),
            Expires = expiresAtUtc,
            IsEssential = true
        });
    }

    public void ClearRefreshTokenCookie(HttpResponse response)
    {
        response.Cookies.Delete(_options.RefreshCookieName, new CookieOptions
        {
            HttpOnly = _options.CookieHttpOnly,
            Secure = _options.CookieSecure,
            SameSite = ParseSameSite(_options.CookieSameSite),
            IsEssential = true
        });
    }

    private static SameSiteMode ParseSameSite(string sameSite)
    {
        return sameSite.ToLowerInvariant() switch
        {
            "none" => SameSiteMode.None,
            "lax" => SameSiteMode.Lax,
            _ => SameSiteMode.Strict
        };
    }
}
