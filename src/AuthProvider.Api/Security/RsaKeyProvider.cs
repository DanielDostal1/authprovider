using System.Security.Cryptography;
using AuthProvider.Api.Models;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace AuthProvider.Api.Security;

public sealed class RsaKeyProvider
{
    private readonly JwtOptions _options;
    private readonly Lazy<RsaSecurityKey> _signingKey;
    private readonly Lazy<RsaSecurityKey> _validationKey;

    public RsaKeyProvider(IOptions<JwtOptions> options)
    {
        _options = options.Value;
        _signingKey = new Lazy<RsaSecurityKey>(CreateSigningKey);
        _validationKey = new Lazy<RsaSecurityKey>(CreateValidationKey);
    }

    public SigningCredentials SigningCredentials => new(_signingKey.Value, SecurityAlgorithms.RsaSha256);
    public SecurityKey ValidationKey => _validationKey.Value;

    private RsaSecurityKey CreateSigningKey()
    {
        var privatePem = _options.PrivateKeyPem.Trim();
        var rsa = RSA.Create();
        rsa.ImportFromPem(privatePem);
        return new RsaSecurityKey(rsa);
    }

    private RsaSecurityKey CreateValidationKey()
    {
        if (!string.IsNullOrWhiteSpace(_options.PublicKeyPem))
        {
            var rsa = RSA.Create();
            rsa.ImportFromPem(_options.PublicKeyPem.Trim());
            return new RsaSecurityKey(rsa);
        }

        var rsaFromPrivate = RSA.Create();
        rsaFromPrivate.ImportFromPem(_options.PrivateKeyPem.Trim());
        var publicOnly = RSA.Create();
        publicOnly.ImportParameters(rsaFromPrivate.ExportParameters(false));
        return new RsaSecurityKey(publicOnly);
    }
}
