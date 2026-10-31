import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  require, admin, axios, cache, NextResponse, setup, request, itemId, responseError,
} from '../../../../lib/driveMutation.test.mjs'

const { POST } = require('../app/api/manage/delete/route.ts')
const input = { path: '/file.txt', id: itemId('/Corp/Share/file.txt'), eTag: '"v1"' }

test('single-file deletion verifies once and sends the actual strong If-Match', async t => {
  const state = setup(t)
  cache.rememberKind('/old', 'file', 30000)
  const response = await POST(request('delete', input))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await response.json(), { deleted: true, id: input.id })
  assert.equal(state.calls.filter(call => call.method === 'get').length, 4)
  const write = state.calls.at(-1)
  assert.equal(write.method, 'delete')
  assert.ok(write.url.endsWith('/items/' + encodeURIComponent(input.id)))
  assert.equal(write.config.headers['If-Match'], input.eTag)
  assert.equal(write.config.maxRedirects, 0)
  assert.equal(cache.knownKind('/old'), undefined)
  assert.deepEqual(state.rates, [['manage', 120]])
})

test('deletion requires admin, matching Origin and CSRF before any Graph call', async t => {
  const state = setup(t)
  cache.rememberKind('/old', 'file', 30000)
  admin.requireAdmin = async () => NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await responseError(await POST(request('delete', input)), 'unauthorized', 401)
  admin.requireAdmin = async () => null
  await responseError(await POST(request('delete', input, { origin: 'https://evil.test' })), 'invalid_request', 403)
  await responseError(await POST(request('delete', input, { 'x-requested-with': '' })), 'invalid_request', 403)
  assert.equal(state.calls.length, 0)
  assert.equal(state.tokenCalls, 0)
  assert.equal(cache.knownKind('/old'), 'file')
})

test('deletion refuses folders, shortcuts, password descendants and shared root', async t => {
  const state = setup(t)
  await responseError(await POST(request('delete', {
    ...input, path: '/Folder', id: itemId('/Corp/Share/Folder'),
  })), 'unsupported_item', 400)
  state.nodes.get('/Corp/Share/file.txt').remoteItem = {}
  await responseError(await POST(request('delete', input)), 'unsupported_item', 400)
  delete state.nodes.get('/Corp/Share/file.txt').remoteItem
  for (const path of ['/', '/.password', '/safe/.PASSWORD/child']) {
    await responseError(await POST(request('delete', { ...input, path })), 'protected_item', 403)
  }
  state.nodes.get('/Corp').remoteItem = {}
  await responseError(await POST(request('delete', input)), 'unsupported_item', 400)
  assert.equal(state.calls.filter(call => call.method === 'delete').length, 0)
})

test('delete input rejects absent, wildcard, weak, list and header-injection ETags', async t => {
  const state = setup(t)
  for (const eTag of [undefined, null, '*', 'W/"v1"', '"v1", "v2"', '', '"v1"\r\nX-Test: yes']) {
    await responseError(await POST(request('delete', { ...input, eTag })), 'invalid_request', 400)
  }
  await responseError(await POST(request('delete', { ...input, path: '/a/../file.txt' })), 'invalid_request', 400)
  await responseError(await POST(request('delete', { ...input, id: {} })), 'invalid_request', 400)
  await responseError(await POST(request('delete', { ...input, padding: 'x'.repeat(9000) })), 'invalid_request', 400)
  assert.equal(state.calls.length, 0)
  assert.equal(state.tokenCalls, 0)
})

test('stale list snapshots and fresh metadata version changes return HTTP 412 without deleting', async t => {
  const state = setup(t)
  await responseError(await POST(request('delete', { ...input, eTag: '"stale"' })), 'item_changed', 412)
  state.transform = data => {
    if (data.id === input.id) data.eTag = '"v2"'
    return data
  }
  await responseError(await POST(request('delete', input)), 'item_changed', 412)
  assert.equal(state.calls.filter(call => call.method === 'delete').length, 0)
})

test('fresh moves, cross-share IDs and parent replacement cannot delete', async t => {
  const state = setup(t)
  state.transform = data => {
    if (data.id === input.id) data.name = 'moved.txt'
    return data
  }
  await responseError(await POST(request('delete', input)), 'item_changed', 409)
  state.transform = data => data.id === input.id ? {
    ...data, parentReference: { ...data.parentReference, path: '/drive/root:/Other' },
  } : data
  await responseError(await POST(request('delete', input)), 'outside_share', 403)
  state.transform = data => {
    if (data.id === itemId('/Corp/Share')) data.id = 'replacement-directory'
    return data
  }
  await responseError(await POST(request('delete', input)), 'item_changed', 409)
  assert.equal(state.calls.filter(call => call.method === 'delete').length, 0)
})

test('Graph 412 stays a strong version conflict and cache is cleared for attempted writes', async t => {
  setup(t)
  axios.delete = async (_url, config) => {
    assert.equal(config.headers['If-Match'], input.eTag)
    throw { response: { status: 412 } }
  }
  cache.rememberKind('/old', 'file', 30000)
  await responseError(await POST(request('delete', input)), 'item_changed', 412)
  assert.equal(cache.knownKind('/old'), undefined)
})

test('ambiguous write failures and unexpected success statuses never return deleted', async t => {
  setup(t)
  for (const outcome of [
    new Error('test-secret-token https://upstream/private'),
    { response: { status: 500 } },
    { status: 200 }, { status: 202 }, { status: 201 },
  ]) {
    let attempts = 0
    axios.delete = async () => {
      attempts++
      if (outcome instanceof Error || outcome.response) throw outcome
      return outcome
    }
    cache.rememberKind('/old', 'file', 30000)
    await responseError(await POST(request('delete', input)), 'write_uncertain', 502)
    assert.equal(attempts, 1)
    assert.equal(cache.knownKind('/old'), undefined)
  }
})

test('definitive write errors preserve stable codes without leaking Graph payloads', async t => {
  setup(t)
  for (const [status, code] of [[404, 'item_not_found'], [409, 'conflict'], [403, 'write_failed'], [429, 'rate_limited']]) {
    axios.delete = async () => { throw { response: { status, data: 'test-secret-token upstream/private' } } }
    await responseError(await POST(request('delete', input)), code, status)
  }
})

test('all delete safety reads run concurrently and the write waits for every validated response', async t => {
  const state = setup(t)
  const get = axios.get
  const pending = []
  axios.get = (url, config) => new Promise((resolve, reject) => {
    pending.push({ url, finish: () => get(url, config).then(resolve, reject) })
  })
  const result = POST(request('delete', input))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(pending.length, 4, 'one request each for Graph root, two ancestors and target ID')
  assert.equal(state.calls.length, 0)
  await Promise.all(pending.slice(1).toReversed().map(call => call.finish()))
  assert.equal(state.calls.filter(call => call.method === 'delete').length, 0)
  await pending[0].finish()
  assert.equal((await result).status, 200)
  assert.equal(state.calls.filter(call => call.method === 'get').length, 4)
  assert.equal(state.calls.filter(call => call.method === 'delete').length, 1)
})

test('manage rate limiting blocks deletion without touching Graph', async t => {
  const state = setup(t)
  admin.checkAdminRateLimit = async action => { assert.equal(action, 'manage'); return false }
  await responseError(await POST(request('delete', input)), 'rate_limited', 429)
  assert.equal(state.calls.length, 0)
  assert.equal(state.tokenCalls, 0)
})
