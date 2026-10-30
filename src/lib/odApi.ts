import { posix as pathPosix } from 'path'

import axiosInstance from '../utils/axiosInstance'
import apiConfig from '../../config/api.config'
import siteConfig from '../../config/site.config'
import { matchProtectedPath } from '../utils/protectedPath'
import { revealObfuscatedToken } from '../utils/oAuthHandler'
import { compareHashedToken } from '../utils/protectedRouteHandler'
import { getOdAuthTokens, storeOdAuthTokens, tokenStoreGeneration } from '../utils/odAuthTokenStore'

const basePath = pathPosix.resolve('/', siteConfig.baseDirectory)
const clientSecret = revealObfuscatedToken(apiConfig.obfuscatedClientSecret)

type AuthCheck = { code: 200 | 401 | 404 | 500; message: string }

export function encodePath(path: string): string {
  let encodedPath = pathPosix.join(basePath, path)
  if (encodedPath === '/' || encodedPath === '') {
    return ''
  }
  encodedPath = encodedPath.replace(/\/$/, '')
  return `:${encodeURIComponent(encodedPath)}`
}

// Refresh before the token expires so a request never races its own expiry.
const ACCESS_TOKEN_MIN_TTL_SECONDS = 120

// Microsoft rotates the refresh token on every use, so two concurrent refreshes
// invalidate each other and leave the site with "no access token" for a moment.
let refreshInFlight: { generation: number; promise: Promise<string> } | null = null

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const generation = tokenStoreGeneration()
  const body = new URLSearchParams()
  body.append('client_id', apiConfig.clientId)
  body.append('redirect_uri', apiConfig.redirectUri)
  body.append('client_secret', clientSecret)
  body.append('refresh_token', refreshToken)
  body.append('grant_type', 'refresh_token')

  try {
    const resp = await axiosInstance.post(apiConfig.authApi, body, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    // A newer OAuth setup must not be overwritten by an older refresh response.
    if (generation !== tokenStoreGeneration()) return await getAccessToken()

    if ('access_token' in resp.data && 'refresh_token' in resp.data) {
      const { expires_in, access_token, refresh_token } = resp.data
      await storeOdAuthTokens({
        accessToken: access_token,
        accessTokenExpiry: parseInt(expires_in),
        refreshToken: refresh_token,
      })
      console.log('Fetch new access token with stored refresh token.')
      return access_token
    }

    return ''
  } catch (error: any) {
    // A rejected refresh token means the site has to be re-authorised: return an
    // empty token so callers answer 403 instead of asking for a password.
    console.error('Failed to refresh access token:', error?.response?.data ?? error?.message)
    return ''
  }
}

/**
 * Return a usable access token, refreshing it when it is missing or about to
 * expire. Resolves to an empty string when the site needs to be re-authorised,
 * which callers surface as a 403 instead of asking the user for a password.
 */
export async function getAccessToken(): Promise<string> {
  const version = tokenStoreGeneration()
  const { accessToken, refreshToken, accessTokenTtl: ttl } = await getOdAuthTokens()
  if (version !== tokenStoreGeneration()) return getAccessToken()
  const hasAccessToken = typeof accessToken === 'string' && accessToken !== ''

  if (hasAccessToken && ttl > ACCESS_TOKEN_MIN_TTL_SECONDS) {
    console.log('Fetch access token from storage.')
    return accessToken
  }

  if (typeof refreshToken !== 'string' || refreshToken === '') {
    console.log('No refresh token, return empty access token.')
    return ''
  }

  const generation = tokenStoreGeneration()
  if (!refreshInFlight || refreshInFlight.generation !== generation) {
    const flight = { generation, promise: refreshAccessToken(refreshToken) }
    refreshInFlight = flight
    void flight.promise.finally(() => {
      if (refreshInFlight === flight) refreshInFlight = null
    })
  }

  return refreshInFlight.promise
}

/**
 * Persist the OAuth tokens posted by the setup wizard.
 *
 * Everything is validated *before* anything is written: an invalid payload must
 * never be able to overwrite (and thereby destroy) a working token pair.
 */
export async function storeTokensFromRequestBody(body: unknown): Promise<boolean> {
  if (!body || typeof body !== 'object') return false

  const { obfuscatedAccessToken, obfuscatedRefreshToken, accessTokenExpiry } = body as Record<string, unknown>

  if (typeof obfuscatedAccessToken !== 'string' || typeof obfuscatedRefreshToken !== 'string') return false

  const expiry = Number(accessTokenExpiry)
  if (!Number.isFinite(expiry) || expiry <= 0) return false

  const accessToken = revealObfuscatedToken(obfuscatedAccessToken)
  const refreshToken = revealObfuscatedToken(obfuscatedRefreshToken)

  // Decrypting a malformed payload yields an empty string, which would otherwise
  // be stored as a "valid" token.
  if (!accessToken.trim() || !refreshToken.trim()) return false

  await storeOdAuthTokens({ accessToken, accessTokenExpiry: Math.floor(expiry), refreshToken })
  return true
}

export function getAuthTokenPath(path: string): string {
  const route = matchProtectedPath(path, siteConfig.protectedRoutes)
  return route ? route.toLowerCase().replace(/\/+$/, '') + '/.password' : ''
}

export async function checkAuthRoute(
  cleanPath: string,
  accessToken: string,
  odTokenHeader: string,
): Promise<AuthCheck> {
  const authTokenPath = getAuthTokenPath(cleanPath)

  if (authTokenPath === '') {
    return { code: 200, message: '' }
  }

  try {
    const token = await axiosInstance.get(`${apiConfig.driveApi}/root${encodePath(authTokenPath)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: '@microsoft.graph.downloadUrl,file',
      },
    })

    const odProtectedToken = await axiosInstance.get(token.data['@microsoft.graph.downloadUrl'])

    if (
      !compareHashedToken({
        odTokenHeader: odTokenHeader,
        dotPassword: odProtectedToken.data.toString(),
      })
    ) {
      return { code: 401, message: 'Password required.' }
    }
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return { code: 404, message: "You didn't set a password." }
    } else {
      return { code: 500, message: 'Internal server error.' }
    }
  }

  return { code: 200, message: 'Authenticated.' }
}
