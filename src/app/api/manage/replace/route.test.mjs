import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const { NextRequest, NextResponse } = require('next/server')
const MAX = 4 * 1024 * 1024
const target = { id: 'id/+?中', path: '/sub/a%20 +#中.txt', name: 'a%20 +#中.txt', eTag: '"v1"', size: MAX * 9, kind: 'file' }
class MutationError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status }
}
function load(path, mocks) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
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
  const state = { calls: [], rates: [], tokenCalls: 0, clears: 0, resolves: [], reads: 0 }
  const admin = load('../../../../lib/adminAuth.ts', {
    'node:crypto': require('node:crypto'), 'next/server': { NextResponse },
    '../../config/site.config': { kvPrefix: 'test:' },
    '../utils/redisClient': { getRedisClient: () => { throw new Error('Redis must not be used') } },
  })
  admin.requireAdmin = async () => null
  admin.checkAdminRateLimit = async (...args) => { state.rates.push(args); return true }
  // Exercise the shared authorization implementation and its actual Origin/CSRF checks.
  const shared = load('../../upload/shared.ts', {
    'next/server': { NextResponse }, '../../../lib/adminAuth': admin,
  })
  const resolver = {
    MutationError,
    resolveManagedItem: async (...args) => {
      state.resolves.push(args)
      return state.resolve ? state.resolve(...args) : { ...target, path: args[1], id: args[2] }
    },
  }
  const axios = {
    put: async (url, body, config) => {
      state.calls.push({ url, body, config })
      return state.write ? state.write(url, body, config) : {
        status: 200, data: { id: target.id, name: target.name, size: body.length, file: {}, eTag: '"v2"' },
      }
    },
  }
  const { PUT } = load('./route.ts', {
    'next/server': { NextResponse },
    '../../../../../config/api.config': { driveApi: 'https://graph.test/me/drive' },
    '../../../../lib/driveMutation': resolver,
    '../../../../lib/adminAuth': admin,
    '../../../../lib/cache': { clearCache: () => { state.clears++ } },
    '../../../../lib/odApi': { getAccessToken: async () => {
      state.tokenCalls++
      if (state.tokenFailure) throw new Error('private-token')
      return 'private-token'
    } },
    '../../../../utils/axiosInstance': axios,
    '../../upload/shared': shared,
  })
  function request(options = {}) {
    const params = new URLSearchParams({ path: options.path ?? target.path, id: options.id ?? target.id })
    if (options.extraQuery) params.append(...options.extraQuery)
    const headers = new Headers({
      host: 'example.test', origin: 'https://example.test', 'x-requested-with': 'XMLHttpRequest',
      'content-type': 'application/octet-stream', 'if-match': target.eTag, 'x-file-size': '3',
    })
    for (const [key, value] of Object.entries(options.headers ?? {})) {
      if (value === null) headers.delete(key)
      else headers.set(key, value)
    }
    const body = options.body === undefined ? new Uint8Array([0, 128, 255]) : options.body
    return new NextRequest('https://example.test/api/manage/replace?' + params, {
      method: 'PUT', headers, body, ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
    })
  }
  function stream(chunks, onRead) {
    let index = 0
    return new ReadableStream({
      pull(controller) {
        state.reads++
        onRead?.()
        if (index < chunks.length) controller.enqueue(chunks[index++])
        else controller.close()
      },
      cancel() { state.cancelled = true },
    }, { highWaterMark: 0 })
  }
  return { PUT, state, admin, request, stream }
}
async function error(response, code, status) {
  assert.equal(response.status, status)
  assert.deepEqual(await response.json(), { error: code })
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
}

test('authorizes before tokens, resolver or body reads; checks actual shared Origin and CSRF rules', async () => {
  const { PUT, state, admin, request, stream } = setup()
  admin.requireAdmin = async () => NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await error(await PUT(request({ body: stream([new Uint8Array(3)]) })), 'unauthorized', 401)
  admin.requireAdmin = async () => null
  for (const headers of [
    { origin: 'https://evil.test' }, { 'x-requested-with': null }, { host: 'other.test' },
  ]) await error(await PUT(request({ headers, body: stream([new Uint8Array(3)]) })), 'invalid_request', 403)
  admin.requireAdmin = async () => { throw new Error('private-token') }
  await error(await PUT(request()), 'auth_unavailable', 503)
  assert.equal(state.tokenCalls, 0)
  assert.equal(state.resolves.length, 0)
  assert.equal(state.calls.length, 0)
  assert.equal(state.reads, 0)
})

test('uses manage rate limiting and fails closed on rate-store or token failure', async () => {
  const { PUT, state, admin, request } = setup()
  admin.checkAdminRateLimit = async action => { assert.equal(action, 'manage'); return false }
  await error(await PUT(request()), 'rate_limited', 429)
  admin.checkAdminRateLimit = async () => { throw new Error('private-token') }
  await error(await PUT(request()), 'auth_unavailable', 503)
  assert.equal(state.tokenCalls, 0)
  admin.checkAdminRateLimit = async () => true
  state.tokenFailure = true
  await error(await PUT(request()), 'upstream_unavailable', 503)
  assert.equal(state.resolves.length, 0)
})

test('checks the target before reading and again before one conditional item-ID PUT', async () => {
  const { PUT, state, request, stream } = setup()
  const response = await PUT(request({ body: stream([new Uint8Array([0]), new Uint8Array([128, 255])], () => {
    assert.equal(state.resolves.length, 1)
    assert.equal(state.calls.length, 0)
  }) }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await response.json(), { item: { ...target, size: 3, eTag: '"v2"' } })
  assert.equal(state.resolves.length, 2)
  for (const [token, path, id, signal] of state.resolves) {
    assert.equal(token, 'private-token')
    assert.equal(path, target.path)
    assert.equal(id, target.id)
    assert.ok(signal instanceof AbortSignal)
  }
  assert.deepEqual(state.rates, [['manage', 120]])
  const [write] = state.calls
  assert.equal(state.calls.length, 1)
  assert.equal(write.url, 'https://graph.test/me/drive/items/' + encodeURIComponent(target.id) + '/content')
  assert.deepEqual(write.body, Buffer.from([0, 128, 255]))
  assert.deepEqual(write.config.headers, {
    Authorization: 'Bearer private-token', 'Content-Type': 'application/octet-stream',
    'If-Match': target.eTag, 'Content-Length': '3',
  })
  assert.equal(write.config.maxRedirects, 0)
  assert.equal(write.config.maxBodyLength, MAX)
  assert.equal(state.clears, 1)
})

test('accepts empty binary bodies and exactly 4 MiB; original size is unrestricted', async () => {
  const { PUT, state, request } = setup()
  for (const size of [0, MAX]) {
    const response = await PUT(request({
      body: size ? new Uint8Array(size) : null,
      headers: { 'x-file-size': String(size), 'content-length': String(size) },
    }))
    assert.equal(response.status, 200)
    assert.equal((await response.json()).item.size, size)
  }
  assert.equal(state.calls.length, 2)
  assert.equal(state.calls[0].body.byteLength, 0)
})

test('rejects oversized, invalid or contradictory declarations and nonbinary content before Graph', async () => {
  const { PUT, state, request } = setup()
  for (const headers of [
    { 'x-file-size': String(MAX + 1) }, { 'content-length': String(MAX + 1) },
  ]) await error(await PUT(request({ headers })), 'file_too_large', 413)
  for (const headers of [
    { 'x-file-size': null }, { 'x-file-size': '-1' }, { 'x-file-size': '1.5' },
    { 'x-file-size': '3, 3' }, { 'x-file-size': '9007199254740992' },
    { 'content-length': '2' }, { 'content-length': 'abc' },
    { 'content-type': 'text/plain' }, { 'content-type': 'multipart/form-data' },
    { 'content-type': null }, { 'content-encoding': 'gzip' },
  ]) await error(await PUT(request({ headers })), 'invalid_request', 400)
  assert.equal(state.tokenCalls, 0)
  assert.equal(state.resolves.length, 0)
  assert.equal(state.calls.length, 0)
})

test('bounds streaming bytes, validates actual size, and cancels rejected bodies', async () => {
  const { PUT, state, request, stream } = setup()
  await error(await PUT(request({ body: stream([new Uint8Array(MAX + 1)]) })), 'file_too_large', 413)
  assert.equal(state.cancelled, true)
  for (const body of [
    stream([new Uint8Array(2)]), stream([new Uint8Array(4)]), null,
    new ReadableStream({ start(controller) { controller.error(new Error('private-token')) } }),
  ]) await error(await PUT(request({ body })), 'invalid_request', 400)
  // Request streams are byte streams; a hostile/nonstandard reader must fail closed too.
  const malformed = request()
  Object.defineProperty(malformed, 'body', { value: stream(['text']) })
  await error(await PUT(malformed), 'invalid_request', 400)
  assert.equal(state.calls.length, 0)
  assert.equal(state.clears, 0)
})

test('rejects wildcard, weak, list, empty and control-character ETags before Graph', async () => {
  const { PUT, state, request } = setup()
  for (const eTag of [null, '', '*', 'W/"v1"', '"v1", "v2"', '""', 'v1', '"x\u007fy"', 'x'.repeat(1025)]) {
    await error(await PUT(request({ headers: { 'if-match': eTag } })), 'invalid_request', 400)
  }
  // Fetch Headers itself rejects CR/LF; use a reader to exercise route validation directly.
  for (const eTag of ['"x\r\ny"', '"x\u0000y"']) {
    const input = request()
    const get = input.headers.get.bind(input.headers)
    input.headers.get = name => name === 'if-match' ? eTag : get(name)
    await error(await PUT(input), 'invalid_request', 400)
  }
  await error(await PUT(request({ extraQuery: ['id', 'other'] })), 'invalid_request', 400)
  assert.equal(state.tokenCalls, 0)
})

test('delegates decoded paths and IDs unchanged to the resolver and preserves its errors', async () => {
  const { PUT, state, request, stream } = setup()
  for (const [path, id, code, status] of [
    ['/a/../b', 'id', 'invalid_request', 400], ['/', 'id', 'protected_item', 403],
    ['/.password', 'id', 'protected_item', 403], ['/safe/.PASSWORD/child', 'id', 'protected_item', 403],
    ['/outside', 'cross-drive', 'outside_share', 403], ['/file', 'shortcut', 'unsupported_item', 400],
    ['/file', 'bad/ID?%20', 'invalid_request', 400],
  ]) {
    state.resolve = (_token, actualPath, actualId) => {
      assert.equal(actualPath, path); assert.equal(actualId, id)
      throw new MutationError(code, status)
    }
    await error(await PUT(request({ path, id, body: stream([new Uint8Array(3)]) })), code, status)
  }
  assert.equal(state.reads, 0)
  assert.equal(state.calls.length, 0)
})

test('rejects folders, initial stale versions, and changes during body reading without a write', async () => {
  const { PUT, state, request, stream } = setup()
  state.resolve = () => ({ ...target, kind: 'folder' })
  await error(await PUT(request()), 'unsupported_item', 400)
  state.resolve = () => ({ ...target, eTag: '"other"' })
  await error(await PUT(request({ body: stream([new Uint8Array(3)]) })), 'item_changed', 412)
  assert.equal(state.reads, 0)
  for (const [change, status] of [
    [{ eTag: '"new"' }, 412], [{ id: 'moved-id' }, 409],
    [{ path: '/moved' }, 409], [{ name: 'moved.txt' }, 409], [{ kind: 'folder' }, 409],
  ]) {
    let version = 0
    state.resolve = () => ({ ...target, ...(version++ ? change : {}) })
    await error(await PUT(request()), 'item_changed', status)
  }
  assert.equal(state.calls.length, 0)
  assert.equal(state.clears, 0)
})

test('maps Graph 412 and definite failures, clears cache, and never retries', async () => {
  const { PUT, state, request } = setup()
  for (const [status, code, expectedStatus] of [
    [412, 'item_changed', 412], [404, 'item_not_found', 404], [409, 'conflict', 409],
    [429, 'rate_limited', 429], [401, 'write_failed', 403], [403, 'write_failed', 403],
    [400, 'write_failed', 502], [500, 'write_uncertain', 502],
  ]) {
    state.write = () => { throw { response: { status, data: 'private-token upstream/private' } } }
    const attempts = state.calls.length
    await error(await PUT(request()), code, expectedStatus)
    assert.equal(state.calls.length, attempts + 1)
    assert.equal(state.clears, state.calls.length)
  }
})

test('lost responses, redirects, unexpected 2xx and malformed Graph metadata are uncertain', async () => {
  const { PUT, state, request } = setup()
  const good = { id: target.id, name: target.name, size: 3, file: {}, eTag: '"v2"' }
  const outcomes = [
    new Error('private-token upstream/private'),
    { status: 201, data: good }, { status: 202, data: good }, { status: 204 },
    { status: 302, data: good }, { status: 200, data: null },
  ]
  for (const [key, value] of [
    ['id', 'new-id'], ['name', 'renamed.txt'], ['size', 4], ['size', '3'], ['file', null],
    ['file', []], ['folder', {}], ['remoteItem', {}], ['root', {}],
    ['eTag', undefined], ['eTag', '*'], ['eTag', 'W/"v2"'],
  ]) outcomes.push({ status: 200, data: { ...good, [key]: value } })
  for (const outcome of outcomes) {
    state.write = () => { if (outcome instanceof Error) throw outcome; return outcome }
    const attempts = state.calls.length
    await error(await PUT(request()), 'write_uncertain', 502)
    assert.equal(state.calls.length, attempts + 1)
    assert.equal(state.clears, state.calls.length)
  }
})
