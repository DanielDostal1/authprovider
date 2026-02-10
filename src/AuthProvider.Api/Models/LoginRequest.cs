using System.Text.Json.Serialization;

namespace AuthProvider.Api.Models;

public sealed class LoginRequest
{
    [JsonPropertyName("login_name")]
    public string? LoginName { get; init; }

    [JsonPropertyName("password")]
    public string? Password { get; init; }
}
