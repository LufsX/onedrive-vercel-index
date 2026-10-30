import axios from 'axios'
import { AES, Utf8 } from 'crypto-es'

import type { ClientApiConfig } from '../components/ClientConfigProvider'

// Just a disguise to obfuscate required tokens (including but not limited to client secret,
// access tokens, and refresh tokens), used along with the following two functions
const AES_SECRET_KEY = 'onedrive-vercel-index'
export function obfuscateToken(token: string): string {
  // Encrypt token with AES
  const encrypted = AES.encrypt(token, AES_SECRET_KEY)
  return encrypted.toString()
}
export function revealObfuscatedToken(obfuscated: string): string {
  // Decrypt SHA256 obfuscated token
  const decrypted = AES.decrypt(obfuscated, AES_SECRET_KEY)
  return decrypted.toString(Utf8)
}

// Generate the Microsoft OAuth 2.0 authorization URL, used for requesting the authorisation code
export function generateAuthorisationUrl(apiConfig: Pick<ClientApiConfig, 'clientId' | 'redirectUri' | 'authApi' | 'scope'>): string {
  const { clientId, redirectUri, authApi, scope } = apiConfig
  const authUrl = authApi.replace('/token', '/authorize')

  // Construct URL parameters for OAuth2
  const params = new URLSearchParams()
  params.append('client_id', clientId)
  params.append('redirect_uri', redirectUri)
  params.append('response_type', 'code')
  params.append('scope', scope)
  params.append('response_mode', 'query')

  return `${authUrl}?${params.toString()}`
}

// The code returned from the Microsoft OAuth 2.0 authorization URL is a request URL with hostname
// http://localhost and URL parameter code. This function extracts the code from the request URL
export function extractAuthCodeFromRedirected(url: string, redirectUri: string): string {
  // Return empty string if the url is not the defined redirect uri
  if (!url.startsWith(redirectUri)) {
    return ''
  }

  // New URL search parameter
  const params = new URLSearchParams(url.split('?')[1])
  return params.get('code') ?? ''
}

// After a successful authorisation, the code returned from the Microsoft OAuth 2.0 authorization URL
// will be used to request an access token. This function requests the access token with the authorisation code
// and returns the access token and refresh token on success.
export async function requestTokenWithAuthCode(
  code: string,
): Promise<
  | { expiryTime: number; accessToken: string; refreshToken: string }
  | { error: string; errorDescription: string; errorUri: string }
> {
  return axios
    .post('/api/oauth/token', { code }, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
    .then(resp => resp.data)
    .catch(err => {
      // A network failure has no response body; never let the wizard sit on
      // "Requesting tokens..." forever.
      const data = err?.response?.data
      if (!data || typeof data !== 'object' || typeof data.error !== 'string' || !data.error) {
        return {
          error: 'network_error',
          errorDescription: 'Could not reach the token service.',
          errorUri: '',
        }
      }

      return {
        error: data.error,
        errorDescription: typeof data.errorDescription === 'string' ? data.errorDescription : '',
        errorUri: typeof data.errorUri === 'string' ? data.errorUri : '',
      }
    })
}

// Verify the identity of the user with the access token and compare it with the userPrincipalName
// in the Microsoft Graph API. If the userPrincipalName matches, proceed with token storing.
export async function getAuthPersonInfo(accessToken: string, driveApi: string) {
  const profileApi = driveApi.replace('/drive', '')

  try {
    const response = await axios.get(profileApi, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return { data: response.data, status: response.status }
  } catch (error: any) {
    return { data: error?.response?.data ?? {}, status: error?.response?.status ?? 0 }
  }
}

export async function sendTokenToServer(accessToken: string, refreshToken: string, expiryTime: string, setupSecret: string) {
  return await axios.post(
    '/api',
    {
      obfuscatedAccessToken: obfuscateToken(accessToken),
      accessTokenExpiry: parseInt(expiryTime),
      obfuscatedRefreshToken: obfuscateToken(refreshToken),
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-oauth-setup-secret': setupSecret,
      },
    },
  )
}
