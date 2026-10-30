/**
 * This file contains the configuration for the API endpoints and tokens we use.
 *
 * - If you are a OneDrive International user, you would not have to change anything here.
 * - If you are not the admin of your OneDrive for Business account, you may need to define your own clientId and set OAUTH_CLIENT_SECRET,
 *   check documentation for more details.
 * - If you are using a E5 Subscription OneDrive for Business account, the direct links of your files are not the same here.
 *   In which case you would need to change directLinkRegex.
 */
// Computed lookup keeps public variables available at server runtime instead of build time.
const env = name => (typeof window === 'undefined' ? process.env[name] : undefined)
const url = (name, fallback) => {
  const value = env(name)
  if (value === undefined) return fallback
  try {
    const parsed = new URL(value)
    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username || parsed.password) throw new Error()
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL without credentials`)
  }
  return value
}

module.exports = {
  // The clientId and clientSecret are used to authenticate the user with Microsoft Graph API using OAuth. You would
  // not need to change anything here if you can authenticate with your personal Microsoft account with OneDrive International.
  clientId: env('NEXT_PUBLIC_CLIENT_ID') ?? '6280202a-1acd-47d6-b311-7a6367163699',

  // The redirectUri is the URL that the user will be redirected to after they have authenticated with Microsoft Graph API.
  // Likewise, you would not need to change redirectUri if you are using your personal Microsoft account with OneDrive International.
  redirectUri: url('NEXT_PUBLIC_REDIRECT_URI', 'http://localhost'),

  // These are the URLs of the OneDrive API endpoints. You would not need to change anything here if you are using OneDrive International
  // or E5 Subscription OneDrive for Business. You may need to change these if you are using OneDrive 世纪互联.
  authApi: url('NEXT_PUBLIC_AUTH_API', 'https://login.microsoftonline.com/common/oauth2/v2.0/token'),
  driveApi: url('NEXT_PUBLIC_DRIVE_API', 'https://graph.microsoft.com/v1.0/me/drive'),

  // The scope we require are listed here, in most cases you would not need to change this as well.
  scope: env('NEXT_PUBLIC_SCOPE') ?? 'user.read files.read.all offline_access',

  // Cache-Control header, check Vercel documentation for more details. The default settings imply:
  // - max-age=0: no cache for your browser
  // - s-maxage=0: cache is fresh for 60 seconds on the edge, after which it becomes stale
  // - stale-while-revalidate: allow serving stale content while revalidating on the edge
  // https://vercel.com/docs/concepts/edge-network/caching
  cacheControlHeader: env('NEXT_PUBLIC_CACHE_CONTROL_HEADER') ?? 'max-age=0, s-maxage=600, stale-while-revalidate',
}
