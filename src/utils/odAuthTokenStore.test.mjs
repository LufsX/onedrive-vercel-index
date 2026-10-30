import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function load(path, modules, clock = Date) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => name in modules ? modules[name] : require(name), URLSearchParams, setTimeout, console, Date: clock })
  return exports
}

function fixture() {
  const data = new Map()
  let failWrite = false
  let clears = 0, reads = 0, ttl = 3600, now = 100000, readHook, writeHook
  const clock = class extends Date { static now() { return now } }
  const redis = {
    async exists(key) { return Number(data.has(key)) },
    async eval(script, count, ...args) {
      const keys = args.slice(0, count)
      const values = args.slice(count)
      if (script.includes("'TTL'")) {
        reads++
        const result = [data.get(keys[0]) ?? null, data.get(keys[1]) ?? null, data.has(keys[0]) ? ttl : -2]
        if (readHook) await readHook()
        return result
      }
      if (script.includes("'MSET'")) {
        if (writeHook) await writeHook()
        if (failWrite) throw new Error('redis unavailable')
        if (values[3] && (data.get(keys[2]) !== values[3] || data.get(keys[1]) !== values[4])) return 0
        data.set(keys[0], values[0]); data.set(keys[1], values[1]); data.delete(keys[2])
        return 1
      }
      if (script.includes("'NX'")) {
        if (data.get(keys[1]) !== values[0]) return -1
        if (data.has(keys[0])) return 0
        data.set(keys[0], values[1]); return 1
      }
      if (data.get(keys[0]) === values[0]) { data.delete(keys[0]); return 1 }
      return 0
    },
  }
  const modules = {
    '../../config/site.config': { default: { kvPrefix: 'test:', baseDirectory: '/', protectedRoutes: [] }, __esModule: true },
    '../lib/cache': { clearCache() { clears++ } },
    './redisClient': { getRedisClient: () => redis },
  }
  const store = () => load('./odAuthTokenStore.ts', modules, clock)
  const pair = (accessToken, refreshToken) => ({ accessToken, refreshToken, accessTokenExpiry: 3600 })
  return { store, pair, data, setFailure: value => { failWrite = value }, clears: () => clears,
    reads: () => reads, advance: ms => { now += ms }, setTtl: value => { ttl = value },
    onRead: hook => { readHook = hook }, onWrite: hook => { writeHook = hook } }
}

test('cache hits, expires after five seconds, and respects the safety margin', async () => {
  const f = fixture(), store = f.store()
  await store.storeOdAuthTokens(f.pair('a', 'r'))
  assert.equal((await store.getOdAuthTokens()).accessTokenTtl, 3600)
  f.advance(4000)
  assert.equal((await store.getOdAuthTokens()).accessTokenTtl, 3596)
  assert.equal(f.reads(), 1)
  f.advance(1000)
  await store.getOdAuthTokens()
  assert.equal(f.reads(), 2)
  await store.storeOdAuthTokens(f.pair('b', 's'))
  f.setTtl(122)
  await store.getOdAuthTokens()
  f.advance(2000)
  await store.getOdAuthTokens()
  assert.equal(f.reads(), 4)
  f.setTtl(120)
  await store.storeOdAuthTokens(f.pair('c', 't'))
  await store.getOdAuthTokens()
  await store.getOdAuthTokens()
  assert.equal(f.reads(), 6)
})

test('concurrent reads merge; empty results and errors are not cached', async () => {
  const f = fixture(), store = f.store()
  let release
  const gate = new Promise(resolve => { release = resolve })
  f.onRead(() => gate)
  const a = store.getOdAuthTokens(), b = store.getOdAuthTokens()
  assert.equal(f.reads(), 1)
  release()
  await Promise.all([a, b])
  f.onRead(undefined)
  await store.getOdAuthTokens()
  assert.equal(f.reads(), 2)
  f.onRead(() => { throw new Error('read failed') })
  await assert.rejects(store.getOdAuthTokens(), /read failed/)
  f.onRead(undefined)
  await store.getOdAuthTokens()
  assert.equal(f.reads(), 4)
})

test('writes fence delayed reads and reads during a write', async () => {
  const f = fixture(), store = f.store()
  await store.storeOdAuthTokens(f.pair('old', 'r'))
  let releaseRead
  const readGate = new Promise(resolve => { releaseRead = resolve })
  f.onRead(() => readGate)
  const oldRead = store.getOdAuthTokens()
  f.onRead(undefined)
  let releaseWrite
  const writeGate = new Promise(resolve => { releaseWrite = resolve })
  f.onWrite(() => writeGate)
  const write = store.storeOdAuthTokens(f.pair('new', 's'))
  assert.equal((await store.getOdAuthTokens()).accessToken, 'old')
  releaseRead()
  assert.equal((await oldRead).accessToken, 'old')
  releaseWrite()
  await write
  f.onWrite(undefined)
  assert.equal((await store.getOdAuthTokens()).accessToken, 'new')
  assert.equal(f.reads(), 3)
  await store.getOdAuthTokens()
  assert.equal(f.reads(), 3)
})

test('live reads bypass cache and in-flight reads', async () => {
  const f = fixture(), store = f.store()
  await store.storeOdAuthTokens(f.pair('a', 'r'))
  await store.getOdAuthTokens()
  f.data.set('test:access_token', 'b')
  assert.equal((await store.getOdAuthTokens()).accessToken, 'a')
  assert.equal((await store.getOdAuthTokens(true)).accessToken, 'b')
  f.advance(5000)
  let release
  const gate = new Promise(resolve => { release = resolve })
  f.onRead(() => gate)
  const pending = store.getOdAuthTokens()
  f.onRead(undefined)
  f.data.set('test:access_token', 'c')
  assert.equal((await store.getOdAuthTokens(true)).accessToken, 'c')
  release()
  await pending
  assert.equal(f.reads(), 4)
})

test('reauthorization fences a refresh in another process and stale releases', async () => {
  const f = fixture(), a = f.store(), b = f.store()
  await a.storeOdAuthTokens(f.pair('old-access', 'old-refresh'))
  const old = await a.acquireOdRefreshLock('old-refresh')
  assert.equal(old.acquired, true)
  assert.equal((await b.acquireOdRefreshLock('old-refresh')).acquired, false)
  await b.storeOdAuthTokens(f.pair('new-access', 'new-refresh'))
  const newer = await b.acquireOdRefreshLock('new-refresh')
  assert.equal(newer.acquired, true)
  assert.equal(await a.commitOdRefresh(f.pair('stale-access', 'stale-refresh'), old.owner, 'old-refresh'), false)
  await a.releaseOdRefreshLock(old.owner)
  assert.equal((await a.acquireOdRefreshLock('new-refresh')).acquired, false)
  assert.equal((await a.getOdAuthTokens()).accessToken, 'new-access')
  assert.equal(await b.commitOdRefresh(f.pair('fresh-access', 'fresh-refresh'), newer.owner, 'new-refresh'), true)
  assert.equal((await a.getOdAuthTokens(true)).refreshToken, 'fresh-refresh')
})

test('failed writes preserve tokens and future writes and reads recover', async () => {
  const f = fixture(), store = f.store()
  await store.storeOdAuthTokens(f.pair('a', 'r'))
  f.setFailure(true)
  await assert.rejects(store.storeOdAuthTokens(f.pair('b', 's')), /redis unavailable/)
  assert.equal((await store.getOdAuthTokens()).refreshToken, 'r')
  assert.equal(f.clears(), 2)
  f.setFailure(false)
  await store.storeOdAuthTokens(f.pair('b', 's'))
  assert.equal((await store.getOdAuthTokens()).accessToken, 'b')
  assert.equal(f.clears(), 3)
})

test('two API processes share one refresh and observe the committed pair', async () => {
  const f = fixture(), a = f.store(), b = f.store()
  await a.storeOdAuthTokens(f.pair('old', 'refresh'))
  f.data.delete('test:access_token')
  let calls = 0, release
  const gate = new Promise(resolve => { release = resolve })
  const axios = { post: async () => { calls++; await gate; return { data: { access_token: 'new', refresh_token: 'next', expires_in: '3600' } } } }
  const api = store => load('../lib/odApi.ts', {
    '../utils/axiosInstance': { default: axios, __esModule: true },
    '../../config/api.config': { default: { obfuscatedClientSecret: '', clientId: 'id', redirectUri: 'uri', authApi: 'auth' }, __esModule: true },
    '../../config/site.config': { default: { baseDirectory: '/', protectedRoutes: [] }, __esModule: true },
    '../utils/protectedPath': {}, '../utils/oAuthHandler': { revealObfuscatedToken: () => '' },
    '../utils/protectedRouteHandler': {}, '../utils/odAuthTokenStore': store, './itemPath': {}, './oauthServerConfig': { getOAuthClientSecret: () => '' },
  })
  const first = api(a).getAccessToken(), second = api(b).getAccessToken()
  while (!calls) await new Promise(resolve => setTimeout(resolve, 1))
  release()
  assert.equal(await first, 'new')
  assert.equal(await second, 'new')
  assert.equal(calls, 1)
})

test('reauthorization during an OAuth request wins over its stale response', async () => {
  const f = fixture(), a = f.store(), b = f.store()
  await a.storeOdAuthTokens(f.pair('old', 'refresh'))
  f.data.delete('test:access_token')
  let started, release
  const entered = new Promise(resolve => { started = resolve })
  const gate = new Promise(resolve => { release = resolve })
  const api = load('../lib/odApi.ts', {
    '../utils/axiosInstance': { default: { post: async () => { started(); await gate; return { data: { access_token: 'stale', refresh_token: 'stale-refresh', expires_in: '3600' } } } }, __esModule: true },
    '../../config/api.config': { default: { obfuscatedClientSecret: '', clientId: 'id', redirectUri: 'uri', authApi: 'auth' }, __esModule: true },
    '../../config/site.config': { default: { baseDirectory: '/', protectedRoutes: [] }, __esModule: true },
    '../utils/protectedPath': {}, '../utils/oAuthHandler': { revealObfuscatedToken: () => '' },
    '../utils/protectedRouteHandler': {}, '../utils/odAuthTokenStore': a, './itemPath': {}, './oauthServerConfig': { getOAuthClientSecret: () => '' },
  })
  const pending = api.getAccessToken()
  await entered
  await b.storeOdAuthTokens(f.pair('authorized', 'authorized-refresh'))
  release()
  assert.equal(await pending, 'authorized')
  assert.equal((await a.getOdAuthTokens()).refreshToken, 'authorized-refresh')
})
