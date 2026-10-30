import { NextRequest, NextResponse } from 'next/server'

import apiConfig from '../../../../../config/api.config'
import { getOAuthClientSecret } from '../../../../lib/oauthServerConfig'

const headers = { 'Cache-Control': 'no-store' }

function failure(error: string, errorDescription: string, status: number) {
  return NextResponse.json({ error, errorDescription, errorUri: '' }, { status, headers })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    typeof body.code !== 'string' ||
    !body.code.trim() ||
    body.code.length > 16384
  ) {
    return failure('invalid_request', 'A valid authorization code is required.', 400)
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
      body: params,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    })
    const data = await response.json().catch(() => null)

    if (!response.ok) {
      // Do not forward upstream text, which could contain credentials or authorization codes.
      return failure(
        data?.error === 'invalid_grant' ? 'invalid_grant' : 'token_exchange_failed',
        'Microsoft rejected the authorization code.',
        502,
      )
    }

    if (
      !data ||
      typeof data.access_token !== 'string' ||
      !data.access_token ||
      typeof data.refresh_token !== 'string' ||
      !data.refresh_token ||
      typeof data.expires_in !== 'number' ||
      !Number.isFinite(data.expires_in) ||
      data.expires_in <= 0
    ) {
      return failure('invalid_token_response', 'Microsoft returned an invalid token response.', 502)
    }

    return NextResponse.json(
      { expiryTime: data.expires_in, accessToken: data.access_token, refreshToken: data.refresh_token },
      { headers },
    )
  } catch {
    return failure('network_error', 'Could not reach the Microsoft token endpoint.', 502)
  }
}
