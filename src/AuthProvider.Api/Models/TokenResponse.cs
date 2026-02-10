using System.Text.Json.Serialization;

namespace AuthProvider.Api.Models;

public sealed class TokenResponse
{
    [JsonPropertyName("access_token")]
    public required string AccessToken { get; init; }

    [JsonPropertyName("expires_at")]
    public required DateTime ExpiresAt { get; init; }

    [JsonPropertyName("refresh_token")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? RefreshToken { get; init; }
}
