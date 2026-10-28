import { NextRequest, NextResponse } from 'next/server'
import { posix as pathPosix } from 'path'

import axiosInstance from '../../utils/axiosInstance'
import apiConfig from '../../../config/api.config'
import siteConfig from '../../../config/site.config'
import { checkAuthRoute, encodePath, getAccessToken, storeTokensFromRequestBody } from '../../lib/odApi'
import { hasStoredRefreshToken } from '../../utils/odAuthTokenStore'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)

  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const stored = await storeTokensFromRequestBody(body)

  if (!stored) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  return new NextResponse('OK', { status: 200 })
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const path = searchParams.get('path') || '/'
  const raw = searchParams.get('raw') === 'true'
  const next = searchParams.get('next') || ''
  const sort = searchParams.get('sort') || ''

  const headers = new Headers()
  headers.set('Cache-Control', apiConfig.cacheControlHeader)

  if (path === '[...path]') {
    return NextResponse.json({ error: 'No path specified.' }, { status: 400 })
  }

  const cleanPath = pathPosix.resolve('/', pathPosix.normalize(path)).replace(/\/$/, '')

  const accessToken = await getAccessToken()

  if (!accessToken) {
    // Only redirect the visitor to the setup wizard when nothing has been stored
    // yet; a failed refresh must not look like a first-time setup.
    const setupRequired = !(await hasStoredRefreshToken())
    return NextResponse.json({ error: 'No access token.', setupRequired }, { status: 403 })
  }

  const odTokenHeader = request.headers.get('od-protected-token') || ''
  const { code, message } = await checkAuthRoute(cleanPath, accessToken, odTokenHeader)

  if (code !== 200) {
    return NextResponse.json({ error: message }, { status: code })
  }

  if (message !== '') {
    headers.set('Cache-Control', 'no-cache')
  }

  const requestPath = encodePath(cleanPath)
  const requestUrl = `${apiConfig.driveApi}/root${requestPath}`
  const isRoot = requestPath === ''

  if (raw) {
    headers.set('Cache-Control', 'no-cache')

    const { data } = await axiosInstance.get(requestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'id,@microsoft.graph.downloadUrl',
      },
    })

    if ('@microsoft.graph.downloadUrl' in data) {
      return NextResponse.redirect(data['@microsoft.graph.downloadUrl'])
    } else {
      return NextResponse.json({ error: 'No download url found.' }, { status: 404 })
    }
  }

  try {
    const { data: identityData } = await axiosInstance.get(requestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'name,size,id,lastModifiedDateTime,folder,file,video,image',
      },
    })

    if ('folder' in identityData) {
      const { data: folderData } = await axiosInstance.get(`${requestUrl}${isRoot ? '' : ':'}/children`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          ...{
            select: 'name,size,id,lastModifiedDateTime,folder,file,video,image',
            $top: siteConfig.maxItems,
          },
          ...(next ? { $skipToken: next } : {}),
          ...(sort ? { $orderby: sort } : {}),
        },
      })

      const nextPage = folderData['@odata.nextLink']
        ? folderData['@odata.nextLink'].match(/&\$skiptoken=(.+)/i)[1]
        : null

      const response = nextPage ? { folder: folderData, next: nextPage } : { folder: folderData }

      return NextResponse.json(response, { headers })
    }

    return NextResponse.json({ file: identityData }, { headers })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.response?.data ?? 'Internal server error.' },
      { status: error?.response?.status ?? 500 },
    )
  }
}
