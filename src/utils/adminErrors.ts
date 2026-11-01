const defaultMessage = 'Administrator login failed.'

// These messages are translation keys, never text supplied by the server.
const errorMessages = new Map<string, string>([
  ['invalid_credentials', 'Incorrect administrator password.'],
  ['invalid_origin', 'Administrator requests must come from the same origin.'],
  ['https_required', 'Administrator login requires HTTPS.'],
  ['invalid_request', 'Administrator request was rejected. Reload this page and try again.'],
  ['rate_limited', 'Too many requests. Try again later.'],
  ['redis_not_configured', 'Redis is not configured. Set REDIS_URL and redeploy.'],
  ['redis_invalid_url', 'Redis URL configuration is invalid. Check REDIS_URL and redeploy.'],
  ['redis_unavailable', 'Redis is unavailable. Try again later.'],
  ['auth_unavailable', 'Administrator authentication is unavailable. Try again later.'],
  [
    'invalid_admin_configuration',
    'Administrator password configuration is invalid. Generate a new configuration and redeploy.',
  ],
  ['admin_not_configured', 'Administrator password is not configured. Generate a configuration and redeploy.'],
])
const knownMessages = new Set([defaultMessage, ...errorMessages.values()])

export async function readAdminError(response: Response, fallback = defaultMessage): Promise<string> {
  try {
    const data: unknown = await response.json()
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const field of ['error', 'code']) {
        if (!Object.prototype.hasOwnProperty.call(data, field)) continue
        const code = (data as Record<string, unknown>)[field]
        if (typeof code === 'string') {
          const message = errorMessages.get(code)
          if (message) return message
        }
      }
    }
  } catch {
    // Empty, malformed, or unreadable bodies must not expose upstream response text.
  }

  if (response.status === 429) return errorMessages.get('rate_limited')!
  if (response.status === 503) return errorMessages.get('auth_unavailable')!
  return fallback
}

export function getAdminErrorMessage(failure: unknown, fallback = defaultMessage): string {
  try {
    const message = failure && typeof failure === 'object' && 'message' in failure ? failure.message : failure
    if (typeof message === 'string' && knownMessages.has(message)) return message
  } catch {
    // Treat unreadable exception objects like any other unknown failure.
  }
  return fallback
}
