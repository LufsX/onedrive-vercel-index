import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const readOnlyScope = 'user.read files.read offline_access'
function fixture(options = {}) {
  const { adminHash = 'configured-hash', owner = 'owner@example.com' } = options
  const scope = Object.hasOwn(options, 'scope') ? options.scope : readOnlyScope
  let rejectWrite = false, rejectAuth = false, identity = 'owner@example.com', calls = [], stored = null
  let rateAllowed = true, rateError = false
  const checks = []
  const code = ts.transpileModule(readFileSync(new URL('./route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const oauth = require('../../../../lib/oauthSetup.ts')
  const modules = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    // Deliberately unsafe config: the anonymous exchange must force its own scope.
    '../../../../../config/api.config': { __esModule: true, default: { clientId: 'client', redirectUri: 'http://localhost/', authApi: 'https://login.example/token', driveApi: 'https://graph.example/me/drive', scope: 'files.readwrite.all' } },
    '../../../../../config/site.config': { __esModule: true, default: { userPrincipalName: owner } },
    '../../../../lib/oauthServerConfig': { getOAuthClientSecret: () => 'client-secret' },
    '../../../../lib/oauthSetup': oauth,
    '../../../../lib/oauthScopes': require('../../../../lib/oauthScopes.ts'),
    '../../../../lib/adminAuth': {
      adminError: (error, status) => ({ body: { error }, status }),
      validateWriteRequest: () => { checks.push('write'); return rejectWrite ? { status: 403 } : null },
      requireAdmin: async () => { checks.push('session'); return rejectAuth ? { status: 401 } : null },
      readAdminBody: request => request.json(),
      checkAdminRateLimit: async action => {
        checks.push('rate:' + action)
        if (rateError) throw new Error('Store unavailable')
        return rateAllowed
      },
    },
    '../../../../lib/odApi': { storeTokensFromRequestBody: async body => { stored = body; return true } },
    '../../../../utils/oAuthHandler': { obfuscateToken: token => 'encoded:' + token },
  }
  const exports = {}
  const fetch = async (url, options) => {
    calls.push({ url, options })
    if (url.includes('token')) return { ok: true, json: async () => ({ access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 3600, scope }) }
    return { ok: true, json: async () => ({ userPrincipalName: identity }) }
  }
  vm.runInNewContext(code, { exports, require: name => modules[name] || require(name), process: { env: adminHash === null ? {} : { ADMIN_PASSWORD_HASH: adminHash } }, URLSearchParams, AbortSignal, fetch })
  return {
    post: (body = { code: 'authorization-code' }) => exports.POST({ json: async () => body }),
    setWrite: value => { rejectWrite = value }, setAuth: value => { rejectAuth = value },
    setIdentity: value => { identity = value }, calls: () => calls, stored: () => stored, checks: () => checks,
    setRate: value => { rateAllowed = value }, setRateError: value => { rateError = value },
  }
}

test('token exchange checks CSRF before session or rate limit in both modes', async () => {
  for (const adminHash of ['', 'configured-hash']) {
    const f = fixture({ adminHash })
    f.setWrite(true)
    assert.equal((await f.post()).status, 403)
    assert.deepEqual(f.checks(), ['write'])
    assert.equal(f.calls().length, 0)
  }
})

test('configured password hash still requires a session before contacting Microsoft', async () => {
  for (const adminHash of ['configured-hash', 'invalid-but-nonempty-hash']) {
    const f = fixture({ adminHash })
    f.setAuth(true)
    assert.equal((await f.post()).status, 401)
    assert.deepEqual(f.checks(), ['write', 'session'])
    assert.equal(f.calls().length, 0)
    assert.equal(f.stored(), null)
  }
})

test('authenticated token exchange preserves write scopes and stores tokens without returning them', async () => {
  const f = fixture({ scope: 'user.read files.readwrite offline_access' })
  const response = await f.post()
  assert.equal(response.body.stored, true)
  assert.equal(JSON.stringify(response).includes('secret'), false)
  assert.deepEqual(f.checks(), ['write', 'session', 'rate:oauth'])
  assert.equal(f.calls().length, 2)
  assert.equal(f.calls()[0].options.body.has('scope'), false)
  assert.equal(f.stored().obfuscatedAccessToken, 'encoded:access-secret')
  assert.equal(f.stored().obfuscatedRefreshToken, 'encoded:refresh-secret')
})

test('no hash allows anonymous read-only exchange and overrides client/config scope', async () => {
  for (const adminHash of [null, '']) {
    const f = fixture({ adminHash })
    f.setAuth(true)
    const response = await f.post({ code: 'authorization-code', scope: 'files.readwrite.all', owner: 'attacker@example.com' })
    assert.equal(response.body.stored, true)
    assert.equal(response.headers['Cache-Control'], 'no-store')
    assert.equal(JSON.stringify(response).includes('secret'), false)
    assert.deepEqual(f.checks(), ['write', 'rate:oauth'])
    assert.equal(f.calls().length, 2)
    const params = f.calls()[0].options.body
    assert.equal(params.get('scope'), readOnlyScope)
    assert.equal(params.get('client_id'), 'client')
    assert.equal(params.get('client_secret'), 'client-secret')
    assert.equal(f.stored().obfuscatedAccessToken, 'encoded:access-secret')
    assert.equal(f.stored().obfuscatedRefreshToken, 'encoded:refresh-secret')
  }
})

test('read-only response allowlist accepts case-insensitive scopes and Graph URL prefixes', async () => {
  for (const scope of [
    'User.Read Files.Read OFFLINE_ACCESS OPENID PROFILE EMAIL',
    'https://graph.microsoft.com/User.Read HTTPS://GRAPH.MICROSOFT.COM/Files.Read offline_access openid profile email',
  ]) {
    const f = fixture({ adminHash: '', scope })
    assert.equal((await f.post()).body.stored, true)
  }
})

test('anonymous exchange rejects missing, malformed, write, or other response scopes', async t => {
  for (const scope of [
    undefined, null, '', '   ', 123, ['files.read'], {}, 'user.read', 'files.read', 'openid profile offline_access',
    'user.read files.readwrite offline_access',
    'user.read Files.ReadWrite.All', 'files.read.all', 'mail.read', '.default',
    'https://graph.microsoft.com/Files.ReadWrite',
    'user.read https://graph.microsoft.com/.default',
    'https://graph.microsoft.com.evil/files.read',
    'http://graph.microsoft.com/files.read',
    'https://other.example/files.read',
    'user.read files.read,offline_access',
    'user.read files.read/extra',
  ]) {
    await t.test(JSON.stringify(scope) ?? 'missing', async () => {
      const f = fixture({ adminHash: '', scope })
      const response = await f.post()
      assert.equal(response.status, 502)
      assert.equal(response.body.error, 'invalid_token_response')
      assert.equal(f.calls().length, 1)
      assert.equal(f.stored(), null)
    })
  }
})

test('anonymous exchange retains rate limiting and fails closed if the limiter is unavailable', async () => {
  for (const unavailable of [false, true]) {
    const f = fixture({ adminHash: '' })
    f.setRate(false)
    f.setRateError(unavailable)
    assert.equal((await f.post()).status, unavailable ? 503 : 429)
    assert.deepEqual(f.checks(), ['write', 'rate:oauth'])
    assert.equal(f.calls().length, 0)
    assert.equal(f.stored(), null)
  }
})

test('token exchange refuses a different Microsoft identity in both modes', async () => {
  for (const adminHash of ['', 'configured-hash']) {
    const f = fixture({ adminHash })
    f.setIdentity('other@example.com')
    const response = await f.post({ code: 'authorization-code', owner: 'other@example.com' })
    assert.equal(response.status, 403)
    assert.equal(response.body.error, 'identity_mismatch')
    assert.equal(f.stored(), null)
  }
})

test('anonymous exchange cannot store tokens without a configured owner', async () => {
  const f = fixture({ adminHash: '', owner: '' })
  assert.equal((await f.post()).status, 403)
  assert.equal(f.stored(), null)
})
