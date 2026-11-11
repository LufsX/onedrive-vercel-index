// Graph encodes parent path segments, while item names and the configured base are decoded.
export function searchResultPath(parentPath: string, name: string, baseDirectory: string): string | null {
  const match = /^\/(?:drive|drives\/[^/]+)\/root:(\/.*)?$/i.exec(parentPath)
  if (!match || !name || name === '.' || name === '..' || /[/\\]/.test(name)) return null
  try {
    const parent = (match[1] ?? '').split('/').filter(Boolean).map(decodeURIComponent)
    if (parent.some(segment => segment === '.' || segment === '..' || /[/\\]/.test(segment))) return null
    const base = baseDirectory.split('/').filter(Boolean)
    if (base.some((segment, index) => segment.toLowerCase() !== parent[index]?.toLowerCase())) return null
    return '/' + [...parent.slice(base.length), name].map(encodeURIComponent).join('/')
  } catch {
    return null
  }
}
