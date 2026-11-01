import { NextRequest, NextResponse } from 'next/server'
import { posix as pathPosix } from 'path'
import upstreamRequest, { upstreamFailure } from '../../../utils/upstreamRequest'
import type { OdThumbnail } from '../../../types'
import { checkAuthRoute, encodePath, getAccessToken } from '../../../lib/odApi'
import apiConfig from '../../../../config/api.config'

export async function GET(request: NextRequest) {
  const headers = new Headers({ 'Cache-Control': 'private, no-store' })
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return NextResponse.json({ error: 'No access token.' }, { status: 403, headers })
  }

  const searchParams = request.nextUrl.searchParams
  const path = searchParams.get('path') || ''
  const size = searchParams.get('size') || 'medium'
  const odpt = request.headers.get('od-protected-token') || searchParams.get('odpt') || ''

  if (size !== 'large' && size !== 'medium' && size !== 'small') {
    return NextResponse.json({ error: 'Invalid size' }, { status: 400, headers })
  }

  if (path === '[...path]') {
    return NextResponse.json({ error: 'No path specified.' }, { status: 400, headers })
  }

  const cleanPath = pathPosix.resolve('/', pathPosix.normalize(path))

  const { code, message } = await checkAuthRoute(cleanPath, accessToken, odpt)

  if (code !== 200) {
    return NextResponse.json({ error: message }, { status: code, headers })
  }

  const requestPath = encodePath(cleanPath)
  const requestUrl = `${apiConfig.driveApi}/root${requestPath}`
  const isRoot = requestPath === ''

  try {
    const load = async () => {
      const { data } = await upstreamRequest<{ value?: OdThumbnail[] }>(
        `${requestUrl}${isRoot ? '' : ':'}/thumbnails`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      const thumbnails = data?.value
      return thumbnails?.length ? (thumbnails[0][size]?.url ?? null) : null
    }
    const thumbnailUrl = await load()

    if (thumbnailUrl) {
      return NextResponse.redirect(thumbnailUrl, { headers })
    } else {
      return NextResponse.json({ error: "The item doesn't have a valid thumbnail." }, { status: 400, headers })
    }
  } catch (error) {
    const { status, data } = upstreamFailure(error)
    return NextResponse.json(
      { error: data ?? 'Internal server error.' },
      { status: status ?? 500, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
}
