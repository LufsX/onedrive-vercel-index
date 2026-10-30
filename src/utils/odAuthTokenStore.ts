import { randomUUID } from 'crypto'
import siteConfig from '../../config/site.config'
import { clearCache } from '../lib/cache'
import { getRedisClient } from './redisClient'

const accessTokenKey = () => `${siteConfig.kvPrefix}access_token`
const refreshTokenKey = () => `${siteConfig.kvPrefix}refresh_token`
const refreshLockKey = () => `${siteConfig.kvPrefix}refresh_token_lock`

// All three keys must be on the same Redis server (or cluster hash slot).
const readScript = `
return {redis.call('GET', KEYS[1]), redis.call('GET', KEYS[2]), redis.call('TTL', KEYS[1])}
`
const writeScript = `
if ARGV[4] ~= '' and (redis.call('GET', KEYS[3]) ~= ARGV[4] or redis.call('GET', KEYS[2]) ~= ARGV[5]) then
  return 0
end
redis.call('MSET', KEYS[1], ARGV[1], KEYS[2], ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('DEL', KEYS[3])
return 1
`
const acquireScript = `
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return -1 end
if redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3], 'NX') then return 1 end
return 0
`
const releaseScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`

/** Whether a refresh token is stored; an outage must not trigger setup. */
export async function hasStoredRefreshToken(): Promise<boolean> {
  try {
    return (await getRedisClient().exists(refreshTokenKey())) > 0
  } catch {
    return true
  }
}

type Tokens = { accessToken: unknown; refreshToken: unknown; accessTokenTtl: number }
type TokenWrite = { accessToken: string; accessTokenExpiry: number; refreshToken: string }
let generation = 0
let writesInFlight = 0
let cached: { tokens: Tokens; expiresAt: number; tokenExpiresAt: number } | undefined
let inFlight: Promise<Tokens> | undefined

export function tokenStoreGeneration(): number {
  return generation
}

/** Cache valid pairs for at most five seconds; other instances can observe old tokens for that long. */
export async function getOdAuthTokens(forceLive = false): Promise<Tokens> {
  const now = Date.now()
  if (!forceLive && cached && now < cached.expiresAt) {
    return { ...cached.tokens, accessTokenTtl: Math.floor((cached.tokenExpiresAt - now) / 1000) }
  }
  if (!forceLive && inFlight) return inFlight

  const readGeneration = generation
  const readStarted = Date.now()
  const read = readTokens().then(({ tokens, tokenExpiresAt }) => {
    const expiresAt = Math.min(readStarted + 5000, tokenExpiresAt - 120000)
    if (!forceLive && !writesInFlight && generation === readGeneration &&
      typeof tokens.accessToken === 'string' && tokens.accessToken.length > 0 && expiresAt > Date.now()) {
      cached = { tokens: { ...tokens }, expiresAt, tokenExpiresAt }
    }
    return tokens
  })
  if (forceLive) return read
  inFlight = read
  try {
    return await read
  } finally {
    if (inFlight === read) inFlight = undefined
  }
}

async function readTokens(): Promise<{ tokens: Tokens; tokenExpiresAt: number }> {
  const started = Date.now()
  const result = await getRedisClient().eval(readScript, 2, accessTokenKey(), refreshTokenKey())
  if (!Array.isArray(result) || result.length !== 3) throw new Error('Incomplete token read.')
  const ttl = Number(result[2])
  const tokenExpiresAt = started + ttl * 1000
  return { tokens: {
    accessToken: result[0],
    refreshToken: result[1],
    accessTokenTtl: Number.isFinite(ttl) ? Math.floor((tokenExpiresAt - Date.now()) / 1000) : -1,
  }, tokenExpiresAt }
}

async function writeTokens(tokens: TokenWrite, lockOwner = '', expectedRefreshToken = ''): Promise<boolean> {
  if (!tokens.accessToken || !tokens.refreshToken) throw new Error('Refusing to store empty OneDrive tokens.')
  const expiry = Number.isFinite(tokens.accessTokenExpiry) && tokens.accessTokenExpiry >= 1 && tokens.accessTokenExpiry <= 2147483647
    ? Math.floor(tokens.accessTokenExpiry) : 3600
  generation++
  writesInFlight++
  cached = undefined
  inFlight = undefined
  try {
    const result = await getRedisClient().eval(
      writeScript, 3, accessTokenKey(), refreshTokenKey(), refreshLockKey(),
      tokens.accessToken, tokens.refreshToken, expiry, lockOwner, expectedRefreshToken,
    )
    if (result !== 0 && result !== 1) throw new Error('Incomplete token write.')
    return result === 1
  } finally {
    // A timed-out Redis command may have committed despite the missing reply.
    clearCache()
    generation++
    writesInFlight--
    cached = undefined
    inFlight = undefined
  }
}

/** An explicit setup always replaces the pair and invalidates any old refresh lease. */
export async function storeOdAuthTokens(tokens: TokenWrite): Promise<void> {
  await writeTokens(tokens)
}

export async function acquireOdRefreshLock(refreshToken: string): Promise<{ owner: string; acquired: boolean; changed: boolean }> {
  const owner = randomUUID()
  const result = await getRedisClient().eval(acquireScript, 2, refreshLockKey(), refreshTokenKey(), refreshToken, owner, 60000)
  if (result !== -1 && result !== 0 && result !== 1) throw new Error('Invalid refresh lock result.')
  return { owner, acquired: result === 1, changed: result === -1 }
}

export async function commitOdRefresh(tokens: TokenWrite, owner: string, expectedRefreshToken: string): Promise<boolean> {
  if (!owner || !expectedRefreshToken) throw new Error('Invalid refresh lease.')
  return writeTokens(tokens, owner, expectedRefreshToken)
}

export async function releaseOdRefreshLock(owner: string): Promise<void> {
  await getRedisClient().eval(releaseScript, 1, refreshLockKey(), owner)
}
