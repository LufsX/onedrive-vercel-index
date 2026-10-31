import { NextRequest } from 'next/server'
import apiConfig from '../../config/api.config'
import siteConfig from '../../config/site.config'
import axiosInstance from '../utils/axiosInstance'
import { authorize, readJson } from '../app/api/upload/shared'
import { checkAdminRateLimit } from './adminAuth'
import { clearCache } from './cache'
import { getAccessToken } from './odApi'
import { isPasswordFile } from './itemPath'
import { validUploadName } from './pathGuard'

export class MutationError extends Error {
  constructor(public code: string, public status: number) {
    super(code)
    this.name = 'MutationError'
  }
}

export type ManagedItem = {
  id: string
  name: string
  path: string
  eTag: string
  size: number
  kind: 'file' | 'folder'
}

type Metadata = Record<string, unknown> & {
  id: string
  name: string
  parentReference?: Record<string, unknown>
}
type Directory = {
  data: Metadata
  fullPath: string
  driveId?: string
  ids: Set<string>
}

const SELECT = 'id,name,parentReference,folder,file,remoteItem,eTag,size,root'
const samePath = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 1024 && value.isWellFormed() &&
  value !== '.' && value !== '..' && !/[\x00-\x20\x7f]/.test(value)
const existingName = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 255 && value.isWellFormed() &&
  value !== '.' && value !== '..' && !/[\x00-\x1f\x7f"*:<>?\\/|]/.test(value) && !/[. ]$/.test(value)

// The input is already decoded. In particular, never normalize away traversal
// or decode a percent sequence in a literal existing name.
export function validateManagedPath(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 4096 ||
      (value !== '/' && (value.slice(1).split('/').length > 64 ||
        value.slice(1).split('/').some(part => !existingName(part))))) {
    throw new MutationError('invalid_request', 400)
  }
  if (isPasswordFile(value)) throw new MutationError('protected_item', 403)
}

export function validManagedETag(value: unknown): value is string {
  // A single strong HTTP entity tag; "*" and weak/list values are not snapshots.
  return typeof value === 'string' && value.length <= 1024 && /^"[\x21\x23-\x7e]+"$/.test(value)
}

function baseDirectory(): string {
  const configured = siteConfig.baseDirectory
  const base = typeof configured === 'string' && configured !== '/' && configured.endsWith('/')
    ? configured.slice(0, -1) : configured
  try {
    validateManagedPath(base)
  } catch {
    throw new MutationError('invalid_configuration', 503)
  }
  return base as string
}

function fullPath(base: string, relative: string): string {
  return base === '/' ? relative : base + (relative === '/' ? '' : relative)
}

function kind(data: Metadata): ManagedItem['kind'] {
  if (data.remoteItem !== undefined) throw new MutationError('unsupported_item', 400)
  const file = record(data.file)
  const folder = record(data.folder)
  if (file === folder || (data.file !== undefined && !file) || (data.folder !== undefined && !folder)) {
    throw new MutationError('unsupported_item', 400)
  }
  return folder ? 'folder' : 'file'
}

function metadata(value: unknown): Metadata {
  if (!record(value) || !validId(value.id) || !existingName(value.name) ||
      (value.parentReference !== undefined && !record(value.parentReference))) {
    throw new MutationError('upstream_unavailable', 502)
  }
  const data = value as Metadata
  if (isPasswordFile(data.name)) throw new MutationError('protected_item', 403)
  kind(data)
  return data
}

function managed(data: Metadata, path: string): ManagedItem {
  if (!validManagedETag(data.eTag) || !Number.isSafeInteger(data.size) || (data.size as number) < 0) {
    throw new MutationError('upstream_unavailable', 502)
  }
  return { id: data.id, name: data.name, path, eTag: data.eTag, size: data.size as number, kind: kind(data) }
}

function statusOf(error: unknown): number | undefined {
  if (!record(error) || !record(error.response)) return undefined
  return typeof error.response.status === 'number' ? error.response.status : undefined
}

function upstreamError(error: unknown, write = false): MutationError {
  if (error instanceof MutationError) return error
  const status = statusOf(error)
  if (status === 412) return new MutationError('item_changed', 412)
  if (status === 409) return new MutationError('conflict', 409)
  if (status === 404) return new MutationError('item_not_found', 404)
  if (status === 429) return new MutationError('rate_limited', 429)
  if (!write) return new MutationError('upstream_unavailable', 502)
  if (status !== undefined && status >= 400 && status < 500) {
    return new MutationError('write_failed', status === 401 || status === 403 ? 403 : 502)
  }
  return new MutationError('write_uncertain', 502)
}

async function getMetadata(accessToken: string, endpoint: string, signal?: AbortSignal): Promise<Metadata> {
  try {
    const response = await axiosInstance.get(apiConfig.driveApi + endpoint, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Cache-Control': 'no-cache' },
      params: { select: SELECT },
      maxRedirects: 0,
      signal,
    })
    if (response.status !== 200) throw { response: { status: response.status } }
    return metadata(response.data)
  } catch (error) {
    throw upstreamError(error)
  }
}

function parentPath(data: Metadata): { path: string; driveId?: string } {
  const path = data.parentReference?.path
  if (typeof path !== 'string') throw new MutationError('upstream_unavailable', 502)
  const match = /^\/(?:drive|drives\/([^/]+))\/root:(\/.*)?$/i.exec(path)
  if (!match) throw new MutationError('upstream_unavailable', 502)
  let decoded: string
  try {
    decoded = match[2] ? '/' + match[2].slice(1).split('/').map(part => decodeURIComponent(part)).join('/') : '/'
    // Validate each decoded segment separately, before joining, to reject %2F.
    if (match[2]?.slice(1).split('/').some(part => !existingName(decodeURIComponent(part)))) throw new Error()
    validateManagedPath(decoded)
  } catch (error) {
    if (error instanceof MutationError && error.code === 'protected_item') throw error
    throw new MutationError('upstream_unavailable', 502)
  }
  return { path: decoded, driveId: match[1] }
}

function bindDrive(current: string | undefined, data: Metadata, pathDrive?: string): string | undefined {
  const drive = data.parentReference?.driveId
  if (drive !== undefined && !validId(drive)) throw new MutationError('upstream_unavailable', 502)
  for (const candidate of [drive, pathDrive]) {
    if (typeof candidate !== 'string') continue
    if (current !== undefined && current !== candidate) throw new MutationError('outside_share', 403)
    current = candidate
  }
  return current
}

function checkChild(data: Metadata, parent: Directory, expected: string): string | undefined {
  if (data.root !== undefined || data.id === parent.data.id ||
      data.parentReference?.id !== parent.data.id) throw new MutationError('item_changed', 409)
  const location = parentPath(data)
  const actual = location.path === '/' ? '/' + data.name : location.path + '/' + data.name
  if (!samePath(location.path, parent.fullPath) || !samePath(actual, expected)) {
    throw new MutationError('item_changed', 409)
  }
  return bindDrive(parent.driveId, data, location.driveId)
}

async function directory(accessToken: string, path: string, base: string, signal?: AbortSignal): Promise<Directory> {
  const expected = fullPath(base, path)
  const segments = expected === '/' ? [] : expected.slice(1).split('/')
  const locations = segments.map((_, index) => '/' + segments.slice(0, index + 1).join('/'))
  const endpoints = ['/root', ...locations.map(location =>
    '/root:/' + location.slice(1).split('/').map(part => encodeURIComponent(part)).join('/'),
  )]
  // All reads belong to this resolution only; validate the returned chain in order.
  const [root, ...ancestors] = await Promise.all(endpoints.map(endpoint => getMetadata(accessToken, endpoint, signal)))
  if (!record(root.root) || kind(root) !== 'folder') throw new MutationError('unsupported_item', 400)
  const rootReferencePath = root.parentReference?.path
  const rootPathDrive = typeof rootReferencePath === 'string'
    ? /^\/drives\/([^/]+)(?:\/|$)/i.exec(rootReferencePath)?.[1] : undefined
  let current: Directory = {
    data: root, fullPath: '/', driveId: bindDrive(undefined, root, rootPathDrive), ids: new Set([root.id]),
  }
  for (let index = 0; index < segments.length; index++) {
    const location = locations[index]
    const data = ancestors[index]
    const driveId = checkChild(data, current, location)
    if (kind(data) !== 'folder') throw new MutationError('unsupported_item', 400)
    if (current.ids.has(data.id)) throw new MutationError('item_changed', 409)
    current.ids.add(data.id)
    current = { data, fullPath: location, driveId, ids: current.ids }
  }
  return current
}

export async function resolveManagedDirectory(
  accessToken: string, path: string, signal?: AbortSignal,
): Promise<ManagedItem> {
  validateManagedPath(path)
  const found = await directory(accessToken, path, baseDirectory(), signal)
  return managed(found.data, path)
}

export async function resolveManagedItem(
  accessToken: string, path: string, id: string, signal?: AbortSignal,
): Promise<ManagedItem> {
  validateManagedPath(path)
  if (path === '/') throw new MutationError('protected_item', 403)
  if (!validId(id)) throw new MutationError('invalid_request', 400)
  const base = baseDirectory()
  const parent = path.slice(0, path.lastIndexOf('/')) || '/'
  const [resolvedParent, data] = await Promise.all([
    directory(accessToken, parent, base, signal),
    getMetadata(accessToken, '/items/' + encodeURIComponent(id), signal),
  ])
  if (data.id !== id) throw new MutationError('item_changed', 409)
  if (data.root !== undefined || resolvedParent.ids.has(data.id)) throw new MutationError('protected_item', 403)
  const location = parentPath(data)
  const actual = location.path === '/' ? '/' + data.name : location.path + '/' + data.name
  if (samePath(actual, base)) throw new MutationError('protected_item', 403)
  if (base !== '/' && !actual.toLowerCase().startsWith(base.toLowerCase() + '/')) {
    throw new MutationError('outside_share', 403)
  }
  checkChild(data, resolvedParent, fullPath(base, path))
  return managed(data, path)
}

export async function resolveManagedChild(
  accessToken: string, parentPath: string, name: string, signal?: AbortSignal,
): Promise<ManagedItem | null> {
  validateManagedPath(parentPath)
  if (!validUploadName(name)) throw new MutationError('invalid_name', 400)
  const path = parentPath === '/' ? '/' + name : parentPath + '/' + name
  validateManagedPath(path)
  const base = baseDirectory()
  const parent = await directory(accessToken, parentPath, base, signal)
  let data: Metadata
  try {
    data = await getMetadata(
      accessToken, '/items/' + encodeURIComponent(parent.data.id) + ':/' + encodeURIComponent(name), signal,
    )
  } catch (error) {
    // A missing parent or a failed boundary check must never look like an absent child.
    if (error instanceof MutationError && error.code === 'item_not_found' && error.status === 404) return null
    throw error
  }
  checkChild(data, parent, fullPath(base, path))
  if (parent.ids.has(data.id)) throw new MutationError('item_changed', 409)
  return managed(data, path)
}

export async function createManagedFolder(
  accessToken: string, path: string, name: string, signal?: AbortSignal,
): Promise<ManagedItem> {
  validateManagedPath(path)
  if (!validUploadName(name)) throw new MutationError('invalid_name', 400)
  const base = baseDirectory()
  const fresh = await directory(accessToken, path, base, signal)
  managed(fresh.data, path)
  const childPath = path === '/' ? '/' + name : path + '/' + name
  // Also enforce the path limit for the newly created item before any write.
  validateManagedPath(childPath)
  try {
    const response = await axiosInstance.post(
      apiConfig.driveApi + '/items/' + encodeURIComponent(fresh.data.id) + '/children',
      { name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
      { headers: { Authorization: `Bearer ${accessToken}` }, maxRedirects: 0, signal },
    )
    if (response.status !== 201) throw new MutationError('write_uncertain', 502)
    try {
      const data = metadata(response.data)
      if (kind(data) !== 'folder' || data.name !== name || fresh.ids.has(data.id)) throw new Error()
      checkChild(data, fresh, fullPath(base, childPath))
      return managed(data, childPath)
    } catch {
      throw new MutationError('write_uncertain', 502)
    }
  } catch (error) {
    throw upstreamError(error, true)
  } finally {
    // A lost or malformed response can follow a committed Graph write.
    clearCache()
  }
}

export async function deleteManagedFile(
  accessToken: string, path: string, id: string, eTag: string, signal?: AbortSignal,
): Promise<void> {
  if (!validManagedETag(eTag)) throw new MutationError('invalid_request', 400)
  const fresh = await resolveManagedItem(accessToken, path, id, signal)
  if (fresh.kind !== 'file') throw new MutationError('unsupported_item', 400)
  if (fresh.eTag !== eTag) throw new MutationError('item_changed', 412)
  try {
    const response = await axiosInstance.delete(apiConfig.driveApi + '/items/' + encodeURIComponent(fresh.id), {
      headers: { Authorization: `Bearer ${accessToken}`, 'If-Match': eTag },
      maxRedirects: 0,
      signal,
    })
    if (response.status !== 204) throw new MutationError('write_uncertain', 502)
  } catch (error) {
    throw upstreamError(error, true)
  } finally {
    clearCache()
  }
}

export function mutationError(error: unknown): MutationError {
  return error instanceof MutationError ? error : new MutationError('upstream_unavailable', 502)
}

export async function readManagementBody(request: NextRequest): Promise<Record<string, unknown>> {
  let denied: Response | null
  try {
    denied = await authorize(request)
  } catch {
    throw new MutationError('auth_unavailable', 503)
  }
  if (denied) {
    // Upload's Origin/HTTPS errors are translated into the management contract.
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
  try {
    const body = await readJson(request)
    if (!record(body)) throw new Error()
    return body
  } catch {
    throw new MutationError('invalid_request', 400)
  }
}

export async function mutationAccessToken(): Promise<string> {
  try {
    const token = await getAccessToken()
    if (!token) throw new Error()
    return token
  } catch {
    throw new MutationError('upstream_unavailable', 503)
  }
}

export function validateManagedId(value: unknown): asserts value is string {
  if (!validId(value)) throw new MutationError('invalid_request', 400)
}
