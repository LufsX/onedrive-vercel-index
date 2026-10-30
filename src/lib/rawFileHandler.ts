import { NextRequest, NextResponse } from 'next/server'
import { posix as pathPosix } from 'path'
import { Readable, Transform, pipeline } from 'stream'

import axiosInstance from '../utils/axiosInstance'
import { driveApi, cacheControlHeader } from '../../config/api.config'
import { checkAuthRoute, encodePath, getAccessToken } from './odApi'
import { cached } from './cache'

const MAX_PROXY_BYTES = 4 * 1024 * 1024

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'od-protected-token, Content-Type, Range, If-Range',
  'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range, Content-Length, Content-Disposition',
}

const corsResponse = (body: unknown, init: { status: number }) =>
  NextResponse.json(body, {
    status: init.status,
    headers: { ...corsHeaders, 'Cache-Control': 'private, no-store' },
  })

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
  const inline = searchParams.get('inline') === 'true'

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
    headers.set('Cache-Control', 'private, no-store')
  } else {
    headers.set('Cache-Control', cacheControlHeader)
  }

  // Inline delivery is restricted to PDF so arbitrary HTML/SVG cannot run on this origin.
  if (inline && pathPosix.extname(cleanPath).toLowerCase() !== '.pdf') {
    return corsResponse({ error: 'Inline preview is only available for PDF files.' }, { status: 400 })
  }
  if (inline) headers.set('Cache-Control', 'private, no-store')
  const range = inline ? request.headers.get('range') : null
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) {
    return corsResponse({ error: 'A single byte range is required.' }, { status: 416 })
  }

  try {
    const requestUrl = `${driveApi}/root${encodePath(cleanPath)}`
    const load = async () => {
      const { data } = await axiosInstance.get(requestUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { select: 'id,size,@microsoft.graph.downloadUrl' },
      })
      return data
    }
    const data = message === '' ? await cached(JSON.stringify(['raw', cleanPath]), 30_000, load) : await load()

    if (!('@microsoft.graph.downloadUrl' in data)) {
      return NextResponse.json({ error: 'No download url found.' }, { status: 404, headers })
    }

    if (inline || (proxy && typeof data.size === 'number' && data.size >= 0 && data.size < MAX_PROXY_BYTES)) {
      const controller = new AbortController()
      const abort = () => controller.abort()
      request.signal.addEventListener('abort', abort, { once: true })
      if (request.signal.aborted) abort()

      let streaming = false
      try {
        const response = await axiosInstance.get<Readable>(data['@microsoft.graph.downloadUrl'], {
          responseType: 'stream',
          signal: controller.signal,
          ...(inline
            ? {
                headers: {
                  'Accept-Encoding': 'identity',
                  ...(range ? { Range: range } : {}),
                  ...(range && request.headers.get('if-range') ? { 'If-Range': request.headers.get('if-range')! } : {}),
                },
                decompress: false,
                validateStatus: (status: number) => status === 200 || status === 206 || status === 416,
              }
            : {}),
        })
        const upstream = response.data
        const length = response.headers['content-length']
        // Axios removes content-encoding after decompression. Any remaining encoding
        // cannot be served as an unencoded body; count decompressed bytes below.
        const encoding = response.headers['content-encoding']
        if (encoding && encoding !== 'identity') {
          upstream.destroy()
          return NextResponse.json({ error: 'Unsupported upstream encoding.' }, { status: 502, headers })
        }
        if (!inline && length !== undefined && Number(length) >= MAX_PROXY_BYTES) {
          upstream.destroy()
          return NextResponse.json({ error: 'Proxy size limit exceeded.' }, { status: 413, headers })
        }

        const responseHeaders = new Headers(headers)
        for (const key of ['content-type', 'content-disposition', 'last-modified']) {
          const value = response.headers[key]
          if (typeof value === 'string') responseHeaders.set(key, value)
        }

        if (inline) {
          responseHeaders.set('Content-Type', 'application/pdf')
          responseHeaders.set(
            'Content-Disposition',
            `inline; filename*=UTF-8''${encodeURIComponent(pathPosix.basename(cleanPath)).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`,
          )
          responseHeaders.set('X-Content-Type-Options', 'nosniff')
          for (const key of ['accept-ranges', 'content-range', 'content-length', 'etag']) {
            const value = response.headers[key]
            if (typeof value === 'string') responseHeaders.set(key, value)
          }
          if (response.status === 416) {
            upstream.destroy()
            responseHeaders.delete('Content-Length')
            return new NextResponse(null, { status: 416, headers: responseHeaders })
          }
        }

        let bytes = 0
        const limited = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            bytes += chunk.length
            callback(!inline && bytes >= MAX_PROXY_BYTES ? new Error('Proxy size limit exceeded.') : null, chunk)
          },
        })
        // Pipeline propagates upstream errors and destroys the HTTP stream when
        // the Web stream is cancelled, including when the client disconnects.
        pipeline(upstream, limited, error => {
          request.signal.removeEventListener('abort', abort)
          if (error) controller.abort()
        })
        streaming = true
        return new NextResponse(
          Readable.toWeb(limited, {
            strategy: { highWaterMark: limited.readableHighWaterMark, size: chunk => chunk.byteLength },
          }) as ReadableStream<Uint8Array>,
          { status: inline ? response.status : 200, headers: responseHeaders },
        )
      } catch (error) {
        controller.abort()
        throw error
      } finally {
        if (!streaming) {
          controller.abort()
          request.signal.removeEventListener('abort', abort)
        }
      }
    }

    return NextResponse.redirect(data['@microsoft.graph.downloadUrl'], { headers })
  } catch (error: any) {
    const errorData = error?.response?.data
    const isStream = typeof errorData?.destroy === 'function'
    if (isStream) errorData.destroy()
    return corsResponse(
      { error: isStream ? 'Upstream download failed.' : (errorData ?? 'Internal server error.') },
      { status: error?.response?.status ?? 500 },
    )
  }
}
