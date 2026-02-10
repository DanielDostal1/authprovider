using Npgsql;

namespace AuthProvider.Api.Data;

public sealed class DbConnectionFactory(IConfiguration configuration)
{
    private readonly string _connectionString = configuration.GetConnectionString("Default")
        ?? throw new InvalidOperationException("ConnectionStrings:Default is missing.");

    public NpgsqlConnection CreateConnection() => new(_connectionString);
}
