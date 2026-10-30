import { posix as pathPosix } from 'path'

import axiosInstance from '../utils/axiosInstance'
import apiConfig from '../../config/api.config'
import siteConfig from '../../config/site.config'
import { matchProtectedPath } from '../utils/protectedPath'
import { revealObfuscatedToken } from '../utils/oAuthHandler'
import { compareHashedToken } from '../utils/protectedRouteHandler'
import {
  acquireOdRefreshLock, commitOdRefresh, getOdAuthTokens, releaseOdRefreshLock,
  storeOdAuthTokens, tokenStoreGeneration,
} from '../utils/odAuthTokenStore'
import { isPasswordFile } from './itemPath'
import { getOAuthClientSecret } from './oauthServerConfig'

const basePath = pathPosix.resolve('/', siteConfig.baseDirectory)

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

let refreshInFlight: { generation: number; promise: Promise<string> } | null = null

async function refreshAccessToken(): Promise<string> {
  const deadline = Date.now() + 2000
  try {
    while (Date.now() < deadline) {
      const current = await getOdAuthTokens(true)
      if (typeof current.accessToken === 'string' && current.accessToken && current.accessTokenTtl > ACCESS_TOKEN_MIN_TTL_SECONDS) {
        return current.accessToken
      }
      if (typeof current.refreshToken !== 'string' || !current.refreshToken) return ''
      const refreshToken = current.refreshToken
      const lease = await acquireOdRefreshLock(refreshToken)
      if (lease.changed) continue
      if (!lease.acquired) {
        await new Promise(resolve => setTimeout(resolve, 500))
        continue
      }

      let released = false
      try {
        // A different process may have refreshed between the read and lease acquisition.
        const latest = await getOdAuthTokens(true)
        if (latest.refreshToken !== refreshToken || (typeof latest.accessToken === 'string' && latest.accessToken && latest.accessTokenTtl > ACCESS_TOKEN_MIN_TTL_SECONDS)) continue
        const body = new URLSearchParams({
          client_id: apiConfig.clientId,
          redirect_uri: apiConfig.redirectUri,
          client_secret: getOAuthClientSecret(),
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        })
        const resp = await axiosInstance.post(apiConfig.authApi, body, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15000,
        })
        if (typeof resp.data?.access_token !== 'string' || typeof resp.data?.refresh_token !== 'string') return ''
        const committed = await commitOdRefresh({
          accessToken: resp.data.access_token,
          accessTokenExpiry: parseInt(resp.data.expires_in),
          refreshToken: resp.data.refresh_token,
        }, lease.owner, refreshToken)
        if (committed) {
          released = true
          return resp.data.access_token
        }
        // Reauthorization or lease expiry won the race; read the authoritative pair.
      } finally {
        if (!released) {
          await releaseOdRefreshLock(lease.owner).catch(error => console.error('Failed to release refresh lock:', error?.message))
        }
      }
    }
  } catch (error: any) {
    console.error('Failed to refresh access token:', error?.response?.data ?? error?.message)
    // A concurrent setup or an ambiguously acknowledged commit may have succeeded.
    try {
      const latest = await getOdAuthTokens(true)
      if (typeof latest.accessToken === 'string' && latest.accessToken && latest.accessTokenTtl > ACCESS_TOKEN_MIN_TTL_SECONDS) {
        return latest.accessToken
      }
    } catch {
      // Preserve the existing empty-token contract on refresh failures.
    }
  }
  return ''
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
    const flight = { generation, promise: refreshAccessToken() }
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
  if (isPasswordFile(cleanPath)) return { code: 404, message: 'Item not found.' }

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
