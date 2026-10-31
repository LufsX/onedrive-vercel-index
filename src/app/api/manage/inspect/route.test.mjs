import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  require, admin, od, axios, NextResponse, setup, request, itemId, responseError,
} from '../../../../lib/driveMutation.test.mjs'

const { POST } = require('../app/api/manage/inspect/route.ts')
const input = { path: '/file.txt', id: itemId('/Corp/Share/file.txt') }

test('inspect returns only the validated public item snapshot and no-store headers', async t => {
  const state = setup(t)
  const response = await POST(request('inspect', input))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await response.json(), { item: {
    ...input, name: 'file.txt', eTag: '"v1"', size: 12, kind: 'file',
  } })
  assert.deepEqual(state.rates, [['manage', 120]])
  assert.equal(state.calls.length, 4)
})

test('inspect supports folders and existing ordinary dot files', async t => {
  setup(t)
  const folder = await POST(request('inspect', { path: '/Folder', id: itemId('/Corp/Share/Folder') }))
  assert.equal((await folder.json()).item.kind, 'folder')
  const hidden = await POST(request('inspect', { path: '/.hidden', id: itemId('/Corp/Share/.hidden') }))
  assert.equal((await hidden.json()).item.name, '.hidden')
})

test('admin, Origin and CSRF rejection prevent token and Graph calls', async t => {
  const state = setup(t)
  admin.requireAdmin = async () => NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await responseError(await POST(request('inspect', input)), 'unauthorized', 401)
  admin.requireAdmin = async () => NextResponse.json({ error: 'auth_unavailable' }, { status: 503 })
  await responseError(await POST(request('inspect', input)), 'auth_unavailable', 503)
  admin.requireAdmin = async () => null
  await responseError(await POST(request('inspect', input, { origin: 'https://evil.test' })), 'invalid_request', 403)
  await responseError(await POST(request('inspect', input, { 'x-requested-with': '' })), 'invalid_request', 403)
  assert.equal(state.calls.length, 0)
  assert.equal(state.tokenCalls, 0)
  assert.equal(state.rates.length, 0)
})

test('independent manage rate limiting fails closed before any Graph request', async t => {
  const state = setup(t)
  admin.checkAdminRateLimit = async action => { assert.equal(action, 'manage'); return false }
  await responseError(await POST(request('inspect', input)), 'rate_limited', 429)
  admin.checkAdminRateLimit = async () => { throw new Error('private redis URL') }
  await responseError(await POST(request('inspect', input)), 'auth_unavailable', 503)
  assert.equal(state.calls.length, 0)
  assert.equal(state.tokenCalls, 0)
})

test('small JSON and typed decoded path/ID validation reject invalid inputs', async t => {
  const state = setup(t)
  for (const body of [null, [], { path: '/file.txt' }, { ...input, id: '' },
    { ...input, id: {} }, { ...input, path: '/a/../file.txt' }, { ...input, path: 1 },
    { ...input, extra: 'x'.repeat(9000) }]) {
    await responseError(await POST(request('inspect', body)), 'invalid_request', 400)
  }
  const malformed = request('inspect', input)
  Object.defineProperty(malformed, 'body', { value: new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{oops')); controller.close() },
  }) })
  await responseError(await POST(malformed), 'invalid_request', 400)
  await responseError(await POST(request('inspect', input, { 'content-length': '9000' })), 'invalid_request', 400)
  assert.equal(state.calls.length, 0)
  assert.equal(state.tokenCalls, 0)
})

test('inspect enforces ID/path agreement and root/password protections', async t => {
  const state = setup(t)
  await responseError(await POST(request('inspect', { ...input, path: '/wrong.txt' })), 'item_changed', 409)
  await responseError(await POST(request('inspect', { ...input, id: 'missing-id' })), 'item_not_found', 404)
  const count = state.calls.length
  await responseError(await POST(request('inspect', { ...input, path: '/' })), 'protected_item', 403)
  await responseError(await POST(request('inspect', { ...input, path: '/.PASSWORD/a' })), 'protected_item', 403)
  assert.equal(state.calls.length, count)
})

test('upstream errors expose only stable codes, including unavailable access tokens', async t => {
  setup(t)
  od.getAccessToken = async () => ''
  await responseError(await POST(request('inspect', input)), 'upstream_unavailable', 503)
  od.getAccessToken = async () => 'test-secret-token'
  axios.get = async () => { throw { response: { status: 500, data: 'test-secret-token https://upstream/private' } } }
  await responseError(await POST(request('inspect', input)), 'upstream_unavailable', 502)
})
