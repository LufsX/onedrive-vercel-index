import { ManagementError } from './driveManagement'
import type { ManagedItem } from './driveManagement'
import { MAX_REPLACEMENT_BYTES, replaceManagedFile } from './replaceManagedFile'

const CHUNK_SIZE = 10 * 320 * 1024
const MAX_ATTEMPTS = 3

type UploadOptions = {
  file: File
  path: string
  signal: AbortSignal
  onProgress: (uploaded: number, total: number) => void
}

const writeHeaders = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }

function aborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel)
      resolve()
    }, ms)
    const cancel = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', cancel, { once: true })
  })
}

function offsetFromResponse(data: unknown, size: number): number {
  const ranges = (data as { nextExpectedRanges?: unknown })?.nextExpectedRanges
  if (!Array.isArray(ranges) || ranges.length !== 1 || typeof ranges[0] !== 'string') throw new Error('Invalid upload status')
  const match = /^(\d+)-(\d*)$/.exec(ranges[0])
  const offset = match ? Number(match[1]) : NaN
  const end = match?.[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= size ||
      !Number.isSafeInteger(end) || end < offset || end >= size) throw new Error('Invalid upload offset')
  return offset
}

export type UploadCompletion = { jobId: string; uploadedItemId?: string }
export type UploadResult = { backupName?: string; item?: ManagedItem } | void

export class UploadUncertainError extends Error {}
export class UploadCompletionError extends Error {
  public completion?: UploadCompletion

  constructor(message: string, options?: ErrorOptions & { completion?: UploadCompletion }) {
    super(message, options)
    this.completion = options?.completion
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 1024 &&
  value !== '.' && value !== '..' && !/[\x00-\x20\x7f]/.test(value)
const validETag = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 1024 && /^"[\x21\x23-\x7e]+"$/.test(value)
const childPath = (path: string, name: string) => (path === '/' ? '' : path) + '/' + name
const validName = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 255 &&
  value !== '.' && value !== '..' && !/[\x00-\x1f\x7f"*:<>?\\/|]/.test(value) &&
  !/[. ]$/.test(value) && value.toLowerCase() !== '.password'

function managedItem(value: unknown, path: string, name: string): value is ManagedItem {
  return record(value) && validId(value.id) && validName(value.name) &&
    value.name.toLowerCase() === name.toLowerCase() && typeof value.path === 'string' &&
    value.path.toLowerCase() === childPath(path, name).toLowerCase() &&
    value.kind === 'file' && validETag(value.eTag) &&
    typeof value.size === 'number' && Number.isSafeInteger(value.size) && value.size >= 0
}

function sessionUrl(data: unknown): string {
  if (!record(data) || typeof data.uploadUrl !== 'string' || data.uploadUrl.length > 8192 ||
      typeof data.expirationDateTime !== 'string' || !Number.isFinite(Date.parse(data.expirationDateTime)) ||
      Date.parse(data.expirationDateTime) <= Date.now()) throw new Error('Invalid upload session')
  try {
    const url = new URL(data.uploadUrl)
    const host = url.hostname.toLowerCase()
    const trusted = host === 'my.microsoftpersonalcontent.com' ||
      ['1drv.com', 'onedrive.com', 'sharepoint.com', 'sharepoint.cn'].some(domain => host.endsWith('.' + domain))
    if (url.protocol !== 'https:' || !trusted || url.username || url.password || url.port || url.hash) throw new Error()
    return url.href
  } catch { throw new Error('Invalid upload session') }
}

export async function completeUpload(
  path: string, name: string, signal: AbortSignal, completion?: UploadCompletion,
): Promise<UploadResult> {
  try {
    if (completion && (!/^[a-f0-9]{64}$/.test(completion.jobId) ||
        (completion.uploadedItemId !== undefined && !validId(completion.uploadedItemId)))) {
      throw new Error('Invalid upload completion')
    }
    const response = await fetch(completion ? '/api/upload/replace/commit' : '/api/upload/complete', {
      method: 'POST', headers: writeHeaders,
      body: JSON.stringify(completion
        ? { jobId: completion.jobId, ...(completion.uploadedItemId === undefined ? {} : { uploadedItemId: completion.uploadedItemId }) }
        : { path, name }),
      signal, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
    })
    if (!response.ok) throw new Error('Unable to finish upload')
    const data: unknown = await response.json()
    if (!completion) {
      if (response.status !== 200 || !record(data) || data.ok !== true) throw new Error('Invalid upload completion')
      return
    }
    if (response.status !== 200 || !record(data) || data.ok !== true || !validName(data.backupName) ||
        data.backupName.toLowerCase() === name.toLowerCase() || !managedItem(data.item, path, name) ||
        (completion.uploadedItemId !== undefined && data.item.id !== completion.uploadedItemId)) {
      throw new Error('Invalid upload completion')
    }
    return { backupName: data.backupName, item: data.item }
  } catch (error) {
    throw new UploadCompletionError('Unable to finish upload', { cause: error, completion })
  }
}

async function uploadStatus(url: string, size: number, signal: AbortSignal) {
  const response = await fetch(url, { signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' })
  if (!response.ok) throw new Error('Upload status unavailable')
  return offsetFromResponse(await response.json(), size)
}

export async function uploadToOnedrive({ file, path, signal, onProgress }: UploadOptions): Promise<UploadResult> {
  aborted(signal)
  const prepared = await fetch('/api/upload/prepare', {
    method: 'POST', headers: writeHeaders, body: JSON.stringify({ path, name: file.name, size: file.size }),
    signal, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
  })
  let data: unknown
  try { data = await prepared.json() } catch { throw new Error('Invalid upload preparation') }
  if (!prepared.ok) {
    if (record(data) && data.error === 'write_uncertain') throw new UploadUncertainError('Upload preparation status unknown')
    throw new Error('Unable to prepare upload')
  }
  if (prepared.status !== 200 || !record(data)) throw new Error('Invalid upload preparation')
  if (data.mode === 'replaceSmall') {
    if (file.size > MAX_REPLACEMENT_BYTES || !managedItem(data.item, path, file.name)) {
      throw new Error('Invalid upload preparation')
    }
    try {
      await replaceManagedFile(data.item, file, signal, onProgress)
    } catch (error) {
      if (error instanceof ManagementError && error.code === 'write_uncertain') {
        throw new UploadUncertainError('Replacement status unknown', { cause: error })
      }
      throw error
    }
    return
  }
  let completion: UploadCompletion | undefined
  if (data.mode === 'replaceLarge') {
    if (file.size <= MAX_REPLACEMENT_BYTES || typeof data.jobId !== 'string' || !/^[a-f0-9]{64}$/.test(data.jobId)) {
      throw new Error('Invalid upload preparation')
    }
    completion = { jobId: data.jobId }
  } else if (data.mode === 'create') {
    let session: Response
    try {
      session = await fetch('/api/upload/session', {
        method: 'POST', headers: writeHeaders,
        body: JSON.stringify({ path, name: file.name, size: file.size, conflictBehavior: 'fail' }),
        signal, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
      })
    } catch (error) {
      if (file.size === 0) throw new UploadUncertainError('Empty upload status unknown', { cause: error })
      throw error
    }
    if (!session.ok) {
      if (file.size === 0 && session.status >= 500) throw new UploadUncertainError('Empty upload status unknown')
      throw new Error('Unable to create upload session')
    }
    try { data = await session.json() } catch (error) {
      if (file.size === 0) throw new UploadUncertainError('Empty upload status unknown', { cause: error })
      throw new Error('Invalid upload session', { cause: error })
    }
    if (session.status !== 200) {
      if (file.size === 0) throw new UploadUncertainError('Invalid empty upload receipt')
      throw new Error('Invalid upload session')
    }
    if (file.size === 0) {
      if (!record(data) || data.completed !== true) throw new UploadUncertainError('Invalid empty upload receipt')
      onProgress(0, 0)
      return completeUpload(path, file.name, signal)
    }
  } else throw new Error('Invalid upload preparation')
  const uploadUrl = sessionUrl(data)
  try {
    const uploadedItemId = await uploadChunks(uploadUrl, file, signal, onProgress, !!completion)
    if (completion) completion = { ...completion, uploadedItemId }
  } catch (error) {
    if (completion && error instanceof UploadUncertainError) {
      throw new UploadCompletionError('Temporary upload status unknown', { cause: error, completion })
    }
    throw error
  }
  const result = await completeUpload(path, file.name, signal, completion)
  if (completion && result?.item?.size !== file.size) {
    throw new UploadCompletionError('Invalid replacement size', { completion })
  }
  return result
}

async function uploadChunks(
  uploadUrl: string, file: File, signal: AbortSignal,
  onProgress: (uploaded: number, total: number) => void, replacement: boolean,
): Promise<string> {
  let offset = 0
  let attempts = 0
  onProgress(0, file.size)
  while (offset < file.size) {
    aborted(signal)
    const end = Math.min(offset + CHUNK_SIZE, file.size)
    let response: Response
    try {
      response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Range': `bytes ${offset}-${end - 1}/${file.size}` },
        body: file.slice(offset, end), signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
      })
    } catch (error) {
      if ((replacement || signal.aborted) && end === file.size) {
        throw new UploadUncertainError('Final upload status unknown', { cause: error })
      }
      aborted(signal)
      if (++attempts >= MAX_ATTEMPTS) {
        if (end === file.size) throw new UploadUncertainError('Final upload status unknown', { cause: error })
        throw error
      }
      await delay(500 * attempts, signal)
      let next: number
      try {
        next = await uploadStatus(uploadUrl, file.size, signal)
      } catch (statusError) {
        aborted(signal)
        if (end === file.size) throw new UploadUncertainError('Final upload status unknown', { cause: statusError })
        throw statusError
      }
      if (next !== offset && next !== end) throw new Error('Unexpected upload offset')
      offset = next
      onProgress(offset, file.size)
      continue
    }
    if (response.status === 200 || response.status === 201) {
      if (replacement && (end !== file.size || response.status !== 201)) {
        throw new UploadUncertainError('Invalid temporary upload receipt')
      }
      if (end !== file.size) throw new Error('Unexpected upload completion')
      let item
      try {
        item = await response.json()
      } catch (error) {
        throw new UploadUncertainError('Final upload status unknown', { cause: error })
      }
      if (!record(item) || !validId(item.id)) throw new UploadUncertainError('Invalid uploaded item')
      offset = file.size
      onProgress(offset, file.size)
      return item.id
    }
    if (response.status === 202) {
      if (replacement && end === file.size) throw new UploadUncertainError('Final upload status unknown')
      const next = offsetFromResponse(await response.json(), file.size)
      if (next !== end) throw new Error('Unexpected upload offset')
      offset = next
      attempts = 0
      onProgress(offset, file.size)
      continue
    }
    if (replacement && end === file.size && response.status >= 500) {
      throw new UploadUncertainError('Final upload status unknown')
    }
    if (response.status !== 429 && response.status < 500) throw new Error('Upload rejected')
    if (++attempts >= MAX_ATTEMPTS) {
      if (end === file.size) throw new UploadUncertainError('Final upload status unknown')
      throw new Error('Upload failed')
    }
    await delay(500 * attempts, signal)
    let next: number
    try {
      next = await uploadStatus(uploadUrl, file.size, signal)
    } catch (error) {
      aborted(signal)
      if (end === file.size) throw new UploadUncertainError('Final upload status unknown', { cause: error })
      throw error
    }
    if (next !== offset && next !== end) throw new Error('Unexpected upload offset')
    offset = next
    onProgress(offset, file.size)
  }
  throw new UploadUncertainError('Missing uploaded item')
}
