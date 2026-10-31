import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  require, admin, axios, cache, NextResponse, setup, request, itemId, responseError,
} from '../../../../lib/driveMutation.test.mjs'

const { POST } = require('../app/api/manage/folders/route.ts')
const input = { path: '/', name: '新 #目录' }

test('folder creation verifies parent once and uses fail without rename or replacement', async t => {
  const state = setup(t)
  cache.rememberKind('/old', 'file', 30000)
  const response = await POST(request('folders', input))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await response.json(), { item: {
    id: itemId('/Corp/Share/' + input.name), name: input.name, path: '/' + input.name,
    eTag: '"new-v1"', size: 0, kind: 'folder',
  } })
  assert.equal(state.calls.filter(call => call.method === 'get').length, 3)
  const write = state.calls.at(-1)
  assert.equal(write.method, 'post')
  assert.ok(write.url.endsWith('/items/' + encodeURIComponent(itemId('/Corp/Share')) + '/children'))
  assert.deepEqual(write.body, { name: input.name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
  assert.equal(write.config.maxRedirects, 0)
  assert.equal(write.config.headers.Authorization, 'Bearer test-secret-token')
  assert.equal(cache.knownKind('/old'), undefined)
  assert.deepEqual(state.rates, [['manage', 120]])
})

test('unauthenticated, invalid Origin and CSRF requests never reach Graph', async t => {
  const state = setup(t)
  admin.requireAdmin = async () => NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await responseError(await POST(request('folders', input)), 'unauthorized', 401)
  admin.requireAdmin = async () => null
  await responseError(await POST(request('folders', input, { origin: 'https://evil.test' })), 'invalid_request', 403)
  await responseError(await POST(request('folders', input, { 'x-requested-with': '' })), 'invalid_request', 403)
  assert.equal(state.calls.length, 0)
  assert.equal(state.tokenCalls, 0)
})

test('new folder names reuse upload restrictions, and unsafe parents stop before Graph', async t => {
  const state = setup(t)
  for (const name of ['.hidden', '.password', '.', '..', 'a/b', 'bad.', 'bad ', 'a%20b', 'Desktop.ini', '', 123]) {
    await responseError(await POST(request('folders', { ...input, name })), 'invalid_name', 400)
  }
  await responseError(await POST(request('folders', { ...input, path: '/a/../b' })), 'invalid_request', 400)
  await responseError(await POST(request('folders', { ...input, path: '/.PASSWORD/child' })), 'protected_item', 403)
  await responseError(await POST(request('folders', { ...input, padding: 'x'.repeat(9000) })), 'invalid_request', 400)
  assert.equal(state.calls.length, 0)
  assert.equal(state.tokenCalls, 0)
})

test('fresh parent shortcuts and ancestor replacement prohibit creation', async t => {
  const state = setup(t)
  state.nodes.get('/Corp').remoteItem = {}
  await responseError(await POST(request('folders', input)), 'unsupported_item', 400)
  delete state.nodes.get('/Corp').remoteItem
  state.transform = data => {
    if (data.id === itemId('/Corp')) data.id = 'replacement-directory'
    return data
  }
  await responseError(await POST(request('folders', input)), 'item_changed', 409)
  assert.equal(state.calls.filter(call => call.method === 'post').length, 0)
})

test('same-name conflict makes exactly one attempt and invalidates cache', async t => {
  setup(t)
  let attempts = 0
  axios.post = async (_url, body) => {
    attempts++
    assert.equal(body['@microsoft.graph.conflictBehavior'], 'fail')
    throw { response: { status: 409 } }
  }
  cache.rememberKind('/old', 'file', 30000)
  await responseError(await POST(request('folders', input)), 'conflict', 409)
  assert.equal(attempts, 1)
  assert.equal(cache.knownKind('/old'), undefined)
})

test('lost responses and server errors are uncertain, while conditional conflicts retain HTTP 412', async t => {
  setup(t)
  for (const [failure, code, status] of [
    [new Error('private test-secret-token URL'), 'write_uncertain', 502],
    [{ response: { status: 503 } }, 'write_uncertain', 502],
    [{ response: { status: 412 } }, 'item_changed', 412],
    [{ response: { status: 403 } }, 'write_failed', 403],
  ]) {
    axios.post = async () => { throw failure }
    cache.rememberKind('/old', 'file', 30000)
    await responseError(await POST(request('folders', input)), code, status)
    assert.equal(cache.knownKind('/old'), undefined)
  }
})

test('unexpected create statuses and malformed created-item responses never report success', async t => {
  setup(t)
  const post = axios.post
  const mutations = [
    response => ({ ...response, status: 200 }),
    response => ({ ...response, status: 204 }),
    response => ({ ...response, data: null }),
    response => ({ ...response, data: { ...response.data, name: input.name + ' (1)' } }),
    response => ({ ...response, data: { ...response.data, id: undefined } }),
    response => ({ ...response, data: { ...response.data, id: itemId('/Corp/Share') } }),
    response => ({ ...response, data: { ...response.data, folder: undefined, file: {} } }),
    response => ({ ...response, data: { ...response.data, remoteItem: {} } }),
    response => ({ ...response, data: { ...response.data, root: {} } }),
    response => ({ ...response, data: { ...response.data, eTag: '*' } }),
    response => ({ ...response, data: { ...response.data, size: -1 } }),
    response => ({ ...response, data: { ...response.data, parentReference: { ...response.data.parentReference, id: 'forged-parent' } } }),
    response => ({ ...response, data: { ...response.data, parentReference: { ...response.data.parentReference, driveId: 'other-drive' } } }),
    response => ({ ...response, data: { ...response.data, parentReference: { ...response.data.parentReference, path: '/drive/root:/Other' } } }),
  ]
  for (const mutate of mutations) {
    axios.post = async (...args) => mutate(await post(...args))
    cache.rememberKind('/old', 'file', 30000)
    await responseError(await POST(request('folders', input)), 'write_uncertain', 502)
    assert.equal(cache.knownKind('/old'), undefined)
  }
})

test('folder creation starts all ancestor reads concurrently and waits for boundary validation', async t => {
  const state = setup(t)
  const get = axios.get
  const pending = []
  axios.get = (url, config) => new Promise((resolve, reject) => {
    pending.push({ finish: () => get(url, config).then(resolve, reject) })
  })
  const result = POST(request('folders', input))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(pending.length, 3)
  await Promise.all(pending.slice(1).toReversed().map(call => call.finish()))
  assert.equal(state.calls.filter(call => call.method === 'post').length, 0)
  await pending[0].finish()
  assert.equal((await result).status, 200)
  assert.equal(state.calls.filter(call => call.method === 'get').length, 3)
  assert.equal(state.calls.filter(call => call.method === 'post').length, 1)
})

test('rate-limited folder creation and missing parent fail without writes', async t => {
  const state = setup(t)
  admin.checkAdminRateLimit = async action => { assert.equal(action, 'manage'); return false }
  await responseError(await POST(request('folders', input)), 'rate_limited', 429)
  admin.checkAdminRateLimit = async () => true
  await responseError(await POST(request('folders', { ...input, path: '/missing' })), 'item_not_found', 404)
  assert.equal(state.calls.filter(call => call.method === 'post').length, 0)
})
