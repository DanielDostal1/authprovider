namespace AuthProvider.Api.Models;

public sealed class CorsOptions
{
    public string[] AllowedOrigins { get; init; } = [];
}
