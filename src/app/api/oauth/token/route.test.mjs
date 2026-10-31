import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
function fixture() {
  let rejectWrite = false, rejectAuth = false, identity = 'owner@example.com', calls = [], stored = null
  const code = ts.transpileModule(readFileSync(new URL('./route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const oauth = require('../../../../lib/oauthSetup.ts')
  const modules = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    '../../../../../config/api.config': { __esModule: true, default: { clientId: 'client', redirectUri: 'http://localhost/', authApi: 'https://login.example/token', driveApi: 'https://graph.example/me/drive' } },
    '../../../../../config/site.config': { __esModule: true, default: { userPrincipalName: 'owner@example.com' } },
    '../../../../lib/oauthServerConfig': { getOAuthClientSecret: () => 'client-secret' },
    '../../../../lib/oauthSetup': oauth,
    '../../../../lib/adminAuth': {
      adminError: (error, status) => ({ body: { error }, status }),
      validateWriteRequest: () => rejectWrite ? { status: 403 } : null,
      requireAdmin: async () => rejectAuth ? { status: 401 } : null,
      readAdminBody: request => request.json(),
      checkAdminRateLimit: async () => true,
    },
    '../../../../lib/odApi': { storeTokensFromRequestBody: async body => { stored = body; return true } },
    '../../../../utils/oAuthHandler': { obfuscateToken: token => 'encoded:' + token },
  }
  const exports = {}
  const fetch = async (url, options) => {
    calls.push({ url, options })
    if (url.includes('token')) return { ok: true, json: async () => ({ access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 3600 }) }
    return { ok: true, json: async () => ({ userPrincipalName: identity }) }
  }
  vm.runInNewContext(code, { exports, require: name => modules[name] || require(name), process: { env: {} }, URLSearchParams, AbortSignal, fetch })
  return {
    post: (body = { code: 'authorization-code' }) => exports.POST({ json: async () => body }),
    setWrite: value => { rejectWrite = value }, setAuth: value => { rejectAuth = value },
    setIdentity: value => { identity = value }, calls: () => calls, stored: () => stored,
  }
}

test('token exchange checks CSRF and session before contacting Microsoft', async () => {
  const f = fixture()
  f.setWrite(true)
  assert.equal((await f.post()).status, 403)
  f.setWrite(false)
  f.setAuth(true)
  assert.equal((await f.post()).status, 401)
  f.setAuth(false)
  assert.equal(f.calls().length, 0)
})

test('token exchange verifies identity and stores tokens without returning them', async () => {
  const f = fixture()
  const response = await f.post()
  assert.equal(response.body.stored, true)
  assert.equal(JSON.stringify(response).includes('secret'), false)
  assert.equal(f.calls().length, 2)
  assert.equal(f.stored().obfuscatedAccessToken, 'encoded:access-secret')
  assert.equal(f.stored().obfuscatedRefreshToken, 'encoded:refresh-secret')
})

test('token exchange refuses a different Microsoft identity', async () => {
  const f = fixture()
  f.setIdentity('other@example.com')
  assert.equal((await f.post()).status, 403)
  assert.equal(f.stored(), null)
})
