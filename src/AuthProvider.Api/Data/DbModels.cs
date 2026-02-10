namespace AuthProvider.Api.Data;

public sealed class AuthUserRecord
{
    public int UserId { get; set; }
    public string LoginName { get; set; } = string.Empty;
    public bool IsActive { get; set; }
}

public sealed class RotateRefreshTokenResult
{
    public string Status { get; set; } = string.Empty;
    public int? UserId { get; set; }
    public string? ClientType { get; set; }
}
