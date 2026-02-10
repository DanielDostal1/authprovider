namespace AuthProvider.Api.Services;

public sealed class AuthServiceException(int statusCode, string errorCode) : Exception(errorCode)
{
    public int StatusCode { get; } = statusCode;
    public string ErrorCode { get; } = errorCode;
}
