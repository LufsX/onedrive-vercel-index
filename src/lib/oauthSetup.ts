type Dependencies = {
  owner: string
  readBody: () => Promise<unknown>
  reveal: (value: string) => string
  getIdentity: (accessToken: string) => Promise<string | null>
  store: (body: unknown) => Promise<boolean>
}

export async function authorizeTokenWrite(deps: Dependencies): Promise<{ status: number; error?: string }> {
  const body = await deps.readBody().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { status: 400, error: 'invalid_request' }
  const { obfuscatedAccessToken, obfuscatedRefreshToken, accessTokenExpiry } = body as Record<string, unknown>
  if (
    typeof obfuscatedAccessToken !== 'string' ||
    typeof obfuscatedRefreshToken !== 'string' ||
    !Number.isFinite(Number(accessTokenExpiry)) ||
    Number(accessTokenExpiry) < 1
  ) return { status: 400, error: 'invalid_request' }

  let accessToken: string
  try {
    accessToken = deps.reveal(obfuscatedAccessToken)
    if (!accessToken.trim() || !deps.reveal(obfuscatedRefreshToken).trim()) {
      return { status: 400, error: 'invalid_request' }
    }
  } catch {
    return { status: 400, error: 'invalid_request' }
  }

  let identity: string | null
  try {
    identity = await deps.getIdentity(accessToken)
  } catch {
    return { status: 502, error: 'identity_unavailable' }
  }
  if (!identity || !deps.owner || identity !== deps.owner) return { status: 403, error: 'identity_mismatch' }
  try {
    if (!(await deps.store(body))) return { status: 400, error: 'invalid_request' }
  } catch {
    return { status: 500, error: 'store_failed' }
  }
  return { status: 200 }
}
