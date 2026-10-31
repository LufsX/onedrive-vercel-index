import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
function fixture() {
  let csrf = false, unauthorized = false, outage = false, revoked = 0, cleared = 0
  const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const modules = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    '../../../../lib/adminAuth': {
      adminError: (error, status) => ({ body: { error }, status }),
      validateWriteRequest: () => csrf ? { status: 403 } : null,
      requireAdmin: async () => unauthorized ? { status: 401 } : null,
      logoutAdmin: async () => { if (outage) throw Error('offline'); revoked++ },
      clearAdminCookie: () => { cleared++ },
    },
  }
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => modules[name] || require(name) })
  return { post: () => exports.POST({}), set: (name, value) => {
    if (name === 'csrf') csrf = value
    if (name === 'unauthorized') unauthorized = value
    if (name === 'outage') outage = value
  }, counts: () => ({ revoked, cleared }) }
}

test('logout requires CSRF and a valid session before revocation and cookie removal', async () => {
  const f = fixture()
  f.set('csrf', true)
  assert.equal((await f.post()).status, 403)
  f.set('csrf', false); f.set('unauthorized', true)
  assert.equal((await f.post()).status, 401)
  assert.deepEqual(f.counts(), { revoked: 0, cleared: 0 })
  f.set('unauthorized', false); f.set('outage', true)
  assert.equal((await f.post()).status, 503)
  assert.deepEqual(f.counts(), { revoked: 0, cleared: 0 })
  f.set('outage', false)
  assert.equal((await f.post()).body.authenticated, false)
  assert.deepEqual(f.counts(), { revoked: 1, cleared: 1 })
})
