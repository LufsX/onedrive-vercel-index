import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
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
function fixture() {
  let limited = false, outage = false, rejected = false, generated = 0
  const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')
  const code = compileOnce(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const modules = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    '../../../../lib/adminAuth': {
      adminError: (error, status) => ({ body: { error }, status }),
      validateWriteRequest: () => rejected ? { status: 403 } : null,
      adminUnavailable: () => ({ body: { error: 'auth_unavailable' }, status: 503 }),
      readAdminBody: request => request.json(),
      checkAdminRateLimit: async () => { if (outage) throw Error('offline'); return !limited },
      generateAdminSetup: async () => { generated++; return { passwordHash: 'scrypt:hash', sessionSecret: 'secret' } },
    },
  }
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => modules[name] || require(name) })
  return {
    post: () => exports.POST({ json: async () => ({ password: 'strong password' }) }),
    set: (name, value) => { if (name === 'limited') limited = value; if (name === 'outage') outage = value; if (name === 'rejected') rejected = value },
    generated: () => generated,
  }
}
test('configuration generation is repeatable, same-origin, rate limited, and fails closed on Redis outage', async () => {
  const f = fixture()
  f.set('rejected', true)
  assert.equal((await f.post()).status, 403)
  f.set('rejected', false); f.set('limited', true)
  assert.equal((await f.post()).status, 429)
  f.set('limited', false); f.set('outage', true)
  assert.equal((await f.post()).status, 503)
  assert.equal(f.generated(), 0)
  f.set('outage', false)
  const result = await f.post()
  assert.equal(result.body.passwordHash, 'scrypt:hash')
  assert.equal(result.headers['Cache-Control'], 'no-store')
  assert.equal((await f.post()).body.passwordHash, 'scrypt:hash')
  assert.equal(f.generated(), 2)
})
