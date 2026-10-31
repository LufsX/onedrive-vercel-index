export type NavigationTarget = 'file' | 'folder'

const MAX_TARGETS = 1024

// Preserve valid surrogate pairs and replace lone surrogates before URI encoding.
function encodeSegment(segment: string): string {
  return encodeURIComponent(
    segment.replace(/([\uD800-\uDBFF][\uDC00-\uDFFF])|[\uD800-\uDFFF]/g, (match, pair) => pair ?? '\uFFFD'),
  )
}

/** Canonicalize an already encoded path, decoding each segment only once. */
export function canonicalNavigationPath(path: string): string {
  const segments = path.split('/').filter(Boolean)
  return (
    '/' +
    segments
      .map(segment =>
        encodeSegment(
          segment.replace(/(?:%[0-9a-f]{2})+/gi, encoded => {
            try {
              return decodeURIComponent(encoded)
            } catch {
              return encoded
            }
          }),
        ),
      )
      .join('/')
  )
}

/** Loading hints only; never use these records for access or mutation decisions. */
export function createNavigationTargetCache() {
  const targets = new Map<string, NavigationTarget>()

  function remember(path: string, type: NavigationTarget): void {
    const key = canonicalNavigationPath(path)
    // Root is always a folder and does not need an evictable entry.
    if (key === '/') return
    targets.delete(key)
    targets.set(key, type)
    if (targets.size > MAX_TARGETS) targets.delete(targets.keys().next().value!)
  }

  return {
    get(path: string): NavigationTarget | undefined {
      const key = canonicalNavigationPath(path)
      return key === '/' ? 'folder' : targets.get(key)
    },
    remember,
    rememberFolder(path: string, children: readonly { name: string; folder?: unknown }[]): void {
      const parent = canonicalNavigationPath(path)
      for (const child of children) {
        remember(`${parent === '/' ? '' : parent}/${encodeSegment(child.name)}`, child.folder ? 'folder' : 'file')
      }
      // Keep the current folder even when its children exceed the cache capacity.
      remember(parent, 'folder')
    },
  }
}

// FileListing populates this cache in a client effect; nothing is persisted.
export const navigationTargets = createNavigationTargetCache()
