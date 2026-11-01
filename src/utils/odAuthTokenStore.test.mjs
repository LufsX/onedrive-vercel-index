import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

// Transpiling dominates fixture setup, so compile each source once per test file.
const transpileCache = new Map()
function compileOnce(source, config) {
  const key = JSON.stringify(config ?? {}) + '\u0000' + source
  let output = transpileCache.get(key)
  if (output === undefined) {
    output = ts.transpileModule(source, config).outputText
    transpileCache.set(key, output)
  }
  return { outputText: output }
}

const require = createRequire(import.meta.url)

function load(path, modules, clock = Date, env = { ADMIN_PASSWORD_HASH: 'configured' }) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const code = compileOnce(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => name in modules ? modules[name] : name === './oauthScopes' ? require('../lib/oauthScopes.ts') : require(name), process: { env }, URLSearchParams, setTimeout, console, Date: clock })
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
        if (readHook) await readHook(result)
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

test('per-instance caches bound cross-instance staleness to 60 seconds and local writes invalidate immediately', async () => {
  const f = fixture(), a = f.store(), b = f.store()
  await a.storeOdAuthTokens(f.pair('old-access', 'old-refresh'))
  assert.equal((await a.getOdAuthTokens()).accessTokenTtl, 3600)
  assert.equal((await b.getOdAuthTokens()).refreshToken, 'old-refresh')
  f.advance(1000)
  await b.storeOdAuthTokens(f.pair('new-access', 'new-refresh'))
  assert.equal((await b.getOdAuthTokens()).accessToken, 'new-access')
  assert.equal(f.reads(), 3)

  f.advance(4000)
  assert.equal((await a.getOdAuthTokens()).accessTokenTtl, 3595)
  f.advance(54999)
  const stale = await a.getOdAuthTokens()
  assert.equal(stale.accessToken, 'old-access')
  assert.equal(stale.refreshToken, 'old-refresh')
  assert.equal(stale.accessTokenTtl, 3540)
  assert.equal(f.reads(), 3)
  f.advance(1)
  const fresh = await a.getOdAuthTokens()
  assert.equal(fresh.accessToken, 'new-access')
  assert.equal(fresh.refreshToken, 'new-refresh')
  assert.equal(f.reads(), 4)
})

test('cache stops at the token expiry minus 120 seconds even before the 60-second limit', async () => {
  const f = fixture(), store = f.store()
  await store.storeOdAuthTokens(f.pair('a', 'r'))
  f.setTtl(150)
  assert.equal((await store.getOdAuthTokens()).accessTokenTtl, 150)
  f.advance(29999)
  assert.equal((await store.getOdAuthTokens()).accessTokenTtl, 120)
  assert.equal(f.reads(), 1)
  f.advance(1)
  f.setTtl(120)
  assert.equal((await store.getOdAuthTokens()).accessTokenTtl, 120)
  await store.getOdAuthTokens()
  assert.equal(f.reads(), 3)
})

test('slow reads consume both the 60-second cache window and the token safety window', async () => {
  for (const [ttl, delay, remaining] of [[3600, 10000, 50000], [150, 10000, 20000], [150, 30000, 0], [3600, 60000, 0]]) {
    const f = fixture(), store = f.store()
    await store.storeOdAuthTokens(f.pair('a', 'r'))
    f.setTtl(ttl)
    f.onRead(() => { f.advance(delay) })
    assert.equal((await store.getOdAuthTokens()).accessTokenTtl, ttl - delay / 1000)
    f.onRead(undefined)
    if (remaining > 0) {
      f.advance(remaining - 1)
      await store.getOdAuthTokens()
      assert.equal(f.reads(), 1)
      f.advance(1)
    }
    await store.getOdAuthTokens()
    assert.equal(f.reads(), 2)
  }
})

test('only complete nonempty string pairs with a usable TTL are cached', async () => {
  for (const [access, refresh, ttl] of [
    [null, 'r', 3600], ['', 'r', 3600], [42, 'r', 3600],
    ['a', null, 3600], ['a', '', 3600], ['a', 42, 3600],
    ['a', 'r', -2], ['a', 'r', -1], ['a', 'r', 0], ['a', 'r', 120],
    ['a', 'r', NaN], ['a', 'r', Infinity], ['a', 'r', -Infinity],
  ]) {
    const f = fixture(), store = f.store()
    f.data.set('test:access_token', access)
    f.data.set('test:refresh_token', refresh)
    f.setTtl(ttl)
    await store.getOdAuthTokens()
    await store.getOdAuthTokens()
    assert.equal(f.reads(), 2, JSON.stringify([access, refresh, ttl]))
    f.data.set('test:access_token', 'recovered-access')
    f.data.set('test:refresh_token', 'recovered-refresh')
    f.setTtl(3600)
    assert.equal((await store.getOdAuthTokens()).accessToken, 'recovered-access')
    await store.getOdAuthTokens()
    assert.equal(f.reads(), 3)
  }
})

test('incomplete read replies reject and the next read recovers', async () => {
  const f = fixture(), store = f.store()
  await store.storeOdAuthTokens(f.pair('a', 'r'))
  f.onRead(result => { result.pop() })
  await assert.rejects(store.getOdAuthTokens(), /Incomplete token read/)
  await assert.rejects(store.getOdAuthTokens(), /Incomplete token read/)
  f.onRead(undefined)
  assert.equal((await store.getOdAuthTokens()).refreshToken, 'r')
  await store.getOdAuthTokens()
  assert.equal(f.reads(), 3)
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

test('a read that completes after a write cannot replace the new cached pair', async () => {
  const f = fixture(), store = f.store()
  await store.storeOdAuthTokens(f.pair('old', 'r'))
  let release
  const gate = new Promise(resolve => { release = resolve })
  f.onRead(() => gate)
  const oldRead = store.getOdAuthTokens()
  f.onRead(undefined)
  await store.storeOdAuthTokens(f.pair('new', 's'))
  assert.equal((await store.getOdAuthTokens()).accessToken, 'new')
  release()
  assert.equal((await oldRead).accessToken, 'old')
  assert.equal((await store.getOdAuthTokens()).refreshToken, 's')
  assert.equal(f.reads(), 2)
})

test('outages do not extend cached tokens beyond 60 seconds or cache failed reads', async () => {
  const f = fixture(), store = f.store()
  await store.storeOdAuthTokens(f.pair('a', 'r'))
  await store.getOdAuthTokens()
  f.onRead(() => { throw new Error('redis unavailable') })
  f.advance(5000)
  await assert.rejects(store.getOdAuthTokens(true), /redis unavailable/)
  f.advance(54999)
  assert.equal((await store.getOdAuthTokens()).accessTokenTtl, 3540)
  assert.equal(f.reads(), 2)
  f.advance(1)
  await assert.rejects(store.getOdAuthTokens(), /redis unavailable/)
  await assert.rejects(store.getOdAuthTokens(), /redis unavailable/)
  assert.equal(f.reads(), 4)
  f.onRead(undefined)
  assert.equal((await store.getOdAuthTokens()).accessToken, 'a')
  await store.getOdAuthTokens()
  assert.equal(f.reads(), 5)
})

test('live reads bypass cache and in-flight reads without replacing the cached pair', async () => {
  const f = fixture(), store = f.store()
  await store.storeOdAuthTokens(f.pair('a', 'r'))
  await store.getOdAuthTokens()
  f.data.set('test:access_token', 'b')
  assert.equal((await store.getOdAuthTokens()).accessToken, 'a')
  assert.equal((await store.getOdAuthTokens(true)).accessToken, 'b')
  assert.equal((await store.getOdAuthTokens()).accessToken, 'a')
  f.advance(60000)
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
  await store.getOdAuthTokens()
  const generation = store.tokenStoreGeneration()
  f.setFailure(true)
  await assert.rejects(store.storeOdAuthTokens(f.pair('b', 's')), /redis unavailable/)
  assert.equal(store.tokenStoreGeneration(), generation + 2)
  assert.equal((await store.getOdAuthTokens()).refreshToken, 'r')
  assert.equal(f.reads(), 2)
  assert.equal(f.clears(), 2)
  f.setFailure(false)
  await store.storeOdAuthTokens(f.pair('b', 's'))
  assert.equal((await store.getOdAuthTokens()).accessToken, 'b')
  assert.equal(f.clears(), 3)
})

test('a write with a lost acknowledgement invalidates the cache and reveals the committed pair', async () => {
  const f = fixture(), store = f.store()
  await store.storeOdAuthTokens(f.pair('old', 'r'))
  await store.getOdAuthTokens()
  f.onWrite(() => {
    f.data.set('test:access_token', 'committed')
    f.data.set('test:refresh_token', 'committed-refresh')
    throw new Error('write timed out')
  })
  await assert.rejects(store.storeOdAuthTokens(f.pair('committed', 'committed-refresh')), /write timed out/)
  f.onWrite(undefined)
  assert.equal((await store.getOdAuthTokens()).accessToken, 'committed')
  assert.equal((await store.getOdAuthTokens()).refreshToken, 'committed-refresh')
  assert.equal(f.reads(), 2)
  assert.equal(f.clears(), 2)
})

test('a rejected refresh commit also invalidates the cached pair', async () => {
  const f = fixture(), a = f.store(), b = f.store()
  await a.storeOdAuthTokens(f.pair('old', 'r'))
  const lease = await a.acquireOdRefreshLock('r')
  await a.getOdAuthTokens()
  await b.storeOdAuthTokens(f.pair('authorized', 'authorized-refresh'))
  assert.equal(await a.commitOdRefresh(f.pair('stale', 's'), lease.owner, 'r'), false)
  assert.equal((await a.getOdAuthTokens()).accessToken, 'authorized')
  assert.equal(f.reads(), 2)
})

test('two API processes share one refresh and observe the committed pair', async () => {
  const f = fixture(), a = f.store(), b = f.store()
  await a.storeOdAuthTokens(f.pair('old', 'refresh'))
  f.data.delete('test:access_token')
  let calls = 0, release
  const gate = new Promise(resolve => { release = resolve })
  const post = async () => {
    calls++
    await gate
    return { data: { access_token: 'new', refresh_token: 'next', expires_in: '3600' } }
  }
  // The HTTP client dispatches on options.method, so tests stub the per-verb helpers.
  const upstream = Object.assign(async (_url, options = {}) => post(_url, options.body, options), { post })
  const api = store => load('../lib/odApi.ts', {
    '../utils/upstreamRequest': { default: upstream, __esModule: true },
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

test('without a hash refresh requests and accepts only read-only scopes', async () => {
  for (const scope of ['User.Read Files.Read', 'user.read files.readwrite', undefined, 'user.read']) {
    const f = fixture(), store = f.store()
    await store.storeOdAuthTokens(f.pair('old', 'refresh'))
    f.data.delete('test:access_token')
    let requested
    const api = load('../lib/odApi.ts', {
      '../utils/upstreamRequest': {
        __esModule: true,
        default: async (_url, options = {}) => {
          requested = options.body.get('scope')
          return { data: { access_token: 'new', refresh_token: 'next', expires_in: '3600', scope } }
        },
      },
      '../../config/api.config': { default: { clientId: 'id', redirectUri: 'uri', authApi: 'auth' }, __esModule: true },
      '../../config/site.config': { default: { baseDirectory: '/', protectedRoutes: [] }, __esModule: true },
      '../utils/protectedPath': {}, '../utils/oAuthHandler': { revealObfuscatedToken: () => '' },
      '../utils/protectedRouteHandler': {}, '../utils/odAuthTokenStore': store, './itemPath': {}, './oauthServerConfig': { getOAuthClientSecret: () => '' },
    }, Date, {})
    const valid = scope === 'User.Read Files.Read'
    assert.equal(await api.getAccessToken(), valid ? 'new' : '')
    assert.equal(requested, 'user.read files.read offline_access')
    assert.equal((await store.getOdAuthTokens(true)).refreshToken, valid ? 'next' : 'refresh')
    assert.equal(f.data.has('test:refresh_token_lock'), false)
  }
})

test('reauthorization during an OAuth request wins over its stale response', async () => {
  const f = fixture(), a = f.store(), b = f.store()
  await a.storeOdAuthTokens(f.pair('old', 'refresh'))
  f.data.delete('test:access_token')
  let started, release
  const entered = new Promise(resolve => { started = resolve })
  const gate = new Promise(resolve => { release = resolve })
  const api = load('../lib/odApi.ts', {
    '../utils/upstreamRequest': {
      __esModule: true,
      default: async () => {
        started()
        await gate
        return { data: { access_token: 'stale', refresh_token: 'stale-refresh', expires_in: '3600' } }
      },
    },
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
