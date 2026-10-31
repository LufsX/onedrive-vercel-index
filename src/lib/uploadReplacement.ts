import { createHash, randomBytes } from 'node:crypto'
import { NextRequest } from 'next/server'
import apiConfig from '../../config/api.config'
import siteConfig from '../../config/site.config'
import axiosInstance from '../utils/axiosInstance'
import { getRedisClient } from '../utils/redisClient'
import { authorize, readJson } from '../app/api/upload/shared'
import { checkAdminRateLimit } from './adminAuth'
import { clearCache } from './cache'
import {
  ManagedItem, MutationError, mutationError, resolveManagedChild, resolveManagedDirectory,
  resolveManagedItem, validManagedETag, validateManagedId, validateManagedPath,
} from './driveMutation'
import { uploadDirectory, validUploadName, validUploadUrl } from './pathGuard'

const TTL = 24 * 60 * 60
const SMALL = 4 * 1024 * 1024
const MAX = 250 * 1024 ** 3
const key = (id: string) => `${siteConfig.kvPrefix}upload:replacement:${id}`
const join = (parent: string, name: string) => parent === '/' ? '/' + name : parent + '/' + name
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
type Receipt = { ok: true; backupName: string; item: ManagedItem }
type Job = {
  owner: string
  target: ManagedItem
  parentPath: string
  parentId: string
  tempName: string
  backupName: string
  expectedSize: number
  phase: 'pending' | 'committing' | 'done' | 'failed' | 'uncertain'
  receipt?: Receipt
  error?: { code: string; status: number }
}
export class ReplacementError extends MutationError {
  constructor(code: string, status: number, public recovery: { backupName: string; tempName: string }) {
    super(code, status)
  }
}
const recovery = (job: Job) => ({ backupName: job.backupName, tempName: job.tempName })
const uncertain = (job: Job) => new ReplacementError('write_uncertain', 502, recovery(job))

export async function readReplacementBody(request: NextRequest, action: 'upload-prepare' | 'upload-commit') {
  let denied: Response | null
  try { denied = await authorize(request) } catch { throw new MutationError('auth_unavailable', 503) }
  if (denied) throw new MutationError(
    denied.status === 401 ? 'unauthorized' : denied.status >= 500 ? 'auth_unavailable' : 'invalid_request',
    denied.status,
  )
  try {
    if (!(await checkAdminRateLimit(action, 120))) throw new MutationError('rate_limited', 429)
  } catch (error) {
    if (error instanceof MutationError) throw error
    throw new MutationError('auth_unavailable', 503)
  }
  try {
    const body = await readJson(request)
    if (!record(body)) throw new Error()
    return body
  } catch { throw new MutationError('invalid_request', 400) }
}

export function replacementOwner(request: NextRequest): string {
  const cookie = request.cookies.get('admin_session')?.value
  if (!cookie || cookie.length > 1024) throw new MutationError('unauthorized', 401)
  return createHash('sha256').update(cookie).digest('hex')
}

function validateInput(body: Record<string, unknown>): { path: string; name: string; size: number } {
  validateManagedPath(body.path)
  const path = uploadDirectory(body.path)
  if (!path) throw new MutationError('invalid_request', 400)
  if (!validUploadName(body.name) || !body.name.isWellFormed()) throw new MutationError('invalid_name', 400)
  validateManagedPath(join(path, body.name))
  if (!Number.isSafeInteger(body.size) || (body.size as number) < 0) throw new MutationError('invalid_request', 400)
  const configured = process.env.UPLOAD_MAX_BYTES
  let limit = MAX
  if (configured !== undefined) {
    if (!/^[1-9]\d*$/.test(configured) || !Number.isSafeInteger(Number(configured)) || Number(configured) > MAX) {
      throw new MutationError('invalid_configuration', 503)
    }
    limit = Number(configured)
  }
  if ((body.size as number) > limit) throw new MutationError('file_too_large', 413)
  return { path, name: body.name, size: body.size as number }
}

function graphError(error: unknown, write: boolean): MutationError {
  if (error instanceof MutationError) return error
  const status = record(error) && record(error.response) ? error.response.status : undefined
  if (status === 412) return new MutationError('item_changed', 412)
  if (status === 409) return new MutationError('conflict', 409)
  if (status === 404) return new MutationError('item_not_found', 404)
  if (status === 429) return new MutationError('rate_limited', 429)
  if (write && typeof status === 'number' && status >= 400 && status < 500) {
    return new MutationError('write_failed', status === 401 || status === 403 ? 403 : 502)
  }
  return new MutationError(write ? 'write_uncertain' : 'upstream_unavailable', 502)
}
function config(token: string) {
  return { headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' }, timeout: 10000, maxRedirects: 0 }
}

export async function prepareReplacement(
  token: string, owner: string, body: Record<string, unknown>, signal?: AbortSignal,
) {
  const { path, name, size } = validateInput(body)
  const target = await resolveManagedChild(token, path, name, signal)
  if (!target) return { mode: 'create' as const }
  if (target.kind !== 'file') throw new MutationError('unsupported_item', 400)
  if (size <= SMALL) return { mode: 'replaceSmall' as const, item: target }
  const parent = await resolveManagedDirectory(token, path, signal)
  const tempName = `.__odvi-upload-${randomBytes(16).toString('hex')}.tmp`
  const prefix = `.__odvi-backup-${randomBytes(16).toString('hex')}-`
  // Truncate by UTF-16 units without leaving a split surrogate or trailing dot/space.
  const suffix = target.name.slice(0, 255 - prefix.length).replace(/[\uD800-\uDBFF]$/, '').replace(/[. ]+$/, '')
  const backupName = prefix + (suffix || 'file')
  validateManagedPath(join(path, tempName))
  validateManagedPath(join(path, backupName))
  const jobId = randomBytes(32).toString('hex')
  const job: Job = {
    owner, target, parentPath: path, parentId: parent.id, tempName, backupName, expectedSize: size, phase: 'pending',
  }
  // Reserve the job before creating the session. No upload URL or access token is persisted.
  try {
    if (await getRedisClient().set(key(jobId), JSON.stringify(job), 'EX', TTL, 'NX') !== 'OK') {
      throw new Error()
    }
  } catch { throw new MutationError('upstream_unavailable', 503) }
  try {
    const response = await axiosInstance.post(
      apiConfig.driveApi + '/items/' + encodeURIComponent(parent.id) + ':/' + encodeURIComponent(tempName) + ':/createUploadSession',
      { item: { '@microsoft.graph.conflictBehavior': 'fail' } },
      { ...config(token), signal },
    )
    const data: unknown = response.data
    if (response.status !== 200 || !record(data) || !validUploadUrl(data.uploadUrl) ||
        typeof data.expirationDateTime !== 'string' || !Number.isFinite(Date.parse(data.expirationDateTime)) ||
        Date.parse(data.expirationDateTime) <= Date.now()) {
      throw new MutationError('write_uncertain', 502)
    }
    return { mode: 'replaceLarge' as const, jobId, uploadUrl: data.uploadUrl, expirationDateTime: data.expirationDateTime }
  } catch (error) {
    throw graphError(error, true)
  } finally { clearCache() }
}

const RELEASE = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end; return 0"
const SAVE = "if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end; redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3]); return 1"

async function childId(token: string, parentId: string, name: string): Promise<string> {
  try {
    const response = await axiosInstance.get(
      apiConfig.driveApi + '/items/' + encodeURIComponent(parentId) + ':/' + encodeURIComponent(name),
      { ...config(token), params: { select: 'id' } },
    )
    if (response.status !== 200 || !record(response.data)) throw new MutationError('upstream_unavailable', 502)
    validateManagedId(response.data.id)
    return response.data.id
  } catch (error) { throw graphError(error, false) }
}

async function rename(token: string, item: ManagedItem, name: string, parentId: string, parentPath: string) {
  try {
    const response = await axiosInstance.patch(
      apiConfig.driveApi + '/items/' + encodeURIComponent(item.id),
      { '@microsoft.graph.conflictBehavior': 'fail', name },
      { ...config(token), headers: { ...config(token).headers, 'If-Match': item.eTag } },
    )
    const data: unknown = response.data
    if (response.status !== 200 || !record(data) || data.id !== item.id || data.name !== name ||
        data.size !== item.size || !validManagedETag(data.eTag) || !record(data.parentReference) ||
        data.parentReference.id !== parentId || !record(data.file) || data.folder !== undefined ||
        data.remoteItem !== undefined || data.root !== undefined) {
      throw new MutationError('write_uncertain', 502)
    }
    return { id: item.id, name, path: join(parentPath, name), eTag: data.eTag, size: item.size, kind: 'file' as const }
  } catch (error) { throw graphError(error, true) }
  finally { clearCache() }
}

// Read by ID after an ambiguous first rename; never repeat that rename based on a guessed version.
async function inspectOriginal(token: string, job: Job): Promise<void> {
  try {
    const response = await axiosInstance.get(
      apiConfig.driveApi + '/items/' + encodeURIComponent(job.target.id),
      { ...config(token), params: { select: 'id,name,eTag,parentReference,file,folder,remoteItem,size' } },
    )
    const data: unknown = response.data
    if (response.status !== 200 || !record(data) || data.id !== job.target.id ||
        !validManagedETag(data.eTag) || !record(data.parentReference) || data.parentReference.id !== job.parentId) return
    if (data.name === job.target.name || data.name === job.backupName) {
      await resolveManagedItem(token, join(job.parentPath, data.name), job.target.id)
    }
  } catch { /* The durable committing/uncertain state forbids automatic re-execution. */ }
}

export async function commitReplacement(token: string, owner: string, body: Record<string, unknown>): Promise<Receipt> {
  if (typeof body.jobId !== 'string' || !/^[a-f0-9]{64}$/.test(body.jobId)) throw new MutationError('invalid_request', 400)
  if (body.uploadedItemId !== undefined) validateManagedId(body.uploadedItemId)
  const redis = getRedisClient()
  const jobKey = key(body.jobId)
  const lockKey = jobKey + ':lock'
  const lockToken = randomBytes(32).toString('hex')
  let locked = false
  let job: Job | undefined
  const save = async (value: Job) => {
    if (await redis.eval(SAVE, 2, lockKey, jobKey, lockToken, JSON.stringify(value), String(TTL)) !== 1) {
      throw new Error('Replacement state unavailable')
    }
  }
  const lockOwned = async () => {
    if (await redis.get(lockKey) !== lockToken) throw new Error('Replacement lock expired')
  }
  try {
    // Check ownership before acquiring the lock so another admin cannot interfere with a job.
    const raw = await redis.get(jobKey)
    if (!raw) throw new MutationError('item_not_found', 404)
    try { job = JSON.parse(raw) as Job } catch { throw new MutationError('upstream_unavailable', 503) }
    if (!job || job.owner !== owner) throw new MutationError('unauthorized', 403)
    if (await redis.set(lockKey, lockToken, 'EX', 120, 'NX') !== 'OK') throw uncertain(job)
    locked = true
    const freshRaw = await redis.get(jobKey)
    if (!freshRaw) throw new MutationError('item_not_found', 404)
    job = JSON.parse(freshRaw) as Job
    if (job.owner !== owner) throw new MutationError('unauthorized', 403)
    if (job.phase === 'done' && job.receipt) return job.receipt
    if (job.phase === 'failed' && job.error) throw new MutationError(job.error.code, job.error.status)
    if (job.phase !== 'pending') throw uncertain(job)

    const parent = await resolveManagedDirectory(token, job.parentPath)
    if (parent.id !== job.parentId) throw new MutationError('item_changed', 409)
    const original = await resolveManagedItem(token, job.target.path, job.target.id)
    const named = await resolveManagedChild(token, job.parentPath, job.target.name)
    if (original.kind !== 'file' || original.name !== job.target.name || named?.id !== original.id) {
      throw new MutationError('item_changed', 409)
    }
    if (original.eTag !== job.target.eTag || named.eTag !== job.target.eTag) throw new MutationError('item_changed', 412)
    const tempId = await childId(token, job.parentId, job.tempName)
    if (tempId === original.id || (body.uploadedItemId !== undefined && tempId !== body.uploadedItemId)) {
      throw new MutationError('item_changed', 409)
    }
    const temp = await resolveManagedItem(token, join(job.parentPath, job.tempName), tempId)
    if (temp.kind !== 'file' || temp.name !== job.tempName || temp.size !== job.expectedSize) {
      throw new MutationError('item_changed', 409)
    }
    job.phase = 'committing'
    // Persist before any rename. A lost SET response cannot authorize another write.
    try { await save(job) } catch { throw uncertain(job) }
    let backup: ManagedItem
    try {
      await lockOwned()
      backup = await rename(token, original, job.backupName, job.parentId, job.parentPath)
    } catch (error) {
      const failure = graphError(error, true)
      if (failure.code === 'write_uncertain') {
        await inspectOriginal(token, job)
        throw uncertain(job)
      }
      job.phase = 'failed'
      job.error = { code: failure.code, status: failure.status }
      try { await save(job) } catch { throw uncertain(job) }
      throw failure
    }
    let final: ManagedItem
    try {
      await lockOwned()
      final = await rename(token, temp, job.target.name, job.parentId, job.parentPath)
    } catch (error) {
      const failure = graphError(error, true)
      if (failure.code !== 'write_uncertain') {
        // Restore only into an empty name, using the backup's fresh actual version.
        try {
          await lockOwned()
          const freshBackup = await resolveManagedItem(token, backup.path, backup.id)
          if (freshBackup.kind !== 'file' ||
              await resolveManagedChild(token, job.parentPath, job.target.name) !== null) throw new Error()
          await lockOwned()
          await rename(token, freshBackup, job.target.name, job.parentId, job.parentPath)
          job.phase = 'failed'
          job.error = { code: failure.code, status: failure.status }
          await save(job)
          throw failure
        } catch (rollbackError) {
          if (rollbackError === failure) throw failure
        }
      }
      throw uncertain(job)
    }
    const receipt: Receipt = { ok: true, backupName: job.backupName, item: final }
    job.phase = 'done'
    job.receipt = receipt
    try { await save(job) } catch { throw uncertain(job) }
    return receipt
  } catch (error) {
    if (job && (job.phase === 'committing' || error instanceof ReplacementError)) {
      job.phase = 'uncertain'
      delete job.receipt
      try { await save(job) } catch { /* A persisted committing state is also non-retryable. */ }
      throw uncertain(job)
    }
    throw mutationError(error)
  } finally {
    if (locked) {
      try { await redis.eval(RELEASE, 1, lockKey, lockToken) } catch { /* Lock expires automatically. */ }
    }
  }
}

export function replacementFailure(error: unknown) {
  const failure = mutationError(error)
  return {
    body: { error: failure.code, ...(error instanceof ReplacementError ? { recovery: error.recovery } : {}) },
    status: failure.status,
  }
}
