using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using AuthProvider.Api.Models;
using AuthProvider.Api.Security;
using AuthProvider.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace AuthProvider.Api.Controllers;

[ApiController]
[Route("auth")]
public sealed class AuthController(
    AuthService authService,
    RefreshTokenExtractor refreshTokenExtractor,
    CookieHelper cookieHelper,
    IOptions<AuthBehaviorOptions> authOptions) : ControllerBase
{
    private readonly AuthService _authService = authService;
    private readonly RefreshTokenExtractor _refreshTokenExtractor = refreshTokenExtractor;
    private readonly CookieHelper _cookieHelper = cookieHelper;
    private readonly AuthBehaviorOptions _authOptions = authOptions.Value;

    [HttpPost("login")]
    [ProducesResponseType<TokenResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Login([FromBody] LoginRequest? request, CancellationToken cancellationToken)
    {
        try
        {
            if (request is null)
            {
                return BadRequest(new ErrorResponse("invalid_request"));
            }

            var clientType = GetClientTypeHeader(required: true);
            var result = await _authService.LoginAsync(request, clientType, cancellationToken);

            if (IsWebClient(result.ClientType))
            {
                _cookieHelper.SetRefreshTokenCookie(Response, result.RefreshToken, result.RefreshTokenExpiresAt);
                return Ok(new TokenResponse
                {
                    AccessToken = result.AccessToken,
                    ExpiresAt = result.AccessTokenExpiresAt
                });
            }

            return Ok(new TokenResponse
            {
                AccessToken = result.AccessToken,
                ExpiresAt = result.AccessTokenExpiresAt,
                RefreshToken = result.RefreshToken
            });
        }
        catch (AuthServiceException ex)
        {
            return StatusCode(ex.StatusCode, new ErrorResponse(ex.ErrorCode));
        }
    }

    [HttpPost("refresh")]
    [ProducesResponseType<TokenResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest? request, CancellationToken cancellationToken)
    {
        try
        {
            var clientType = GetClientTypeHeader(required: true);
            var refreshToken = _refreshTokenExtractor.Extract(HttpContext.Request, request?.RefreshToken);

            if (string.IsNullOrWhiteSpace(refreshToken))
            {
                return BadRequest(new ErrorResponse("invalid_request"));
            }

            var result = await _authService.RefreshAsync(refreshToken, clientType, cancellationToken);

            if (IsWebClient(result.ClientType))
            {
                _cookieHelper.SetRefreshTokenCookie(Response, result.RefreshToken, result.RefreshTokenExpiresAt);
                return Ok(new TokenResponse
                {
                    AccessToken = result.AccessToken,
                    ExpiresAt = result.AccessTokenExpiresAt
                });
            }

            return Ok(new TokenResponse
            {
                AccessToken = result.AccessToken,
                ExpiresAt = result.AccessTokenExpiresAt,
                RefreshToken = result.RefreshToken
            });
        }
        catch (AuthServiceException ex)
        {
            return StatusCode(ex.StatusCode, new ErrorResponse(ex.ErrorCode));
        }
    }

    [HttpPost("logout")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout([FromBody] LogoutRequest? request, CancellationToken cancellationToken)
    {
        var refreshToken = _refreshTokenExtractor.Extract(HttpContext.Request, request?.RefreshToken);
        await _authService.LogoutAsync(refreshToken, cancellationToken);

        if (IsWebClient(GetClientTypeHeader(required: false)) || HttpContext.Request.Cookies.ContainsKey(_authOptions.RefreshCookieName))
        {
            _cookieHelper.ClearRefreshTokenCookie(Response);
        }

        return NoContent();
    }

    [Authorize]
    [HttpGet("me")]
    [ProducesResponseType<MeResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Me(CancellationToken cancellationToken)
    {
        try
        {
            var userIdClaim = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
            var result = await _authService.MeAsync(userIdClaim, cancellationToken);
            return Ok(result.User);
        }
        catch (AuthServiceException ex)
        {
            return StatusCode(ex.StatusCode, new ErrorResponse(ex.ErrorCode));
        }
    }

    private string GetClientTypeHeader(bool required)
    {
        var value = Request.Headers[_authOptions.ClientHeaderName].ToString();
        if (!required)
        {
            return value;
        }

        if (string.IsNullOrWhiteSpace(value))
        {
            throw new AuthServiceException(StatusCodes.Status400BadRequest, "invalid_request");
        }

        return value;
    }

    private static bool IsWebClient(string? clientType)
    {
        return string.Equals(clientType, "web", StringComparison.OrdinalIgnoreCase);
    }
}
