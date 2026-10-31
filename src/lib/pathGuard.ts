import { isPasswordFile, itemPath } from './itemPath'

// Paths are decoded, absolute paths relative to the configured shared directory.
export function uploadDirectory(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 4096) return null
  if (value === '/') return value
  const segments = value.slice(1).split('/')
  if (segments.length > 64 || segments.some(segment => !validUploadName(segment))) return null
  return isPasswordFile(value) ? null : value
}

export function validUploadName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 &&
    !value.startsWith('.') && !/[\x00-\x1f\x7f"*:<>?\\/|]/.test(value) &&
    !/[. ]$/.test(value) && !/%[0-9a-f]{2}/i.test(value) &&
    !['desktop.ini', 'thumbs.db', '$recycle.bin', 'system volume information'].includes(value.toLowerCase()) &&
    !isPasswordFile(value)
}

export function matchesUploadDirectory(item: unknown, baseDirectory: string, relativePath: string): boolean {
  if (!item || typeof item !== 'object') return false
  const record = item as Record<string, unknown>
  if (!record.folder || record.remoteItem) return false
  if (baseDirectory === '/' && relativePath === '/') return true
  const resolved = itemPath(item, baseDirectory)
  return resolved !== null && resolved.toLowerCase() === relativePath.toLowerCase()
}

export function validUploadUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 8192) return false
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    const trusted = host === 'my.microsoftpersonalcontent.com' || ['1drv.com', 'onedrive.com', 'sharepoint.com', 'sharepoint.cn'].some(
      domain => host.endsWith('.' + domain) && host.length > domain.length + 1,
    )
    return url.protocol === 'https:' && trusted && !url.username && !url.password && !url.port && !url.hash
  } catch {
    return false
  }
}
