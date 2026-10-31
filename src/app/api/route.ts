import { NextRequest, NextResponse } from 'next/server'
import { posix as pathPosix } from 'path'

import axiosInstance from '../../utils/axiosInstance'
import apiConfig from '../../../config/api.config'
import { checkAuthRoute, encodePath, getAccessToken, storeTokensFromRequestBody } from '../../lib/odApi'
import { getDrivePath, type ThumbnailSize } from '../../lib/driveListing'
import { hasStoredRefreshToken } from '../../utils/odAuthTokenStore'
import { revealObfuscatedToken } from '../../utils/oAuthHandler'
import { authorizeTokenWrite } from '../../lib/oauthSetup'
import siteConfig from '../../../config/site.config'
import { adminError, checkAdminRateLimit, readAdminBody, requireAdmin, validateWriteRequest } from '../../lib/adminAuth'

export async function POST(request: NextRequest) {
  const rejected = validateWriteRequest(request) || await requireAdmin(request)
  if (rejected) return rejected
  try {
    if (!(await checkAdminRateLimit('oauth'))) return adminError('rate_limited', 429)
  } catch {
    return adminError('auth_unavailable', 503)
  }
  const result = await authorizeTokenWrite({
    owner: siteConfig.userPrincipalName,
    readBody: () => readAdminBody(request),
    reveal: revealObfuscatedToken,
    getIdentity: async accessToken => {
      const response = await fetch(apiConfig.driveApi.replace('/drive', ''), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error('Graph identity request failed')
      const data = await response.json()
      return typeof data?.userPrincipalName === 'string' ? data.userPrincipalName : null
    },
    store: storeTokensFromRequestBody,
  })
  const headers = { 'Cache-Control': 'no-store' }
  return result.error
    ? NextResponse.json({ error: result.error }, { status: result.status, headers })
    : new NextResponse('OK', { status: 200, headers })
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const path = searchParams.get('path') || '/'
  const raw = searchParams.get('raw') === 'true'
  const next = searchParams.get('next') || ''
  const sort = searchParams.get('sort') || ''
  const thumbnailsParam = searchParams.get('thumbnails') || ''
  const thumbnails: ThumbnailSize | undefined =
    thumbnailsParam === 'large' || thumbnailsParam === 'small' || thumbnailsParam === 'medium'
      ? thumbnailsParam
      : undefined

  const headers = new Headers()
  headers.set('Cache-Control', 'private, no-store')

  if (path === '[...path]') {
    return NextResponse.json({ error: 'No path specified.' }, { status: 400, headers })
  }

  const cleanPath = pathPosix.resolve('/', pathPosix.normalize(path)).replace(/\/$/, '')

  const accessToken = await getAccessToken()

  if (!accessToken) {
    // Only redirect the visitor to the setup wizard when nothing has been stored
    // yet; a failed refresh must not look like a first-time setup.
    const setupRequired = !(await hasStoredRefreshToken())
    return NextResponse.json({ error: 'No access token.', setupRequired }, { status: 403, headers })
  }

  const odTokenHeader = request.headers.get('od-protected-token') || ''
  const { code, message } = await checkAuthRoute(cleanPath, accessToken, odTokenHeader)

  if (code !== 200) {
    return NextResponse.json({ error: message }, { status: code, headers })
  }

  if (raw) {

    const { data } = await axiosInstance.get(`${apiConfig.driveApi}/root${encodePath(cleanPath)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'id,@microsoft.graph.downloadUrl',
      },
    })

    if ('@microsoft.graph.downloadUrl' in data) {
      return NextResponse.redirect(data['@microsoft.graph.downloadUrl'], { headers })
    } else {
      return NextResponse.json({ error: 'No download url found.' }, { status: 404, headers })
    }
  }

  try {
    // Uploads can complete on another instance, so listings cannot use process-local caches.
    const response = await getDrivePath(cleanPath, accessToken, { next, sort, thumbnails }, false)

    return NextResponse.json(response, { headers })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.response?.data ?? 'Internal server error.' },
      { status: error?.response?.status ?? 500, headers },
    )
  }
}
