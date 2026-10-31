import { ManagementError } from './driveManagement'
import type { ManagedItem } from './driveManagement'

export const MAX_REPLACEMENT_BYTES = 4 * 1024 * 1024

const codes = new Set([
  'invalid_request',
  'invalid_name',
  'unauthorized',
  'auth_unavailable',
  'outside_share',
  'protected_item',
  'item_changed',
  'item_not_found',
  'unsupported_item',
  'conflict',
  'write_failed',
  'write_uncertain',
  'rate_limited',
  'invalid_configuration',
  'upstream_unavailable',
  'file_too_large',
])

const validETag = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 1024 && /^"[\x21\x23-\x7e]+"$/.test(value)

function replacementFrom(data: unknown, previous: ManagedItem, size: number): ManagedItem | null {
  if (!data || typeof data !== 'object' || !('item' in data)) return null
  const item = data.item
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const value = item as Record<string, unknown>
  if (
    value.id !== previous.id ||
    value.name !== previous.name ||
    value.path !== previous.path ||
    value.kind !== 'file' ||
    value.size !== size ||
    !validETag(value.eTag)
  )
    return null
  return value as ManagedItem
}

export async function replaceManagedFile(
  item: ManagedItem,
  file: File,
  signal: AbortSignal,
  onProgress: (uploaded: number, total: number) => void,
): Promise<ManagedItem> {
  if (!Number.isSafeInteger(file.size) || file.size < 0) throw new ManagementError('invalid_request')
  if (file.size > MAX_REPLACEMENT_BYTES) throw new ManagementError('file_too_large')
  if (item.kind !== 'file') throw new ManagementError('unsupported_item')
  if (!item.id || !item.name || !item.path.startsWith('/') || !validETag(item.eTag)) {
    throw new ManagementError('invalid_request')
  }
  if (signal.aborted) throw new ManagementError('write_uncertain')

  return new Promise((resolve, reject) => {
    let xhr: XMLHttpRequest
    try {
      xhr = new XMLHttpRequest()
    } catch {
      reject(new ManagementError('write_uncertain'))
      return
    }
    let settled = false
    const cleanup = () => {
      signal.removeEventListener('abort', cancel)
      xhr.upload.removeEventListener('progress', progress)
      xhr.removeEventListener('load', loaded)
      xhr.removeEventListener('error', uncertain)
      xhr.removeEventListener('abort', uncertain)
      xhr.removeEventListener('timeout', uncertain)
    }
    const fail = (code: string) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new ManagementError(code))
    }
    const uncertain = () => fail('write_uncertain')
    const cancel = () => {
      // abort() need not emit an event before send(), so settle explicitly too.
      try {
        xhr.abort()
      } catch {
        uncertain()
        return
      }
      uncertain()
    }
    const progress = (event: ProgressEvent) => {
      if (!settled && Number.isFinite(event.loaded) && event.loaded >= 0) {
        onProgress(Math.min(event.loaded, file.size), file.size)
      }
    }
    const loaded = () => {
      if (settled) return
      let data: unknown
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        uncertain()
        return
      }
      if (xhr.status !== 200) {
        const code = data && typeof data === 'object' && 'error' in data ? data.error : null
        fail(xhr.status >= 400 && typeof code === 'string' && codes.has(code) ? code : 'write_uncertain')
        return
      }
      const result = replacementFrom(data, item, file.size)
      if (!result) {
        uncertain()
        return
      }
      settled = true
      cleanup()
      resolve(result)
    }
    try {
      xhr.upload.addEventListener('progress', progress)
      xhr.addEventListener('load', loaded)
      xhr.addEventListener('error', uncertain)
      xhr.addEventListener('abort', uncertain)
      xhr.addEventListener('timeout', uncertain)
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) {
        cancel()
        return
      }
      const query = new URLSearchParams({ path: item.path, id: item.id })
      xhr.open('PUT', '/api/manage/replace?' + query.toString())
      xhr.timeout = 120_000
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
      xhr.setRequestHeader('Content-Type', 'application/octet-stream')
      xhr.setRequestHeader('If-Match', item.eTag)
      xhr.setRequestHeader('X-File-Size', String(file.size))
      xhr.send(file)
    } catch {
      uncertain()
    }
  })
}
