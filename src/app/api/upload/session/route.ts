import { NextRequest, NextResponse } from 'next/server'
import apiConfig from '../../../../../config/api.config'
import siteConfig from '../../../../../config/site.config'
import { encodePath, getAccessToken } from '../../../../lib/odApi'
import { clearCache } from '../../../../lib/cache'
import { checkAdminRateLimit } from '../../../../lib/adminAuth'
import { matchesUploadDirectory, uploadDirectory, validUploadName, validUploadUrl } from '../../../../lib/pathGuard'
import axiosInstance from '../../../../utils/axiosInstance'
import { authorize, errorResponse, headers, readJson } from '../shared'

// OneDrive's documented per-file limit is 250 GiB. Graph receives the file directly.
const MAX_FILE_SIZE = 250 * 1024 ** 3

function uploadLimit(): number | null {
  const configured = process.env.UPLOAD_MAX_BYTES
  if (configured === undefined) return MAX_FILE_SIZE
  if (!/^[1-9]\d*$/.test(configured)) return null
  const limit = Number(configured)
  return Number.isSafeInteger(limit) && limit <= MAX_FILE_SIZE ? limit : null
}

function renamedFile(name: string, index: number): string {
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 && name.length - dot <= 32 ? name.slice(dot) : ''
  const stem = extension ? name.slice(0, dot) : name
  const suffix = ` (${index})`
  const capacity = 255 - extension.length - suffix.length
  const prefix = Array.from(stem).reduce((result, char) => result.length + char.length <= capacity ? result + char : result, '')
  return prefix + suffix + extension
}

export async function POST(request: NextRequest) {
  const denied = await authorize(request)
  if (denied) return denied
  try {
    if (!(await checkAdminRateLimit('upload', 120))) return errorResponse('Upload rate limit exceeded.', 429)
  } catch {
    return errorResponse('Upload rate limit unavailable.', 503)
  }

  let body: unknown
  try {
    body = await readJson(request)
  } catch {
    return errorResponse('Invalid request body.', 400)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse('Invalid request body.', 400)
  const { path, name, size, conflictBehavior = 'rename' } = body as Record<string, unknown>
  const limit = uploadLimit()
  if (limit === null) return errorResponse('Invalid upload limit configuration.', 503)
  const directory = uploadDirectory(path)
  if (!directory || !validUploadName(name) || !Number.isSafeInteger(size) || (size as number) < 0 || (size as number) > limit || (conflictBehavior !== 'fail' && conflictBehavior !== 'rename')) {
    return errorResponse('Invalid upload path, name or size.', 400)
  }

  try {
    const accessToken = await getAccessToken()
    if (!accessToken) return errorResponse('No access token.', 403)
    const auth = { Authorization: `Bearer ${accessToken}` }
    const segments = directory === '/' ? [] : directory.slice(1).split('/')
    let parentId = ''
    for (let i = 0; i <= segments.length; i++) {
      const part = i === 0 ? '/' : '/' + segments.slice(0, i).join('/')
      const { data } = await axiosInstance.get(`${apiConfig.driveApi}/root${encodePath(part)}`, {
        headers: auth,
        params: { select: 'id,name,parentReference,folder,remoteItem' },
        maxRedirects: 0,
        signal: request.signal,
      })
      if (!matchesUploadDirectory(data, siteConfig.baseDirectory, part) || typeof data.id !== 'string' || !data.id) {
        return errorResponse('Invalid upload directory.', 400)
      }
      parentId = data.id
    }
    const targetFor = (filename: string) =>
      `${apiConfig.driveApi}/items/${encodeURIComponent(parentId)}:/${encodeURIComponent(filename)}:`
    if (size === 0) {
      try {
        for (let attempt = 0; attempt < 100; attempt++) {
          const filename = attempt === 0 ? name : renamedFile(name, attempt)
          try {
            const response = await axiosInstance.put(`${targetFor(filename)}/content`, Buffer.alloc(0), {
              headers: { ...auth, 'Content-Type': 'application/octet-stream', 'If-Match': '"0"' },
              maxRedirects: 0,
              signal: request.signal,
            })
            if (response.status !== 201 || typeof response.data?.id !== 'string' || response.data?.size !== 0) {
              return errorResponse('Invalid empty file response.', 502)
            }
            return NextResponse.json({ completed: true }, { headers })
          } catch (error: unknown) {
            const status = (error as { response?: { status?: number } })?.response?.status
            if ((status !== 409 && status !== 412) || conflictBehavior === 'fail') throw error
          }
        }
        return errorResponse('Could not find an available file name.', 409)
      } finally {
        // The write may have succeeded even if its response was lost.
        clearCache()
      }
    }
    const { data } = await axiosInstance.post(
      `${targetFor(name)}/createUploadSession`,
      { item: { '@microsoft.graph.conflictBehavior': conflictBehavior } },
      { headers: auth, maxRedirects: 0, signal: request.signal },
    )
    if (!validUploadUrl(data?.uploadUrl) || typeof data?.expirationDateTime !== 'string' ||
        !Number.isFinite(Date.parse(data.expirationDateTime)) || Date.parse(data.expirationDateTime) <= Date.now()) {
      return errorResponse('Invalid upload session response.', 502)
    }
    return NextResponse.json({ uploadUrl: data.uploadUrl, expirationDateTime: data.expirationDateTime }, { headers })
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 404) return errorResponse('Upload directory not found.', 404)
    if (status === 401 || status === 403) return errorResponse('OneDrive write access denied.', 403)
    if (status === 409 || status === 412) return errorResponse('An item with this name already exists.', 409)
    return errorResponse('Could not create upload session.', 502)
  }
}
