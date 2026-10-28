import { NextRequest, NextResponse } from 'next/server'
import { posix as pathPosix } from 'path'
import axiosInstance from '../../../utils/axiosInstance'
import type { OdThumbnail } from '../../../types'
import { checkAuthRoute, encodePath, getAccessToken } from '../../../lib/odApi'
import apiConfig from '../../../../config/api.config'

export async function GET(request: NextRequest) {
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return NextResponse.json({ error: 'No access token.' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const path = searchParams.get('path') || ''
  const size = searchParams.get('size') || 'medium'
  const odpt = searchParams.get('odpt') || ''

  const headers = new Headers()
  if (odpt === '') {
    headers.set('Cache-Control', apiConfig.cacheControlHeader)
  }

  if (size !== 'large' && size !== 'medium' && size !== 'small') {
    return NextResponse.json({ error: 'Invalid size' }, { status: 400 })
  }

  if (path === '[...path]') {
    return NextResponse.json({ error: 'No path specified.' }, { status: 400 })
  }

  const cleanPath = pathPosix.resolve('/', pathPosix.normalize(path))

  const { code, message } = await checkAuthRoute(cleanPath, accessToken, odpt)

  if (code !== 200) {
    return NextResponse.json({ error: message }, { status: code })
  }

  if (message !== '') {
    headers.set('Cache-Control', 'no-cache')
  }

  const requestPath = encodePath(cleanPath)
  const requestUrl = `${apiConfig.driveApi}/root${requestPath}`
  const isRoot = requestPath === ''

  try {
    const { data } = await axiosInstance.get(`${requestUrl}${isRoot ? '' : ':'}/thumbnails`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const thumbnailUrl = data.value && data.value.length > 0 ? (data.value[0] as OdThumbnail)[size].url : null

    if (thumbnailUrl) {
      return NextResponse.redirect(thumbnailUrl, { headers })
    } else {
      return NextResponse.json({ error: "The item doesn't have a valid thumbnail." }, { status: 400 })
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.response?.data ?? 'Internal server error.' },
      { status: error?.response?.status ?? 500 },
    )
  }
}
