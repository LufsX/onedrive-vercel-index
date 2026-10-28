import siteConfig from '../../config/site.config'
import { getRedisClient } from './redisClient'

// Persistent key-value store is provided by Redis, hosted on Upstash
// https://vercel.com/integrations/upstash
// Using singleton pattern for better connection pooling
const getKv = () => getRedisClient()

const accessTokenKey = () => `${siteConfig.kvPrefix}access_token`
const refreshTokenKey = () => `${siteConfig.kvPrefix}refresh_token`

export async function getOdAuthTokens(): Promise<{ accessToken: unknown; refreshToken: unknown }> {
  const kv = getKv()

  // Use pipeline for parallel reads to reduce round trips
  const pipeline = kv.pipeline()
  pipeline.get(accessTokenKey())
  pipeline.get(refreshTokenKey())

  const results = await pipeline.exec()

  return {
    accessToken: results?.[0]?.[1] ?? null,
    refreshToken: results?.[1]?.[1] ?? null,
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

  const results = await pipeline.exec()
  const failed = results?.find(([err]) => err)
  if (failed) throw failed[0]
}
