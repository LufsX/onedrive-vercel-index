type Entry = { expires: number; pending: boolean; promise: Promise<unknown> }

const MAX_METADATA_ENTRIES = 500
const MAX_KIND_ENTRIES = 5000

// Process-local, bounded metadata cache, including in-flight requests.
const store = new Map<string, Entry>()
let generation = 0

export function cacheGeneration(): number {
  return generation
}

function pruneExpired<T extends { expires: number; pending?: boolean }>(entries: Map<string, T>, now: number): void {
  for (const [key, entry] of entries) {
    if (!entry.pending && entry.expires <= now) entries.delete(key)
  }
}

/** Cache successful values and coalesce concurrent loads, including loads slower than the TTL. */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  pruneExpired(store, Date.now())
  const hit = store.get(key)
  if (hit) return hit.promise as Promise<T>

  if (store.size >= MAX_METADATA_ENTRIES) {
    // Evict the oldest settled entry, never a flight another caller may join.
    const victim = [...store].find(([, entry]) => !entry.pending)
    if (victim) {
      store.delete(victim[0])
    } else {
      // At saturation, wait for a slot instead of growing a second, unbounded flight map.
      const version = generation
      await Promise.race([...store.values()].map(entry => entry.promise.catch(() => undefined)))
      if (version !== generation) return load()
      return cached(key, ttlMs, load)
    }
  }

  const entry: Entry = { expires: Infinity, pending: true, promise: Promise.resolve() }
  entry.promise = Promise.resolve()
    .then(load)
    .then(
      value => {
        entry.pending = false
        entry.expires = Date.now() + ttlMs
        if ((value === undefined || value === null) && store.get(key) === entry) store.delete(key)
        return value
      },
      error => {
        if (store.get(key) === entry) store.delete(key)
        throw error
      },
    )
  store.set(key, entry)
  return entry.promise as Promise<T>
}

/** Cache key for a drive path (paging and sorting produce distinct entries). */
export function cacheKeyFor(path: string, options: { next?: string; sort?: string; thumbnails?: string } = {}): string {
  return JSON.stringify(['listing', path, options.next ?? '', options.sort ?? '', options.thumbnails ?? ''])
}

/** Drop every cached drive response (used after tokens are re-authorised). */
export function clearCache(): void {
  generation++
  store.clear()
  kinds.clear()
}

// Path kinds let file requests skip the otherwise wasted folder probe.
const kinds = new Map<string, { kind: 'file' | 'folder'; expires: number }>()

export function rememberKinds(
  parentPath: string,
  items: Array<{ name: string; folder?: unknown; file?: unknown }>,
  ttlMs: number,
): void {
  const prefix = parentPath === '/' || parentPath === '' ? '' : parentPath
  const now = Date.now()
  pruneExpired(kinds, now)
  if (ttlMs <= 0) return
  for (const item of items) {
    const kind = item.folder ? 'folder' : item.file ? 'file' : undefined
    if (kind) setKind(`${prefix}/${item.name}`, kind, now + ttlMs)
  }
}

export function rememberKind(path: string, kind: 'file' | 'folder', ttlMs: number): void {
  const now = Date.now()
  pruneExpired(kinds, now)
  if (ttlMs <= 0) return
  setKind(path, kind, now + ttlMs)
}

function setKind(path: string, kind: 'file' | 'folder', expires: number): void {
  if (!kinds.has(path) && kinds.size >= MAX_KIND_ENTRIES) kinds.delete(kinds.keys().next().value!)
  kinds.set(path, { kind, expires })
}

export function knownKind(path: string): 'file' | 'folder' | undefined {
  pruneExpired(kinds, Date.now())
  return kinds.get(path)?.kind
}
