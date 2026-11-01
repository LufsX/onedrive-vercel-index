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
  const state = { initialized: false, valid: true, outage: true, checks: 0, signedSession: false, authenticated: true }
  const code = compileOnce(readFileSync(new URL('./route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  const modules = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    '../../../../lib/adminAuth': {
      adminError: (error, status) => ({ body: { error }, status }),
      adminUnavailable: () => ({ status: 503 }),
      isAdminInitialized: async () => state.initialized,
      isAdminConfigurationValid: () => state.valid,
      isAdmin: async () => {
        if (!state.signedSession) return false
        state.checks++
        if (state.outage) throw Error('offline')
        return state.authenticated
      },
    },
  }
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => modules[name] || require(name) })
  return { state, get: () => exports.GET({}) }
}

test('missing hash allows optional OAuth setup without Redis', async () => {
  const { state, get } = fixture()
  const result = await get()
  assert.equal(result.body.initialized, false)
  assert.equal(result.body.authenticated, false)
  assert.equal(state.checks, 0)
  assert.equal(result.headers['Cache-Control'], 'no-store')
})

test('invalid administrator configuration fails before accessing Redis', async () => {
  const { state, get } = fixture()
  state.initialized = true; state.valid = false
  assert.equal((await get()).body.error, 'invalid_admin_configuration')
  assert.equal(state.checks, 0)
})

test('configured anonymous visitors do not probe Redis even during an outage', async () => {
  const { state, get } = fixture()
  state.initialized = true
  const result = await get()
  assert.equal(result.body.initialized, true)
  assert.equal(result.body.authenticated, false)
  assert.equal(state.checks, 0)
  assert.equal(result.headers['Cache-Control'], 'no-store')
})

test('signed sessions require a live Redis verification and fail closed on an outage', async () => {
  const { state, get } = fixture()
  state.initialized = true; state.signedSession = true
  assert.equal((await get()).status, 503)
  assert.equal(state.checks, 1)
  state.outage = false
  assert.equal((await get()).body.authenticated, true)
  assert.equal(state.checks, 2)
  state.authenticated = false
  assert.equal((await get()).body.authenticated, false)
  assert.equal(state.checks, 3)
})
