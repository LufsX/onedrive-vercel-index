import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function fixture() {
  const data = new Map()
  let down = false, now = 0, lastSet
  const expiry = new Map()
  const redis = {
    async exists(key) {
      if (down) throw Error('offline')
      if (expiry.has(key) && expiry.get(key) <= now) { data.delete(key); expiry.delete(key) }
      return Number(data.has(key))
    },
    async get(key) { if (down) throw Error('offline'); return data.get(key) ?? null },
    async set(key, value, ...options) {
      if (down) throw Error('offline')
      if (options.includes('NX') && data.has(key)) return null
      data.set(key, value)
      lastSet = { key, options }
      const ex = options.indexOf('EX')
      if (ex !== -1) expiry.set(key, now + options[ex + 1])
      return 'OK'
    },
    async del(key) { if (down) throw Error('offline'); data.delete(key) },
    async eval(script, count, key) {
      if (down) throw Error('offline')
      assert.match(script, /INCR/)
      assert.match(script, /EXPIRE/)
      const value = (data.get(key) || 0) + 1
      data.set(key, value)
      return value
    },
  }
  class Response {
    static json(body, options) { return { body, ...options } }
  }
  const modules = {
    'next/server': { NextResponse: Response },
    '../../config/site.config': { __esModule: true, default: { kvPrefix: 'test:' } },
    '../utils/redisClient': { getRedisClient: () => redis },
  }
  const code = ts.transpileModule(readFileSync(new URL('./adminAuth.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const exports = {}
  const env = { NODE_ENV: 'production' }
  vm.runInNewContext(code, { exports, require: name => modules[name] || require(name), process: { env }, Buffer, URL, TextDecoder })
  const request = (origin = 'https://example.com', token = '') => ({
    url: 'https://example.com/path',
    headers: new Headers({ origin, host: 'example.com', 'x-requested-with': 'XMLHttpRequest', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'http' }),
    cookies: { get: () => token ? { value: token } : undefined },
  })
  return { auth: exports, data, env, request, setDown: value => { down = value }, advance: seconds => { now += seconds }, lastSet: () => lastSet }
}

test('origin and header checks ignore forwarded headers and require HTTPS', () => {
  const f = fixture()
  assert.equal(f.auth.validateWriteRequest(f.request()), null)
  assert.equal(f.auth.validateWriteRequest(f.request('https://evil.example')).status, 403)
  const request = f.request()
  request.headers.delete('x-requested-with')
  assert.equal(f.auth.validateWriteRequest(request).status, 403)
  const insecure = f.request('http://example.com')
  insecure.url = 'http://example.com/path'
  assert.equal(f.auth.validateWriteRequest(insecure).status, 403)
  const spoofed = f.request()
  spoofed.headers.set('host', 'evil.example')
  assert.equal(f.auth.validateWriteRequest(spoofed).status, 403)

  f.env.NODE_ENV = 'development'
  const bound = f.request('http://10.2.1.62:3000')
  bound.url = 'http://10.2.1.62:3000/path'
  bound.headers.set('host', '10.2.1.62:3000')
  assert.equal(f.auth.validateWriteRequest(bound), null)
  bound.headers.set('host', 'localhost:3000')
  bound.headers.set('origin', 'http://localhost:3000')
  assert.equal(f.auth.validateWriteRequest(bound), null)
  bound.headers.set('origin', 'http://evil.example')
  assert.equal(f.auth.validateWriteRequest(bound).status, 403)
  f.env.NODE_ENV = 'production'
  bound.headers.set('origin', 'http://localhost:3000')
  assert.equal(f.auth.validateWriteRequest(bound).status, 403)
})

test('generated configuration stays inactive until deployed; login, logout, and outage fail closed', async () => {
  const f = fixture(), { auth } = f
  assert.equal(await auth.generateAdminSetup('1234567'), null)
  const config = await auth.generateAdminSetup('12345678')
  assert.match(config.passwordHash, /^scrypt\$16384\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/)
  assert.equal(await auth.isAdminInitialized(), false)
  assert.equal(await auth.loginAdmin('12345678'), null)
  f.env.ADMIN_PASSWORD_HASH = config.passwordHash
  assert.equal(await auth.isAdminInitialized(), true)
  assert.equal(await auth.loginAdmin('incorrect'), null)
  const token = await auth.loginAdmin('12345678')
  assert.match(token, /^[a-f0-9]{64}\.[a-f0-9]{64}$/)
  assert.equal([...f.data.values()].includes(token), false)
  assert.equal(await auth.requireAdmin(f.request(undefined, token)), null)
  assert.equal((await auth.requireAdmin(f.request(undefined, token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')))).status, 401)
  f.env.ADMIN_SESSION_SECRET = config.sessionSecret
  assert.equal((await auth.requireAdmin(f.request(undefined, token))).status, 401)
  delete f.env.ADMIN_SESSION_SECRET
  await auth.logoutAdmin(f.request(undefined, token))
  assert.equal((await auth.requireAdmin(f.request(undefined, token))).status, 401)
  f.setDown(true)
  assert.equal((await auth.requireAdmin(f.request(undefined, token))).status, 503)
})

test('legacy scrypt hashes remain valid and invalid parameters are rejected', async () => {
  const f = fixture()
  const config = await f.auth.generateAdminSetup('a secure password')
  f.env.ADMIN_PASSWORD_HASH = config.passwordHash.replace('scrypt$16384$8$1$', 'scrypt$')
  assert.ok(await f.auth.loginAdmin('a secure password'))
  const { scryptSync } = require('node:crypto')
  const salt = 'a'.repeat(32)
  const hash = scryptSync('a secure password', salt, 64, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }).toString('hex')
  f.env.ADMIN_PASSWORD_HASH = `scrypt$32768$8$1$${salt}$${hash}`
  assert.ok(await f.auth.loginAdmin('a secure password'))
  for (const prefix of ['scrypt$999999999$8$1$', 'scrypt$16384$1$1$', 'scrypt$16384$8$99$', 'scrypt$16385$8$1$']) {
    f.env.ADMIN_PASSWORD_HASH = config.passwordHash.replace('scrypt$16384$8$1$', prefix)
    assert.equal(await f.auth.loginAdmin('a secure password'), null)
  }
})

test('session TTL expires after 28800 seconds', async () => {
  const f = fixture()
  const config = await f.auth.generateAdminSetup('a secure password')
  f.env.ADMIN_PASSWORD_HASH = config.passwordHash
  const token = await f.auth.loginAdmin('a secure password')
  assert.deepEqual(f.lastSet().options, ['EX', 28800])
  f.advance(28799)
  assert.equal(await f.auth.requireAdmin(f.request(undefined, token)), null)
  f.advance(1)
  assert.equal((await f.auth.requireAdmin(f.request(undefined, token))).status, 401)
})

test('request body parsing rejects oversized and malformed JSON', async () => {
  const f = fixture()
  const request = body => new Request('https://example.com/', { method: 'POST', body })
  assert.equal((await f.auth.readAdminBody(request('{"password":"ok"}'))).password, 'ok')
  assert.equal(await f.auth.readAdminBody(request('{')), null)
  assert.equal(await f.auth.readAdminBody(request('x'.repeat(32769))), null)
})

test('rate limit uses shared redis counter and propagates failures', async () => {
  const f = fixture()
  for (let i = 0; i < 20; i++) assert.equal(await f.auth.checkAdminRateLimit('login'), true)
  assert.equal(await f.auth.checkAdminRateLimit('login'), false)
  assert.equal(await f.auth.checkAdminRateLimit('init'), true)
  f.setDown(true)
  await assert.rejects(f.auth.checkAdminRateLimit('login'))
})
