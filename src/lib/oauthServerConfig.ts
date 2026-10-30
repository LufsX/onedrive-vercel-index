import 'server-only'

import { revealObfuscatedToken } from '../utils/oAuthHandler'

const defaultObfuscatedClientSecret =
  'U2FsdGVkX19cX6i43eNfkwzCcxDIRyIZSmgleJ68hPp7tRpjVihPpi89B2Itn0p6yo2Pz+gQ80w/5I2jKR6pdw=='

export function getOAuthClientSecret(): string {
  return process.env.OAUTH_CLIENT_SECRET || revealObfuscatedToken(defaultObfuscatedClientSecret)
}
