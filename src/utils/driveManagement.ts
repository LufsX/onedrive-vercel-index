export type ManagedItem = {
  id: string
  name: string
  path: string
  eTag: string
  size: number
  kind: 'file' | 'folder'
}

export class ManagementError extends Error {
  constructor(public code: string) {
    super(code)
  }
}

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
])

async function post(action: string, body: object, signal: AbortSignal, writing: boolean): Promise<unknown> {
  let response: Response
  try {
    response = await fetch('/api/manage/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(body),
      signal,
      cache: 'no-store',
    })
  } catch (error) {
    if (!writing && signal.aborted) throw error
    throw new ManagementError(writing ? 'write_uncertain' : 'upstream_unavailable')
  }
  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new ManagementError(writing ? 'write_uncertain' : 'upstream_unavailable')
  }
  if (!response.ok) {
    const code = data && typeof data === 'object' && 'error' in data ? data.error : null
    throw new ManagementError(
      typeof code === 'string' && codes.has(code)
        ? code
        : writing && response.status >= 500
          ? 'write_uncertain'
          : 'write_failed',
    )
  }
  return data
}

function itemFrom(data: unknown): ManagedItem | null {
  const item = data && typeof data === 'object' && 'item' in data ? data.item : null
  if (!item || typeof item !== 'object') return null
  const value = item as Record<string, unknown>
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.name !== 'string' ||
    !value.name ||
    typeof value.path !== 'string' ||
    !value.path.startsWith('/') ||
    typeof value.eTag !== 'string' ||
    value.eTag.length > 1024 ||
    !/^"[\x21\x23-\x7e]+"$/.test(value.eTag) ||
    typeof value.size !== 'number' ||
    !Number.isSafeInteger(value.size) ||
    value.size < 0 ||
    (value.kind !== 'file' && value.kind !== 'folder')
  )
    return null
  return value as ManagedItem
}

export async function inspectManagedItem(path: string, id: string, signal: AbortSignal): Promise<ManagedItem> {
  const item = itemFrom(await post('inspect', { path, id }, signal, false))
  if (!item || item.id !== id || item.path.toLowerCase() !== path.toLowerCase())
    throw new ManagementError('item_changed')
  return item
}

export async function createManagedFolder(path: string, name: string, signal: AbortSignal): Promise<ManagedItem> {
  const item = itemFrom(await post('folders', { path, name }, signal, true))
  if (
    !item ||
    item.kind !== 'folder' ||
    item.name !== name ||
    item.path.toLowerCase() !== ((path === '/' ? '' : path) + '/' + name).toLowerCase()
  ) {
    throw new ManagementError('write_uncertain')
  }
  return item
}

export async function deleteManagedFile(item: ManagedItem, signal: AbortSignal): Promise<void> {
  const data = await post('delete', { path: item.path, id: item.id, eTag: item.eTag }, signal, true)
  if (
    !data ||
    typeof data !== 'object' ||
    !('deleted' in data) ||
    data.deleted !== true ||
    !('id' in data) ||
    data.id !== item.id
  )
    throw new ManagementError('write_uncertain')
}
