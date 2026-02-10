using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using AuthProvider.Api.Models;
using AuthProvider.Api.Security;
using Microsoft.Extensions.Options;

namespace AuthProvider.Api.Services;

public sealed class JwtService(IOptions<JwtOptions> jwtOptions, RsaKeyProvider rsaKeyProvider)
{
    private readonly JwtOptions _jwtOptions = jwtOptions.Value;
    private readonly RsaKeyProvider _rsaKeyProvider = rsaKeyProvider;

    public DateTime GetAccessTokenExpiresAtUtc()
    {
        return DateTime.UtcNow.AddMinutes(_jwtOptions.AccessTokenMinutes);
    }

    public string CreateAccessToken(int userId, DateTime expiresAtUtc)
    {
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            issuer: _jwtOptions.Issuer,
            audience: _jwtOptions.Audience,
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
                new Claim(JwtRegisteredClaimNames.Iat, new DateTimeOffset(now).ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)
            ],
            notBefore: now,
            expires: expiresAtUtc,
            signingCredentials: _rsaKeyProvider.SigningCredentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
