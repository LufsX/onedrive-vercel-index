/** Match plain drive paths, preserving the configured value used as the storage key. */
export function matchProtectedPath(path: string, routes: readonly string[]): string {
  const candidate = path.toLowerCase().replace(/\/+$/, '') + '/'
  let matched = ''
  let length = -1
  for (const route of routes) {
    if (typeof route !== 'string' || route === '') continue
    const directory = route.toLowerCase().replace(/\/+$/, '') + '/'
    if (candidate.startsWith(directory) && directory.length > length) {
      matched = route
      length = directory.length
    }
  }
  return matched
}
