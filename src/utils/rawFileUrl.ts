/** Build a raw-file query from an encoded application pathname, excluding page options. */
export function rawFileUrl(pathname: string, options: Record<string, string> = {}): string {
  const path = decodeURIComponent(pathname.split(/[?#]/)[0])
  return '/api/raw/?' + new URLSearchParams({ path, ...options })
}
