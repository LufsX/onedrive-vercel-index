import { NextRequest, NextResponse } from 'next/server'
import { posix as pathPosix } from 'path'

import axiosInstance from '../utils/axiosInstance'
import { driveApi, cacheControlHeader } from '../../config/api.config'
import { checkAuthRoute, encodePath, getAccessToken } from './odApi'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'od-protected-token, Content-Type',
}

const corsResponse = (body: unknown, init: { status: number }) =>
  NextResponse.json(body, { status: init.status, headers: corsHeaders })

/**
 * Serve (or redirect to) the raw content of the drive item in `?path=`.
 *
 * Shared by `/api/raw` and `/api/name/[name]`: the latter only exists so that a
 * direct link can end with the file name, which some download managers need.
 */
export async function handleRawFile(request: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return corsResponse({ error: 'No access token.' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const path = searchParams.get('path') || '/'
  const odpt = searchParams.get('odpt') || ''
  const proxy = searchParams.get('proxy') === 'true'

  if (path === '[...path]') {
    return corsResponse({ error: 'No path specified.' }, { status: 400 })
  }

  const cleanPath = pathPosix.resolve('/', pathPosix.normalize(path))

  const odTokenHeader = request.headers.get('od-protected-token') || odpt
  const { code, message } = await checkAuthRoute(cleanPath, accessToken, odTokenHeader)

  if (code !== 200) {
    return corsResponse({ error: message }, { status: code })
  }

  const headers = new Headers(corsHeaders)
  if (message !== '') {
    headers.set('Cache-Control', 'no-cache')
  } else {
    headers.set('Cache-Control', cacheControlHeader)
  }

  try {
    const requestUrl = `${driveApi}/root${encodePath(cleanPath)}`
    const { data } = await axiosInstance.get(requestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'id,size,@microsoft.graph.downloadUrl',
      },
    })

    if (!('@microsoft.graph.downloadUrl' in data)) {
      return NextResponse.json({ error: 'No download url found.' }, { status: 404, headers })
    }

    if (proxy && 'size' in data && data['size'] < 4194304) {
      const response = await axiosInstance.get(data['@microsoft.graph.downloadUrl'] as string, {
        responseType: 'arraybuffer',
      })

      const responseHeaders = new Headers(headers)
      Object.entries(response.headers).forEach(([key, value]) => {
        if (typeof value === 'string') {
          responseHeaders.set(key, value)
        }
      })
      responseHeaders.set('Cache-Control', cacheControlHeader)

      return new NextResponse(new Uint8Array(response.data as ArrayBuffer), {
        status: 200,
        headers: responseHeaders,
      })
    }

    return NextResponse.redirect(data['@microsoft.graph.downloadUrl'], { headers })
  } catch (error: any) {
    return corsResponse(
      { error: error?.response?.data ?? 'Internal server error.' },
      { status: error?.response?.status ?? 500 },
    )
  }
}
