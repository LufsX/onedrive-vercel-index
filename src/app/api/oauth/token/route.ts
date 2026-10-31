import { NextRequest, NextResponse } from 'next/server'
import apiConfig from '../../../../../config/api.config'
import siteConfig from '../../../../../config/site.config'
import { getOAuthClientSecret } from '../../../../lib/oauthServerConfig'
import { authorizeTokenWrite } from '../../../../lib/oauthSetup'
import { adminError, checkAdminRateLimit, readAdminBody, requireAdmin, validateWriteRequest } from '../../../../lib/adminAuth'
import { storeTokensFromRequestBody } from '../../../../lib/odApi'

const headers = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  const rejected = validateWriteRequest(request) || await requireAdmin(request)
  if (rejected) return rejected
  try {
    if (!(await checkAdminRateLimit('oauth'))) return adminError('rate_limited', 429)
  } catch {
    return adminError('auth_unavailable', 503)
  }

  const body = await readAdminBody(request)
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      typeof body.code !== 'string' || !body.code.trim() || body.code.length > 16384) {
    return adminError('invalid_request', 400)
  }
  const params = new URLSearchParams({
    client_id: apiConfig.clientId,
    redirect_uri: apiConfig.redirectUri,
    client_secret: getOAuthClientSecret(),
    code: body.code,
    grant_type: 'authorization_code',
  })

  try {
    const response = await fetch(apiConfig.authApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) return adminError(data?.error === 'invalid_grant' ? 'invalid_grant' : 'token_exchange_failed', 502)
    if (!data || typeof data.access_token !== 'string' || !data.access_token ||
        typeof data.refresh_token !== 'string' || !data.refresh_token ||
        typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
      return adminError('invalid_token_response', 502)
    }

    const result = await authorizeTokenWrite({
      owner: siteConfig.userPrincipalName,
      readBody: async () => ({
        obfuscatedAccessToken: data.access_token,
        obfuscatedRefreshToken: data.refresh_token,
        accessTokenExpiry: data.expires_in,
      }),
      reveal: value => value,
      getIdentity: async accessToken => {
        const identity = await fetch(apiConfig.driveApi.replace('/drive', ''), {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
        })
        if (!identity.ok) throw new Error('Identity request failed')
        const profile = await identity.json()
        return typeof profile?.userPrincipalName === 'string' ? profile.userPrincipalName : null
      },
      // The existing store expects the legacy obfuscated representation.
      store: async tokens => {
        const { obfuscateToken } = await import('../../../../utils/oAuthHandler')
        const pair = tokens as { obfuscatedAccessToken: string; obfuscatedRefreshToken: string; accessTokenExpiry: number }
        return storeTokensFromRequestBody({
          obfuscatedAccessToken: obfuscateToken(pair.obfuscatedAccessToken),
          obfuscatedRefreshToken: obfuscateToken(pair.obfuscatedRefreshToken),
          accessTokenExpiry: pair.accessTokenExpiry,
        })
      },
    })
    if (result.error) return adminError(result.error, result.status)
    return NextResponse.json({ stored: true }, { headers })
  } catch {
    return adminError('token_exchange_failed', 502)
  }
}
