export const readOnlyOAuthScope = 'user.read files.read offline_access'
const allowedReadOnlyScopes = new Set(['user.read', 'files.read', 'offline_access', 'openid', 'profile', 'email'])

export function isReadOnlyOAuthScope(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false
  const scopes = value
    .trim()
    .split(/\s+/)
    .map(scope => scope.toLowerCase().replace(/^https:\/\/graph\.microsoft\.com\//, ''))
  return (
    scopes.includes('files.read') &&
    scopes.includes('user.read') &&
    scopes.every(scope => allowedReadOnlyScopes.has(scope))
  )
}
