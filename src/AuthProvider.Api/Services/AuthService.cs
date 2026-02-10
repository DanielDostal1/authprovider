using System.Security.Cryptography;
using AuthProvider.Api.Data;
using AuthProvider.Api.Models;
using Microsoft.Extensions.Options;

namespace AuthProvider.Api.Services;

public sealed class AuthService(
    AuthRepository authRepository,
    JwtService jwtService,
    IOptions<AuthBehaviorOptions> authOptions)
{
    private static readonly HashSet<string> AllowedClientTypes = new(StringComparer.OrdinalIgnoreCase) { "web", "mobile" };

    private readonly AuthRepository _authRepository = authRepository;
    private readonly JwtService _jwtService = jwtService;
    private readonly AuthBehaviorOptions _authOptions = authOptions.Value;

    public async Task<TokenIssueResult> LoginAsync(LoginRequest request, string clientType, CancellationToken cancellationToken)
    {
        ValidateClientTypeRequired(clientType);

        if (string.IsNullOrWhiteSpace(request.LoginName) || string.IsNullOrWhiteSpace(request.Password))
        {
            throw new AuthServiceException(StatusCodes.Status400BadRequest, "invalid_request");
        }

        var user = await _authRepository.GetAuthUserByLoginAndPasswordAsync(request.LoginName, request.Password, cancellationToken);
        if (user is null || !user.IsActive)
        {
            throw new AuthServiceException(StatusCodes.Status401Unauthorized, "invalid_credentials");
        }

        var accessTokenExpiresAt = _jwtService.GetAccessTokenExpiresAtUtc();
        var accessToken = _jwtService.CreateAccessToken(user.UserId, accessTokenExpiresAt);

        var refreshToken = GenerateRefreshToken();
        var refreshTokenExpiresAt = DateTime.UtcNow.AddDays(_authOptions.RefreshTokenDays);
        await _authRepository.CreateRefreshTokenAsync(user.UserId, refreshToken, refreshTokenExpiresAt, clientType.ToLowerInvariant(), cancellationToken);

        return new TokenIssueResult
        {
            AccessToken = accessToken,
            RefreshToken = refreshToken,
            AccessTokenExpiresAt = accessTokenExpiresAt,
            RefreshTokenExpiresAt = refreshTokenExpiresAt,
            ClientType = clientType.ToLowerInvariant()
        };
    }

    public async Task<TokenIssueResult> RefreshAsync(string refreshToken, string clientType, CancellationToken cancellationToken)
    {
        ValidateClientTypeRequired(clientType);

        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            throw new AuthServiceException(StatusCodes.Status400BadRequest, "invalid_request");
        }

        var newRefreshToken = GenerateRefreshToken();
        var refreshTokenExpiresAt = DateTime.UtcNow.AddDays(_authOptions.RefreshTokenDays);
        var rotateResult = await _authRepository.RotateRefreshTokenAsync(refreshToken, newRefreshToken, refreshTokenExpiresAt, cancellationToken);

        if (string.Equals(rotateResult.Status, "reuse", StringComparison.OrdinalIgnoreCase))
        {
            await _authRepository.RevokeRefreshTokenAsync(refreshToken, true, cancellationToken);
            throw new AuthServiceException(StatusCodes.Status401Unauthorized, "invalid_refresh_token");
        }

        if (!string.Equals(rotateResult.Status, "ok", StringComparison.OrdinalIgnoreCase) || rotateResult.UserId is null)
        {
            throw new AuthServiceException(StatusCodes.Status401Unauthorized, "invalid_refresh_token");
        }

        var resolvedClientType = rotateResult.ClientType;
        if (string.IsNullOrWhiteSpace(resolvedClientType))
        {
            resolvedClientType = clientType.ToLowerInvariant();
        }

        var accessTokenExpiresAt = _jwtService.GetAccessTokenExpiresAtUtc();
        var accessToken = _jwtService.CreateAccessToken(rotateResult.UserId.Value, accessTokenExpiresAt);

        return new TokenIssueResult
        {
            AccessToken = accessToken,
            RefreshToken = newRefreshToken,
            AccessTokenExpiresAt = accessTokenExpiresAt,
            RefreshTokenExpiresAt = refreshTokenExpiresAt,
            ClientType = resolvedClientType
        };
    }

    public async Task LogoutAsync(string? refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            return;
        }

        await _authRepository.RevokeRefreshTokenAsync(refreshToken, false, cancellationToken);
    }

    public async Task<MeResult> MeAsync(string? userIdClaim, CancellationToken cancellationToken)
    {
        if (!int.TryParse(userIdClaim, out var userId))
        {
            throw new AuthServiceException(StatusCodes.Status401Unauthorized, "unauthorized");
        }

        var user = await _authRepository.GetAuthUserByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            throw new AuthServiceException(StatusCodes.Status404NotFound, "user_not_found");
        }

        return new MeResult
        {
            User = new MeResponse
            {
                UserId = user.UserId,
                LoginName = user.LoginName,
                IsActive = user.IsActive
            }
        };
    }

    private static string GenerateRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(48);
        return Convert.ToBase64String(bytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
    }

    private static void ValidateClientTypeRequired(string clientType)
    {
        if (string.IsNullOrWhiteSpace(clientType) || !AllowedClientTypes.Contains(clientType))
        {
            throw new AuthServiceException(StatusCodes.Status400BadRequest, "invalid_request");
        }
    }
}
