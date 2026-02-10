using System.Text.Json.Serialization;

namespace AuthProvider.Api.Models;

public sealed class ErrorResponse(string error)
{
    [JsonPropertyName("error")]
    public string Error { get; } = error;
}
