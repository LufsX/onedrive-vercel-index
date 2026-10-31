import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
function fixture() {
  let reads = 0, graph = 0, stores = 0, identity = 'owner@example.com'
  class Response {
    constructor(body, options) { this.body = body; Object.assign(this, options) }
    static json(body, options) { return { body, ...options } }
  }
  const modules = {
    'next/server': { NextResponse: Response },
    '../../utils/axiosInstance': { __esModule: true, default: {} },
    '../../../config/api.config': { __esModule: true, default: { driveApi: 'https://graph.example/me/drive' } },
    '../../lib/odApi': { storeTokensFromRequestBody: async () => { stores++; return true } },
    '../../lib/driveListing': {},
    '../../utils/odAuthTokenStore': {},
    '../../utils/oAuthHandler': { revealObfuscatedToken: value => value },
    '../../lib/oauthSetup': require('../../lib/oauthSetup.ts'),
    '../../../config/site.config': { __esModule: true, default: { userPrincipalName: 'owner@example.com' } },
    '../../lib/adminAuth': {
      validateWriteRequest: () => null,
      requireAdmin: async () => null,
      checkAdminRateLimit: async () => true,
      readAdminBody: async request => { reads++; return request.parsed },
    },
  }
  const exports = {}
  const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
  vm.runInNewContext(code, {
    exports, require: name => modules[name] || require(name), Headers, AbortSignal,
    fetch: async () => { graph++; return { ok: true, json: async () => ({ userPrincipalName: identity }) } },
  })
  return { post: parsed => exports.POST({ parsed }), setIdentity: value => { identity = value }, counts: () => ({ reads, graph, stores }) }
}

test('token write uses bounded body parser before Graph and preserves owner validation', async () => {
  const f = fixture()
  assert.equal((await f.post(null)).status, 400)
  assert.deepEqual(f.counts(), { reads: 1, graph: 0, stores: 0 })
  const body = { obfuscatedAccessToken: 'access', obfuscatedRefreshToken: 'refresh', accessTokenExpiry: 3600 }
  f.setIdentity('other@example.com')
  assert.equal((await f.post(body)).status, 403)
  assert.equal(f.counts().stores, 0)
  f.setIdentity('owner@example.com')
  assert.equal((await f.post(body)).status, 200)
  assert.equal(f.counts().stores, 1)
})
