type Entry = { expires: number; promise: Promise<unknown> }

// Process-local cache for drive metadata. Los Angeles → Microsoft Graph round trips
// dominate every request, so even a short TTL turns navigation into an instant
// response and collapsing identical in-flight requests keeps a 100 item folder
// from firing 100 identical calls.
const store = new Map<string, Entry>()

/**
 * Return the cached value for `key`, or compute it (once, even when called
 * concurrently) and cache it for `ttlMs`.
 *
 * Failures are never cached. Values that resolve to `undefined` or `null` are
 * dropped so a transient miss is retried on the next request.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = store.get(key)

  if (hit && hit.expires > now) {
    return hit.promise as Promise<T>
  }

  const promise = load().then(
    value => {
      if (value === undefined || value === null) store.delete(key)
      return value
    },
    error => {
      store.delete(key)
      throw error
    },
  )

  store.set(key, { expires: now + ttlMs, promise })

  // Keep the map from growing without bound in a long lived process.
  if (store.size > 500) {
    for (const [entryKey, entry] of store) {
      if (entry.expires <= now) store.delete(entryKey)
    }
  }

  return promise
}

/** Cache key for a drive path (paging and sorting produce distinct entries). */
export function cacheKeyFor(path: string, options: { next?: string; sort?: string; thumbnails?: string } = {}): string {
  return `listing:${path}:${options.next ?? ''}:${options.sort ?? ''}:${options.thumbnails ?? ''}`
}

/** Drop every cached drive response (used after tokens are re-authorised). */
export function clearCache(): void {
  store.clear()
  kinds.clear()
}

// Whether a path is a folder or a file, learned from the listings we serve. It
// lets a file request skip the folder probe that would otherwise 404 first.
const kinds = new Map<string, { kind: 'file' | 'folder'; expires: number }>()

export function rememberKinds(
  parentPath: string,
  items: Array<{ name: string; folder?: unknown; file?: unknown }>,
  ttlMs: number,
): void {
  const prefix = parentPath === '/' || parentPath === '' ? '' : parentPath
  const expires = Date.now() + ttlMs

  for (const item of items) {
    const kind = item.folder ? 'folder' : item.file ? 'file' : undefined
    if (kind) kinds.set(`${prefix}/${item.name}`, { kind, expires })
  }
}

export function knownKind(path: string): 'file' | 'folder' | undefined {
  const hit = kinds.get(path)
  if (!hit) return undefined
  if (hit.expires <= Date.now()) {
    kinds.delete(path)
    return undefined
  }
  return hit.kind
}
