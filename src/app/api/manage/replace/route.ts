import { NextRequest, NextResponse } from 'next/server'
import apiConfig from '../../../../../config/api.config'
import { MutationError, resolveManagedItem } from '../../../../lib/driveMutation'
import { checkAdminRateLimit } from '../../../../lib/adminAuth'
import { clearCache } from '../../../../lib/cache'
import { getAccessToken } from '../../../../lib/odApi'
import axiosInstance from '../../../../utils/axiosInstance'
import { authorize, headers } from '../../upload/shared'

const MAX_BYTES = 4 * 1024 * 1024
const validETag = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 1024 && /^"[\x21\x23-\x7e]+"$/.test(value)
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const samePath = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

function declaredSize(value: string | null): number {
  if (value === null || !/^\d+$/.test(value)) throw new MutationError('invalid_request', 400)
  const size = Number(value)
  if (!Number.isSafeInteger(size)) throw new MutationError('invalid_request', 400)
  if (size > MAX_BYTES) throw new MutationError('file_too_large', 413)
  return size
}

async function readBytes(request: NextRequest, expectedSize: number): Promise<Buffer> {
  if (!request.body) {
    if (expectedSize === 0) return Buffer.alloc(0)
    throw new MutationError('invalid_request', 400)
  }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!(value instanceof Uint8Array)) throw new MutationError('invalid_request', 400)
      bytes += value.byteLength
      if (bytes > MAX_BYTES) throw new MutationError('file_too_large', 413)
      if (bytes > expectedSize) throw new MutationError('invalid_request', 400)
      chunks.push(value)
    }
    if (bytes !== expectedSize) throw new MutationError('invalid_request', 400)
    return Buffer.concat(chunks, bytes)
  } catch (error) {
    if (error instanceof MutationError) throw error
    throw new MutationError('invalid_request', 400)
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

function writeError(error: unknown): MutationError {
  if (error instanceof MutationError) return error
  const status = record(error) && record(error.response) ? error.response.status : undefined
  if (status === 412) return new MutationError('item_changed', 412)
  if (status === 404) return new MutationError('item_not_found', 404)
  if (status === 409) return new MutationError('conflict', 409)
  if (status === 429) return new MutationError('rate_limited', 429)
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new MutationError('write_failed', status === 401 || status === 403 ? 403 : 502)
  }
  return new MutationError('write_uncertain', 502)
}

export async function PUT(request: NextRequest) {
  try {
    let denied: Response | null
    try { denied = await authorize(request) } catch { throw new MutationError('auth_unavailable', 503) }
    if (denied) {
      const code = denied.status === 401 ? 'unauthorized' :
        denied.status >= 500 ? 'auth_unavailable' : 'invalid_request'
      throw new MutationError(code, denied.status)
    }
    try {
      if (!(await checkAdminRateLimit('manage', 120))) throw new MutationError('rate_limited', 429)
    } catch (error) {
      if (error instanceof MutationError) throw error
      throw new MutationError('auth_unavailable', 503)
    }

    const params = request.nextUrl.searchParams
    const path = params.get('path')
    const id = params.get('id')
    const eTag = request.headers.get('if-match')
    if (params.getAll('path').length !== 1 || params.getAll('id').length !== 1 ||
        path === null || id === null || !validETag(eTag) ||
        request.headers.get('content-type')?.trim().toLowerCase() !== 'application/octet-stream' ||
        (request.headers.get('content-encoding') !== null &&
          request.headers.get('content-encoding')?.trim().toLowerCase() !== 'identity')) {
      throw new MutationError('invalid_request', 400)
    }
    const size = declaredSize(request.headers.get('x-file-size'))
    const length = request.headers.get('content-length')
    if (length !== null && declaredSize(length) !== size) throw new MutationError('invalid_request', 400)

    let accessToken: string | null
    try { accessToken = await getAccessToken() } catch { throw new MutationError('upstream_unavailable', 503) }
    if (!accessToken) throw new MutationError('upstream_unavailable', 503)
    // The resolver owns path, ID, share boundary and protected-item checks.
    const before = await resolveManagedItem(accessToken, path, id, request.signal)
    if (before.kind !== 'file') throw new MutationError('unsupported_item', 400)
    if (before.id !== id || !samePath(before.path, path)) throw new MutationError('item_changed', 409)
    if (before.eTag !== eTag) throw new MutationError('item_changed', 412)

    const body = await readBytes(request, size)
    const fresh = await resolveManagedItem(accessToken, path, id, request.signal)
    if (fresh.kind !== 'file' || fresh.id !== before.id || fresh.name !== before.name ||
        !samePath(fresh.path, before.path)) throw new MutationError('item_changed', 409)
    if (fresh.eTag !== eTag) throw new MutationError('item_changed', 412)

    try {
      const response = await axiosInstance.put(
        apiConfig.driveApi + '/items/' + encodeURIComponent(fresh.id) + '/content', body,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream',
            'If-Match': eTag, 'Content-Length': String(body.byteLength),
          },
          maxRedirects: 0, maxBodyLength: MAX_BYTES, signal: request.signal,
        },
      )
      const data: unknown = response.data
      if (response.status !== 200 || !record(data) || data.id !== fresh.id ||
          data.name !== fresh.name || data.size !== size || !validETag(data.eTag) ||
          !record(data.file) || data.folder !== undefined || data.remoteItem !== undefined ||
          data.root !== undefined) {
        throw new MutationError('write_uncertain', 502)
      }
      return NextResponse.json({
        item: { id: fresh.id, name: fresh.name, path: fresh.path, eTag: data.eTag, size, kind: 'file' },
      }, { headers })
    } catch (error) {
      throw writeError(error)
    } finally {
      // A failed or malformed response may follow a committed write.
      clearCache()
    }
  } catch (error) {
    const failure = error instanceof MutationError ? error : new MutationError('upstream_unavailable', 502)
    return NextResponse.json({ error: failure.code }, { status: failure.status, headers })
  }
}
