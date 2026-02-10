using System.Text.Json.Serialization;

namespace AuthProvider.Api.Models;

public sealed class RefreshRequest
{
    [JsonPropertyName("refresh_token")]
    public string? RefreshToken { get; init; }
}
