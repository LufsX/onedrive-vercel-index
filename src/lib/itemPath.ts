import { posix as path } from 'path'

// Graph returns an encoded parent path, but the item name is already decoded.
export function itemPath(item: unknown, baseDirectory: string): string | null {
  if (!item || typeof item !== 'object') return null
  const { name, parentReference } = item as { name?: unknown; parentReference?: { path?: unknown } }
  if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[/\\]/.test(name)) return null
  const parent = parentReference?.path
  if (typeof parent !== 'string') return null
  const match = /^\/(?:drive|drives\/[^/]+)\/root:(\/.*)?$/i.exec(parent)
  if (!match) return null

  try {
    const segments = (match[1] || '')
      .split('/')
      .filter(Boolean)
      .map(segment => decodeURIComponent(segment))
    if (segments.some(segment => !segment || segment === '.' || segment === '..' || /[/\\]/.test(segment))) return null
    const full = '/' + [...segments, name].join('/')
    const base = path.resolve('/', baseDirectory)
    if (
      base !== '/' &&
      full.toLowerCase() !== base.toLowerCase() &&
      !full.toLowerCase().startsWith(base.toLowerCase() + '/')
    )
      return null
    return base === '/' ? full : full.slice(base.length) || '/'
  } catch {
    return null
  }
}

export function validProtectedRoutes(routes: unknown): routes is string[] {
  return (
    Array.isArray(routes) &&
    routes.every(route => {
      if (typeof route !== 'string') return false
      if (route === '') return true
      return (
        route.startsWith('/') &&
        !route.includes('\\') &&
        !route.includes('//') &&
        !route.split('/').some(part => part === '.' || part === '..')
      )
    })
  )
}

export function isPasswordFile(path: string): boolean {
  return path.split('/').some(segment => segment.toLowerCase() === '.password')
}
