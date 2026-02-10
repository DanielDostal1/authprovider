using AuthProvider.Api.Models;
using Microsoft.Extensions.Options;

namespace AuthProvider.Api.Services;

public sealed class RefreshTokenExtractor(IOptions<AuthBehaviorOptions> options)
{
    private readonly AuthBehaviorOptions _options = options.Value;

    public string? Extract(HttpRequest request, string? bodyToken)
    {
        if (request.Cookies.TryGetValue(_options.RefreshCookieName, out var cookieToken) && !string.IsNullOrWhiteSpace(cookieToken))
        {
            return cookieToken;
        }

        if (!string.IsNullOrWhiteSpace(bodyToken))
        {
            return bodyToken;
        }

        var headerToken = request.Headers[_options.RefreshTokenHeaderName].ToString();
        return string.IsNullOrWhiteSpace(headerToken) ? null : headerToken;
    }
}
