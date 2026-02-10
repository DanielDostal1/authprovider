using System.Text.Json.Serialization;

namespace AuthProvider.Api.Models;

public sealed class MeResponse
{
    [JsonPropertyName("user_id")]
    public required int UserId { get; init; }

    [JsonPropertyName("login_name")]
    public required string LoginName { get; init; }

    [JsonPropertyName("is_active")]
    public required bool IsActive { get; init; }
}
