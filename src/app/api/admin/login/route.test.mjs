import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
function fixture() {
  const state = { initialized: true, valid: true, limited: false, outage: false, rejected: false, token: 'session-token', calls: 0, cookie: null }
  const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const modules = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    '../../../../lib/adminAuth': {
      adminError: (error, status) => ({ body: { error }, status }),
      adminUnavailable: () => ({ body: { error: 'auth_unavailable' }, status: 503 }),
      validateWriteRequest: () => state.rejected ? { status: 403 } : null,
      isAdminInitialized: async () => state.initialized,
      isAdminConfigurationValid: () => state.valid,
      readAdminBody: request => request.json(),
      checkAdminRateLimit: async () => { state.calls++; if (state.outage) throw Error('offline'); return !state.limited },
      loginAdmin: async () => state.token,
      setAdminCookie: (_, token) => { state.cookie = token },
    },
  }
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => modules[name] || require(name) })
  return { state, post: () => exports.POST({ json: async () => ({ password: 'strong password' }) }) }
}

test('login distinguishes invalid credentials, forbidden requests, limits and unavailable auth', async () => {
  const { state, post } = fixture()
  state.rejected = true
  assert.equal((await post()).status, 403)
  assert.equal(state.calls, 0)
  state.rejected = false; state.token = null
  assert.equal((await post()).status, 401)
  state.limited = true
  assert.equal((await post()).status, 429)
  state.limited = false; state.outage = true
  assert.equal((await post()).status, 503)
  assert.equal(state.cookie, null)
})

test('login rejects absent or malformed hashes before accessing Redis', async () => {
  const { state, post } = fixture()
  state.initialized = false
  assert.equal((await post()).body.error, 'admin_not_configured')
  state.initialized = true; state.valid = false
  assert.equal((await post()).body.error, 'invalid_admin_configuration')
  assert.equal(state.calls, 0)
})

test('successful login sets only the generated session token', async () => {
  const { state, post } = fixture()
  const response = await post()
  assert.equal(response.body.authenticated, true)
  assert.equal(response.headers['Cache-Control'], 'no-store')
  assert.equal(state.cookie, 'session-token')
})
