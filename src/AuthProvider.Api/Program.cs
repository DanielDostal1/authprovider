using System.Text.Json;
using AuthProvider.Api.Data;
using AuthProvider.Api.Models;
using AuthProvider.Api.Security;
using AuthProvider.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection("Jwt"));
builder.Services.Configure<AuthBehaviorOptions>(builder.Configuration.GetSection("Auth"));
builder.Services.Configure<CorsOptions>(builder.Configuration.GetSection("Cors"));

var jwtOptions = builder.Configuration.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();
if (string.IsNullOrWhiteSpace(jwtOptions.Issuer) ||
    string.IsNullOrWhiteSpace(jwtOptions.Audience) ||
    string.IsNullOrWhiteSpace(jwtOptions.PrivateKeyPem))
{
    throw new InvalidOperationException("Jwt settings are missing required values.");
}

var connectionString = builder.Configuration.GetConnectionString("Default");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException("ConnectionStrings:Default is required.");
}

var rsaKeyProvider = new RsaKeyProvider(Options.Create(jwtOptions));

builder.Services.AddSingleton(rsaKeyProvider);
builder.Services.AddSingleton<JwtService>();
builder.Services.AddSingleton<RefreshTokenExtractor>();
builder.Services.AddSingleton<CookieHelper>();
builder.Services.AddSingleton<DbConnectionFactory>();
builder.Services.AddScoped<AuthRepository>();
builder.Services.AddScoped<AuthService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidAudience = jwtOptions.Audience,
            IssuerSigningKey = rsaKeyProvider.ValidationKey,
            ClockSkew = TimeSpan.Zero
        };

        options.Events = new JwtBearerEvents
        {
            OnChallenge = async context =>
            {
                context.HandleResponse();
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                context.Response.ContentType = "application/json";
                var payload = JsonSerializer.Serialize(new ErrorResponse("unauthorized"));
                await context.Response.WriteAsync(payload);
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var corsOptions = builder.Configuration.GetSection("Cors").Get<CorsOptions>() ?? new CorsOptions();
builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy =>
    {
        if (corsOptions.AllowedOrigins.Length == 0)
        {
            policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
            return;
        }

        policy.WithOrigins(corsOptions.AllowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors("frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapControllers();

app.Run();
