import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const { NextRequest, NextResponse } = require('next/server')
class MutationError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status }
}
function load(path, mocks) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(id => {
    assert.ok(Object.hasOwn(mocks, id), 'Unexpected import ' + id)
    return mocks[id]
  }, loaded, loaded.exports)
  return loaded.exports
}
function setup() {
  const state = { calls: [], tokens: 0, rates: [] }
  const admin = load('../../../../../lib/adminAuth.ts', {
    'node:crypto': require('node:crypto'), 'next/server': { NextResponse },
    '../../config/site.config': { kvPrefix: 'test:' },
    '../utils/redisClient': { getRedisClient: () => { throw new Error('No real Redis') } },
  })
  admin.requireAdmin = async () => state.denied ?? null
  admin.checkAdminRateLimit = async (...args) => {
    state.rates.push(args)
    if (state.rateError) throw new Error('private error')
    return !state.rateDenied
  }
  const shared = load('../../shared.ts', {
    'next/server': { NextResponse }, '../../../lib/adminAuth': admin,
  })
  const lib = load('../../../../../lib/uploadReplacement.ts', {
    'node:crypto': require('node:crypto'), 'next/server': {},
    '../../config/api.config': {}, '../../config/site.config': {},
    '../utils/axiosInstance': {}, '../utils/redisClient': {},
    '../app/api/upload/shared': shared, './adminAuth': admin,
    './cache': {}, './driveMutation': {
      MutationError, mutationError: error => error instanceof MutationError ? error : new MutationError('upstream_unavailable', 502),
    }, './pathGuard': {},
  })
  lib.commitReplacement = async (...args) => {
    state.calls.push(args)
    if (state.failure) throw state.failure
    return state.result ?? { ok: true, backupName: 'backup.txt', item: { id: 'final-id' } }
  }
  const route = load('./route.ts', {
    'next/server': { NextResponse },
    '../../../../../lib/driveMutation': { mutationAccessToken: async () => { state.tokens++; return 'private-token' } },
    '../../../../../lib/uploadReplacement': lib, '../../shared': shared,
  })
  const request = (options = {}) => {
    const headers = new Headers({
      host: 'example.test', origin: 'https://example.test', 'x-requested-with': 'XMLHttpRequest',
      'content-type': 'application/json', cookie: 'admin_session=signed-cookie',
    })
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      if (value === null) headers.delete(name); else headers.set(name, value)
    }
    return new NextRequest('https://example.test/api/upload/replace/commit', {
      method: 'POST', headers,
      body: options.raw ?? JSON.stringify(options.body ?? { path: '/sub', name: 'file.txt', size: 5 }),
    })
  }
  return { POST: route.POST, state, request, lib }
}
async function error(response, code, status) {
  assert.equal(response.status, status)
  assert.deepEqual(await response.json(), { error: code })
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
}
test('commit authorization and actual Origin/CSRF checks precede all token or Graph work', async () => {
  const { POST, state, request } = setup()
  state.denied = NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await error(await POST(request()), 'unauthorized', 401)
  state.denied = undefined
  for (const headers of [
    { origin: 'https://evil.test' }, { host: 'evil.test' }, { 'x-requested-with': null },
  ]) await error(await POST(request({ headers })), 'invalid_request', 403)
  await error(await POST(request({ headers: { cookie: null } })), 'unauthorized', 401)
  assert.equal(state.tokens, 0)
  assert.equal(state.calls.length, 0)
})
test('commit bounds JSON, fails closed on rate storage and uses its own rate bucket', async () => {
  const { POST, state, request } = setup()
  state.rateDenied = true
  await error(await POST(request()), 'rate_limited', 429)
  assert.deepEqual(state.rates, [['upload-commit', 120]])
  state.rateDenied = false
  state.rateError = true
  await error(await POST(request()), 'auth_unavailable', 503)
  state.rateError = false
  for (const raw of ['null', '[]', '{', JSON.stringify({ text: 'x'.repeat(8193) })]) {
    await error(await POST(request({ raw })), 'invalid_request', 400)
  }
  await error(await POST(request({ headers: { 'content-length': '9000' } })), 'invalid_request', 400)
  assert.equal(state.tokens, 0)
  assert.equal(state.calls.length, 0)
})
test('commit passes input and hashed session owner with private no-store responses', async () => {
  const { POST, state, request } = setup()
  const body = { path: '/中文', name: 'file #.txt', size: 5 }
  const response = await POST(request({ body }))
  assert.deepEqual(await response.json(), { ok: true, backupName: 'backup.txt', item: { id: 'final-id' } })
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(state.calls[0][0], 'private-token')
  assert.match(state.calls[0][1], /^[a-f0-9]{64}$/)
  assert.deepEqual(state.calls[0][2], body)
  assert.equal(state.calls[0].length, 3)
})
test('commit preserves mutation error codes without leaking upstream details', async () => {
  const { POST, state, request } = setup()
  state.failure = new MutationError('file_too_large', 413)
  await error(await POST(request()), 'file_too_large', 413)
  state.failure = new Error('private-token https://private-upload-url')
  await error(await POST(request()), 'upstream_unavailable', 502)
})
