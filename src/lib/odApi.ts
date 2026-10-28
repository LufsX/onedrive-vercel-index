import { posix as pathPosix } from 'path'

import axiosInstance from '../utils/axiosInstance'
import apiConfig from '../../config/api.config'
import siteConfig from '../../config/site.config'
import { revealObfuscatedToken } from '../utils/oAuthHandler'
import { compareHashedToken } from '../utils/protectedRouteHandler'
import { getOdAuthTokens, storeOdAuthTokens } from '../utils/odAuthTokenStore'

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

export async function getAccessToken(): Promise<string> {
  const { accessToken, refreshToken } = await getOdAuthTokens()

  if (typeof accessToken === 'string') {
    console.log('Fetch access token from storage.')
    return accessToken
  }

  if (typeof refreshToken !== 'string' || refreshToken === '') {
    console.log('No refresh token, return empty access token.')
    return ''
  }

  const body = new URLSearchParams()
  body.append('client_id', apiConfig.clientId)
  body.append('redirect_uri', apiConfig.redirectUri)
  body.append('client_secret', clientSecret)
  body.append('refresh_token', refreshToken)
  body.append('grant_type', 'refresh_token')

  let resp
  try {
    resp = await axiosInstance.post(apiConfig.authApi, body, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
  } catch (error: any) {
    // A rejected refresh token means the site must be re-authorised: reply with an
    // empty token so callers return 403 and the client opens the OAuth flow.
    console.error('Failed to refresh access token:', error?.response?.data ?? error?.message)
    return ''
  }

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
  path = path.toLowerCase() + '/'
  const protectedRoutes = siteConfig.protectedRoutes as string[]
  let authTokenPath = ''
  for (let r of protectedRoutes) {
    if (typeof r !== 'string') continue
    r = r.toLowerCase().replace(/\/$/, '') + '/'
    if (path.startsWith(r)) {
      authTokenPath = `${r}.password`
      break
    }
  }
  return authTokenPath
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
