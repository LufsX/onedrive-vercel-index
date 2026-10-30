import siteConfig from '../../config/site.config'
import { clearCache } from '../lib/cache'
import { getRedisClient } from './redisClient'

// Persistent key-value store is provided by Redis, hosted on Upstash
// https://vercel.com/integrations/upstash
// Using singleton pattern for better connection pooling
const getKv = () => getRedisClient()

const accessTokenKey = () => `${siteConfig.kvPrefix}access_token`
const refreshTokenKey = () => `${siteConfig.kvPrefix}refresh_token`

/** Whether a refresh token is stored (used to distinguish "not set up" from "temporarily failing"). */
export async function hasStoredRefreshToken(): Promise<boolean> {
  try {
    const pipeline = getKv().pipeline()
    pipeline.exists(refreshTokenKey())
    const result = await pipeline.exec()
    const [error, exists] = result?.[0] ?? []

    // When Redis itself is unavailable we cannot tell: assume configured, so
    // visitors are not pushed back into the setup wizard by an outage.
    if (error) return true
    return Number(exists) > 0
  } catch {
    return true
  }
}

type Tokens = { accessToken: unknown; refreshToken: unknown; accessTokenTtl: number }
let tokenCache: { tokens: Tokens; expires: number; tokenExpires: number } | null = null
let readInFlight: Promise<Tokens> | null = null
let generation = 0
const writesInFlight = new Set<Promise<unknown>>()

export function tokenStoreGeneration(): number {
  return generation
}

function invalidateTokenCache(): void {
  generation++
  tokenCache = null
  readInFlight = null
}

/** GET both tokens and TTL in one round trip; only cache usable, successful reads. */
export async function getOdAuthTokens(): Promise<Tokens> {
  if (writesInFlight.size) {
    await Promise.allSettled([...writesInFlight])
    return getOdAuthTokens()
  }
  const now = Date.now()
  if (tokenCache && tokenCache.expires > now) {
    return { ...tokenCache.tokens, accessTokenTtl: Math.floor((tokenCache.tokenExpires - now) / 1000) }
  }
  if (readInFlight) return readInFlight

  const version = generation
  const promise = (async () => {
    const started = Date.now()
    const pipeline = getKv().pipeline()
    pipeline.get(accessTokenKey())
    pipeline.get(refreshTokenKey())
    pipeline.ttl(accessTokenKey())
    const results = await pipeline.exec()

    // A write may have completed while this read was in transit. Retry rather
    // than publishing its old snapshot, even to callers already awaiting it.
    if (version !== generation) return getOdAuthTokens()
    if (!results || results.length !== 3) throw new Error('Incomplete token read.')
    const failed = results.find(([err]) => err)
    if (failed) throw failed[0]

    const ttl = Number(results[2][1])
    const tokenExpires = started + (Number.isFinite(ttl) ? ttl : -1) * 1000
    const tokens = {
      accessToken: results[0][1] ?? null,
      refreshToken: results[1][1] ?? null,
      accessTokenTtl: Math.floor((tokenExpires - Date.now()) / 1000),
    }
    const expires = Math.min(started + 30_000, tokenExpires - 120_000)
    if (typeof tokens.accessToken === 'string' && tokens.accessToken && expires > Date.now()) {
      tokenCache = { tokens, expires, tokenExpires }
    }
    return tokens
  })()
  readInFlight = promise
  try {
    return await promise
  } finally {
    if (readInFlight === promise) readInFlight = null
  }
}

export async function storeOdAuthTokens({
  accessToken,
  accessTokenExpiry,
  refreshToken,
}: {
  accessToken: string
  accessTokenExpiry: number
  refreshToken: string
}): Promise<void> {
  if (!accessToken || !refreshToken) {
    throw new Error('Refusing to store empty OneDrive tokens.')
  }

  const kv = getKv()
  // Guard against NaN/0 expiries: SET ... EX requires a positive integer, and a
  // failing command inside a pipeline is reported in the result instead of throwing.
  const expiry = Number.isFinite(accessTokenExpiry) && accessTokenExpiry > 0 ? Math.floor(accessTokenExpiry) : 3600

  const pipeline = kv.pipeline()
  pipeline.set(accessTokenKey(), accessToken, 'EX', expiry)
  pipeline.set(refreshTokenKey(), refreshToken)

  invalidateTokenCache()
  const write = Promise.resolve().then(() => pipeline.exec())
  writesInFlight.add(write)
  try {
    const results = await write
    if (!results || results.length !== 2) throw new Error('Incomplete token write.')
    const failed = results.find(([err]) => err)
    if (failed) throw failed[0]
    clearCache()
  } finally {
    // Also fence reads started during the write (or a partially failed pipeline).
    invalidateTokenCache()
    writesInFlight.delete(write)
  }
}
