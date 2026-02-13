interface JwtPayload {
  exp?: number
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return atob(padded)
}

export function extractTokenExpiryMs(accessToken: string | null) {
  if (!accessToken) {
    return null
  }

  const parts = accessToken.split('.')
  if (parts.length < 2) {
    return null
  }

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as JwtPayload
    if (!payload.exp) {
      return null
    }

    return payload.exp * 1000
  } catch {
    return null
  }
}

export function parseExpiresAt(expiresAt: string | null) {
  if (!expiresAt) {
    return null
  }

  const parsed = Date.parse(expiresAt)
  return Number.isNaN(parsed) ? null : parsed
}
