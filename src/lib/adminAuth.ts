import { createHash, createHmac, hkdfSync, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import siteConfig from '../../config/site.config'
import { getRedisClient } from '../utils/redisClient'

const cookieName = 'admin_session'
const sessionSeconds = 8 * 60 * 60
const key = (suffix: string) => `${siteConfig.kvPrefix}admin:${suffix}`
const headers = { 'Cache-Control': 'no-store' }
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
type PasswordParameters = { salt: string; hash: string; N: number; r: number; p: number }
const defaultScrypt = { N: 16384, r: 8, p: 1 }

function parsePasswordHash(value: string): PasswordParameters | null {
  const fields = value.split('$')
  if (fields[0] !== 'scrypt') return null
  let salt: string, hash: string, N: number, r: number, p: number
  if (fields.length === 3) {
    ;[, salt, hash] = fields
    ;({ N, r, p } = defaultScrypt)
  } else if (fields.length === 6 && fields.slice(1, 4).every(field => /^[1-9]\d*$/.test(field))) {
    ;[, , , , salt, hash] = fields
    ;[N, r, p] = fields.slice(1, 4).map(Number)
  } else return null
  if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash) ||
      !Number.isSafeInteger(N) || N < 16384 || N > 65536 || (N & (N - 1)) !== 0 ||
      !Number.isSafeInteger(r) || r < 8 || r > 16 || !Number.isSafeInteger(p) || p < 1 || p > 4 ||
      N * r * p > 2097152) return null
  return { salt, hash, N, r, p }
}

export function adminError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status, headers })
}

// The deployment proxy must validate Host and preserve the external scheme and host.
export function validateWriteRequest(request: NextRequest): NextResponse | null {
  if (request.headers.get('x-requested-with') !== 'XMLHttpRequest') return adminError('invalid_request', 403)
  try {
    const expected = new URL(request.url)
    const origin = request.headers.get('origin')
    const host = request.headers.get('host')
    if (expected.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && expected.protocol === 'http:')) {
      return adminError('https_required', 403)
    }
    if (!host || origin !== `${expected.protocol}//${host}`) return adminError('invalid_origin', 403)
  } catch {
    return adminError('invalid_origin', 403)
  }
  return null
}

export async function readAdminBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  const length = request.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > 32768)) return null
  if (!request.body) return null
  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let body = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 32768) return null
      body += decoder.decode(value, { stream: true })
    }
    const parsed: unknown = JSON.parse(body + decoder.decode())
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function checkAdminStore(): Promise<void> {
  await getRedisClient().ping()
}

export async function isAdminInitialized(): Promise<boolean> {
  return !!process.env.ADMIN_PASSWORD_HASH
}

function sessionKey(): Buffer | null {
  const hash = process.env.ADMIN_PASSWORD_HASH
  if (!hash || !parsePasswordHash(hash)) return null
  const secret = process.env.ADMIN_SESSION_SECRET || hash
  return Buffer.from(hkdfSync('sha256', secret, hash, 'onedrive-vercel-index-admin-session-v1', 32))
}

function signature(id: string, secret: Buffer): string {
  return createHmac('sha256', secret).update(id).digest('hex')
}

function equal(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(digest(a), 'hex'), Buffer.from(digest(b), 'hex'))
}

function sessionId(request: NextRequest): string | null {
  const token = request.cookies.get(cookieName)?.value
  const secret = sessionKey()
  if (!secret || !token || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(token)) return null
  const [id, mac] = token.split('.')
  return equal(signature(id, secret), mac) ? id : null
}

export async function isAdmin(request: NextRequest): Promise<boolean> {
  const id = sessionId(request)
  if (!id) return false
  return (await getRedisClient().exists(key(`session:${digest(id)}`))) === 1
}

export async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  try {
    return (await isAdmin(request)) ? null : adminError('unauthorized', 401)
  } catch {
    return adminError('auth_unavailable', 503)
  }
}

// A shared limit avoids trusting spoofable client IP headers and works across instances.
export async function checkAdminRateLimit(action: string, limit = 20): Promise<boolean> {
  const result = await getRedisClient().eval(
    "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 600) end; return n",
    1, key(`rate:${action}`),
  )
  return typeof result === 'number' && result <= limit
}

async function passwordHash(password: string, salt: string, params: { N: number; r: number; p: number }): Promise<string> {
  const hash = await new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 64, { ...params, maxmem: 256 * 1024 * 1024 }, (error, result) => {
      if (error) reject(error)
      else resolve(result)
    })
  })
  return hash.toString('hex')
}

export async function generateAdminSetup(password: unknown): Promise<{ passwordHash: string; sessionSecret: string } | null> {
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 1024) return null
  const salt = randomBytes(16).toString('hex')
  const { N, r, p } = defaultScrypt
  return { passwordHash: `scrypt$${N}$${r}$${p}$${salt}$${await passwordHash(password, salt, defaultScrypt)}`, sessionSecret: randomBytes(32).toString('hex') }
}

export async function loginAdmin(password: unknown): Promise<string | null> {
  if (typeof password !== 'string' || Buffer.byteLength(password) > 1024) return null
  const stored = process.env.ADMIN_PASSWORD_HASH
  const parsed = stored ? parsePasswordHash(stored) : null
  const secret = sessionKey()
  if (!parsed || !secret) return null
  const { salt, hash, N, r, p } = parsed
  if (!equal(await passwordHash(password, salt, { N, r, p }), hash)) return null
  const id = randomBytes(32).toString('hex')
  await getRedisClient().set(key(`session:${digest(id)}`), '1', 'EX', sessionSeconds)
  return `${id}.${signature(id, secret)}`
}

export function setAdminCookie(response: NextResponse, token: string): void {
  response.cookies.set(cookieName, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', path: '/', maxAge: sessionSeconds,
  })
}

export async function logoutAdmin(request: NextRequest): Promise<void> {
  const id = sessionId(request)
  if (id) await getRedisClient().del(key(`session:${digest(id)}`))
}

export function clearAdminCookie(response: NextResponse): void {
  response.cookies.set(cookieName, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 })
}
