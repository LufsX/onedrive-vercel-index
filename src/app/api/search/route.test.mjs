import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => {
  module._compile(
    ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText,
    filename,
  )
}

const { NextRequest } = require('next/server')
const axiosInstance = require('../../../utils/axiosInstance.ts').default
const oauthConfigPath = require.resolve('../../../lib/oauthServerConfig.ts')
require.cache[oauthConfigPath] = {
  id: oauthConfigPath,
  filename: oauthConfigPath,
  loaded: true,
  exports: { getOAuthClientSecret: () => '' },
}
const odApi = require('../../../lib/odApi.ts')
const apiConfig = require('../../../../config/api.config.js')
const siteConfig = require('../../../../config/site.config.js')
const { GET } = require('./route.ts')

const CACHE = 'private, no-store'
const makeRequest = (query = 'test', init) =>
  new NextRequest('https://example.test/api?q=' + encodeURIComponent(query), init)
const item = (id, name, parent) => ({ id, name, file: {}, parentReference: { path: parent } })

function setUp(t) {
  const calls = { get: [], post: [] }
  const originals = {
    get: axiosInstance.get,
    post: axiosInstance.post,
    token: odApi.getAccessToken,
    driveApi: apiConfig.driveApi,
    baseDirectory: siteConfig.baseDirectory,
    protectedRoutes: siteConfig.protectedRoutes,
  }
  t.after(() => {
    axiosInstance.get = originals.get
    axiosInstance.post = originals.post
    odApi.getAccessToken = originals.token
    apiConfig.driveApi = originals.driveApi
    siteConfig.baseDirectory = originals.baseDirectory
    siteConfig.protectedRoutes = originals.protectedRoutes
  })
  apiConfig.driveApi = 'https://graph.microsoft.com/v1.0/me/drive'
  siteConfig.baseDirectory = '/Share'
  siteConfig.protectedRoutes = []
  odApi.getAccessToken = async () => 'access'
  axiosInstance.get = async (url, config) => {
    calls.get.push({ url, config })
    throw new Error('unexpected search request: ' + url)
  }
  axiosInstance.post = async (url, data, config) => {
    calls.post.push({ url, data, config })
    throw new Error('unexpected batch request: ' + url)
  }
  return calls
}

function respondSearch(calls, value, extra = {}) {
  axiosInstance.get = async (url, config) => {
    calls.get.push({ url, config })
    return { data: { value, ...extra } }
  }
}

const batchRequests = data => (typeof data === 'string' ? JSON.parse(data) : data).requests

function requestItemId(url) {
  const match = /\/items\/([^?]+)/.exec(url)
  return match ? decodeURIComponent(match[1]) : null
}

const okResponse = (request, body) => ({ id: request.id, status: 200, body })
const currentBody = (id, source) => ({ id, name: source.name, parentReference: source.parentReference })

const byIdMap = sourceItems =>
  new Map(sourceItems.filter(entry => entry && typeof entry.id === 'string').map(entry => [entry.id, entry]))

const validResponses = (requests, byId) =>
  requests.map(request => {
    const id = requestItemId(request.url)
    return okResponse(request, currentBody(id, byId.get(id)))
  })

function installFreshBatch(calls, sourceItems) {
  const byId = byIdMap(sourceItems)
  axiosInstance.post = async (url, data, config) => {
    calls.post.push({ url, data, config })
    return { status: 200, data: { responses: validResponses(batchRequests(data), byId) } }
  }
}

function installBatch(calls, bodiesById) {
  axiosInstance.post = async (url, data, config) => {
    calls.post.push({ url, data, config })
    const requests = batchRequests(data)
    return {
      status: 200,
      data: {
        responses: requests.map(request => {
          const id = requestItemId(request.url)
          return okResponse(request, { id, ...bodiesById[id] })
        }),
      },
    }
  }
}

function expectedBatchUrl(driveApi = apiConfig.driveApi) {
  const { origin, pathname } = new URL(driveApi)
  const version = /^\/(v1\.0|beta)\//.exec(pathname)[1]
  return origin + '/' + version + '/$batch'
}

const authHeader = config => config?.headers?.Authorization ?? config?.headers?.authorization

async function readBody(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

test('missing access token returns 403 and never contacts Graph', async t => {
  const calls = setUp(t)
  odApi.getAccessToken = async () => ''
  const response = await GET(makeRequest())
  assert.equal(response.status, 403)
  assert.equal(response.headers.get('cache-control'), CACHE)
  assert.equal(calls.get.length, 0)
  assert.equal(calls.post.length, 0)
})

test('empty query returns an empty array without upstream calls', async t => {
  const calls = setUp(t)
  for (const url of ['https://example.test/api', 'https://example.test/api?q=', 'https://example.test/api?other=1']) {
    const response = await GET(new NextRequest(url))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), CACHE)
    assert.deepEqual(await response.json(), [])
  }
  assert.equal(calls.get.length, 0)
  assert.equal(calls.post.length, 0)
})

test('search request failures keep their original status codes and never batch', async t => {
  const calls = setUp(t)
  for (const status of [401, 404, 429, 500]) {
    axiosInstance.get = async () => {
      throw { response: { status, data: { error: 'upstream' } } }
    }
    const response = await GET(makeRequest())
    assert.equal(response.status, status, 'status=' + status)
    assert.equal(response.headers.get('cache-control'), CACHE)
  }
  axiosInstance.get = async () => {
    throw new Error('network down')
  }
  const unknown = await GET(makeRequest())
  assert.equal(unknown.status, 500)
  assert.equal(unknown.headers.get('cache-control'), CACHE)
  assert.equal(calls.post.length, 0)
})

test('non-array search payloads and invalid protected routes return 502 before batching', async t => {
  const calls = setUp(t)
  respondSearch(calls, 'not-an-array')
  let response = await GET(makeRequest())
  assert.equal(response.status, 502)
  assert.equal(response.headers.get('cache-control'), CACHE)

  siteConfig.protectedRoutes = 'not-an-array'
  respondSearch(calls, [item('a', 'a.txt', '/drive/root:/Share')])
  response = await GET(makeRequest())
  assert.equal(response.status, 502)
  assert.equal(calls.post.length, 0)
})

test('batches current-location lookups in chunks of 20 in request order', async t => {
  const calls = setUp(t)
  for (const count of [0, 1, 20, 21, 40, 41, 100]) {
    calls.get.length = 0
    calls.post.length = 0
    const sourceItems = Array.from({ length: count }, (_, index) =>
      item('id-' + index, 'file-' + index + '.txt', '/drive/root:/Share'),
    )
    respondSearch(calls, sourceItems)
    installFreshBatch(calls, sourceItems)

    const response = await GET(makeRequest())
    assert.equal(response.status, 200, 'count=' + count)
    const body = await response.json()
    assert.equal(body.length, count, 'count=' + count)
    assert.deepEqual(body.map(entry => entry.id), sourceItems.map(entry => entry.id), 'order count=' + count)
    assert.equal(calls.post.length, Math.ceil(count / 20), 'batches count=' + count)
    assert.equal(calls.get[0].config.params.$top, siteConfig.maxItems)
    assert.equal(calls.get[0].config.params.$select, 'id,name,file,folder,parentReference')
    assert.equal(authHeader(calls.get[0].config), 'Bearer access')
    assert.ok(calls.get[0].config.signal, 'search signal count=' + count)

    for (const [index, call] of calls.post.entries()) {
      const requests = batchRequests(call.data)
      assert.equal(requests.length, Math.min(20, count - index * 20))
      assert.equal(call.url, expectedBatchUrl())
      assert.equal(authHeader(call.config), 'Bearer access')
      assert.ok(call.config.signal, 'batch signal count=' + count)
      const ids = new Set()
      for (const request of requests) {
        assert.match(request.id, /^\d+$/)
        assert.equal(request.method, 'GET')
        assert.match(request.url, /^\/me\/drive\/items\/[^?]+\?\$select=id,name,parentReference$/)
        assert.ok(!ids.has(request.id))
        ids.add(request.id)
      }
    }
  }
})

test('only items under the base directory without password or protected paths survive', async t => {
  const calls = setUp(t)
  siteConfig.protectedRoutes = ['/secret']

  const sourceItems = [
    item('ok', 'keep.txt', '/drive/root:/Share'),
    item('deep', 'deep.txt', '/drive/root:/Share/sub'),
    item('outside', 'out.txt', '/drive/root:/private'),
    item('pwd', '.PASSWORD', '/drive/root:/Share'),
    item('protected', 'in.txt', '/drive/root:/Share/secret'),
    { id: 'nopath', name: 'x.txt' },
  ]
  respondSearch(calls, sourceItems)
  installFreshBatch(calls, sourceItems)

  const response = await GET(makeRequest())
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.map(entry => entry.id), ['ok', 'deep'])
})

test('stale search paths cannot substitute for missing or moved current paths', async t => {
  const calls = setUp(t)
  siteConfig.protectedRoutes = ['/secret']
  const sourceItems = ['good', 'missingPath', 'missingName', 'movedProtected', 'movedOutside'].map(id =>
    item(id, 'stale.txt', '/drive/root:/Share'),
  )
  respondSearch(calls, sourceItems)
  installBatch(calls, {
    good: { name: 'fresh.txt', parentReference: { path: '/drive/root:/Share' } },
    missingPath: { name: 'fresh.txt' },
    missingName: { parentReference: { path: '/drive/root:/Share' } },
    movedProtected: { name: 'fresh.txt', parentReference: { path: '/drive/root:/Share/secret' } },
    movedOutside: { name: 'fresh.txt', parentReference: { path: '/drive/root:/private' } },
  })

  const response = await GET(makeRequest())
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.map(entry => [entry.id, entry.name]), [['good', 'fresh.txt']])
})

test('malformed or invalid search items return 503 without batching', async t => {
  const calls = setUp(t)
  const base = { parentReference: { path: '/drive/root:/Share' } }
  const badEntries = [
    { name: 'missing-id', ...base },
    { id: 5, name: 'number', ...base },
    { id: '', name: 'empty', ...base },
    { id: '.', name: 'dot', ...base },
    { id: '..', name: 'dotdot', ...base },
    { id: 'a/b', name: 'slash', ...base },
    { id: 'a\\b', name: 'backslash', ...base },
    { id: 'a\u0000b', name: 'nul', ...base },
    null,
    'not-an-object',
    ['array'],
  ]
  for (const bad of badEntries) {
    calls.get.length = 0
    calls.post.length = 0
    respondSearch(calls, [item('valid', 'v.txt', '/drive/root:/Share'), bad])
    const response = await GET(makeRequest())
    assert.equal(response.status, 503, 'entry=' + JSON.stringify(bad))
    assert.equal(response.headers.get('cache-control'), CACHE)
    assert.equal(calls.get.length, 1)
    assert.equal(calls.post.length, 0, 'entry=' + JSON.stringify(bad))
  }

  calls.get.length = 0
  calls.post.length = 0
  respondSearch(calls, [])
  assert.equal((await GET(makeRequest())).status, 200)
  assert.equal(calls.post.length, 0)
})

test('batch-level network and HTTP failures return 503 without leaking partial results', async t => {
  const calls = setUp(t)
  const sourceItems = [item('a', 'a.txt', '/drive/root:/Share')]
  const byId = byIdMap(sourceItems)
  const cases = [
    ['network', () => { throw new Error('connection reset') }],
    ['401', () => { throw { response: { status: 401 } } }],
    ['429', () => { throw { response: { status: 429 } } }],
    ['500', () => { throw { response: { status: 500 } } }],
    ['206', requests => ({ status: 206, data: { responses: validResponses(requests, byId) } })],
  ]
  for (const [label, reply] of cases) {
    calls.get.length = 0
    calls.post.length = 0
    respondSearch(calls, sourceItems)
    axiosInstance.post = async (url, data, config) => {
      calls.post.push({ url, data, config })
      return reply(batchRequests(data))
    }
    const response = await GET(makeRequest())
    assert.equal(response.status, 503, label)
    assert.equal(response.headers.get('cache-control'), CACHE, label)
    assert.ok(!Array.isArray(await readBody(response)), label)
  }
})

test('cross-batch partial success never leaks when any batch fails', async t => {
  const calls = setUp(t)
  const sourceItems = Array.from({ length: 40 }, (_, index) =>
    item('id-' + index, 'f-' + index + '.txt', '/drive/root:/Share'),
  )
  const byId = byIdMap(sourceItems)
  for (const failIndex of [0, 1]) {
    calls.get.length = 0
    calls.post.length = 0
    respondSearch(calls, sourceItems)
    axiosInstance.post = async (url, data, config) => {
      calls.post.push({ url, data, config })
      if (calls.post.length - 1 === failIndex) throw { response: { status: 500 } }
      return { status: 200, data: { responses: validResponses(batchRequests(data), byId) } }
    }
    const response = await GET(makeRequest())
    assert.equal(response.status, 503, 'failIndex=' + failIndex)
    assert.ok(!Array.isArray(await readBody(response)), 'failIndex=' + failIndex)
  }
})

test('sub-request statuses decide between filtering, success, and 503', async t => {
  const calls = setUp(t)

  const run = async statusById => {
    calls.get.length = 0
    calls.post.length = 0
    const sourceItems = Object.keys(statusById).map(id => item(id, id + '.txt', '/drive/root:/Share'))
    const byId = byIdMap(sourceItems)
    respondSearch(calls, sourceItems)
    axiosInstance.post = async (url, data, config) => {
      calls.post.push({ url, data, config })
      const requests = batchRequests(data)
      return {
        status: 200,
        data: {
          responses: requests.map(request => {
            const id = requestItemId(request.url)
            if (statusById[id] === 200) return okResponse(request, currentBody(id, byId.get(id)))
            return { id: request.id, status: statusById[id], body: {} }
          }),
        },
      }
    }
    return GET(makeRequest())
  }

  let response = await run({ keep: 200, forbidden: 403, gone: 404 })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).map(entry => entry.id), ['keep'])

  for (const status of [401, 429, 500, 503, 418]) {
    response = await run({ keep: 200, bad: status })
    assert.equal(response.status, 503, 'status=' + status)
    assert.ok(!Array.isArray(await readBody(response)), 'status=' + status)
  }

  response = await run({ keep: 200, forbidden: 403, bad: 401 })
  assert.equal(response.status, 503)
})

test('200 sub-responses require a matching body; missing name or path is filtered', async t => {
  const calls = setUp(t)

  const run = async responsesFor => {
    calls.get.length = 0
    calls.post.length = 0
    const sourceItems = [item('a', 'a.txt', '/drive/root:/Share')]
    respondSearch(calls, sourceItems)
    axiosInstance.post = async (url, data, config) => {
      calls.post.push({ url, data, config })
      const requests = batchRequests(data)
      return { status: 200, data: { responses: responsesFor(requests) } }
    }
    return GET(makeRequest())
  }

  const invalid = [
    requests => [{ id: requests[0].id, status: 200 }],
    requests => [{ id: requests[0].id, status: 200, body: null }],
    requests => [{ id: requests[0].id, status: 200, body: 'str' }],
    requests => [
      { id: requests[0].id, status: 200, body: { id: 'other', name: 'x', parentReference: { path: '/drive/root:/Share' } } },
    ],
  ]
  for (const build of invalid) {
    const response = await run(build)
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('cache-control'), CACHE)
  }

  for (const body of [
    { id: 'a', parentReference: { path: '/drive/root:/Share' } },
    { id: 'a', name: 'a.txt' },
  ]) {
    const response = await run(requests => [{ id: requests[0].id, status: 200, body }])
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), [])
  }
})

test('batch responses must correspond one-to-one with requests', async t => {
  const calls = setUp(t)
  const sourceItems = [item('a', 'a.txt', '/drive/root:/Share')]
  const body = { id: 'a', name: 'a.txt', parentReference: { path: '/drive/root:/Share' } }
  const cases = [
    ['data-null', () => null],
    ['responses-not-array', () => ({ responses: 'nope' })],
    ['responses-object', requests => ({ responses: { 0: { id: requests[0].id, status: 200, body } } })],
    ['response-null', () => ({ responses: [null] })],
    ['response-string', () => ({ responses: ['x'] })],
    ['id-missing', () => ({ responses: [{ status: 200, body }] })],
    ['id-number', () => ({ responses: [{ id: 1, status: 200, body }] })],
    ['id-unknown', () => ({ responses: [{ id: 'other', status: 200, body }] })],
    [
      'id-duplicate',
      requests => ({ responses: [{ id: requests[0].id, status: 200, body }, { id: requests[0].id, status: 200, body }] }),
    ],
    ['id-missing-count', () => ({ responses: [] })],
    ['status-missing', requests => ({ responses: [{ id: requests[0].id, body }] })],
    ['status-string', requests => ({ responses: [{ id: requests[0].id, status: '200', body }] })],
    [
      'extra-response',
      requests => ({ responses: [{ id: requests[0].id, status: 200, body }, { id: 'extra', status: 200, body: {} }] }),
    ],
  ]
  for (const [label, makeEnvelope] of cases) {
    calls.get.length = 0
    calls.post.length = 0
    respondSearch(calls, sourceItems)
    axiosInstance.post = async (url, data, config) => {
      calls.post.push({ url, data, config })
      return { status: 200, data: makeEnvelope(batchRequests(data)) }
    }
    const response = await GET(makeRequest())
    assert.equal(response.status, 503, label)
    assert.equal(response.headers.get('cache-control'), CACHE, label)
  }
})

test('out-of-order responses are matched by request id', async t => {
  const calls = setUp(t)
  const sourceItems = [
    item('a', 'a.txt', '/drive/root:/Share'),
    item('b', 'b.txt', '/drive/root:/Share'),
    item('c', 'c.txt', '/drive/root:/Share'),
  ]
  const byId = byIdMap(sourceItems)
  respondSearch(calls, sourceItems)

  axiosInstance.post = async (url, data, config) => {
    calls.post.push({ url, data, config })
    const requests = batchRequests(data)
    return { status: 200, data: { responses: validResponses(requests, byId).reverse() } }
  }

  const body = await (await GET(makeRequest())).json()
  assert.deepEqual(body.map(entry => entry.id), ['a', 'b', 'c'])
})

test('request signal is forwarded to the search request and every batch request', async t => {
  const calls = setUp(t)
  const controller = new AbortController()
  const sourceItems = Array.from({ length: 21 }, (_, index) => item('id-' + index, 'f.txt', '/drive/root:/Share'))
  respondSearch(calls, sourceItems)
  installFreshBatch(calls, sourceItems)

  const response = await GET(makeRequest('test', { signal: controller.signal }))
  assert.equal(response.status, 200)
  assert.ok(calls.get[0].config.signal)
  assert.equal(calls.get[0].config.signal.aborted, false)
  assert.equal(calls.post.length, 2)
  for (const call of calls.post) {
    assert.ok(call.config.signal)
    assert.equal(call.config.signal.aborted, false)
  }

  controller.abort()
  assert.equal(calls.get[0].config.signal.aborted, true)
  for (const call of calls.post) assert.equal(call.config.signal.aborted, true)
})

test('requests already aborted return 499 without token retrieval or Graph calls', async t => {
  const calls = setUp(t)
  let tokenCalls = 0
  odApi.getAccessToken = async () => {
    tokenCalls += 1
    return 'access'
  }
  const response = await GET(makeRequest('test', { signal: AbortSignal.abort() }))
  assert.equal(response.status, 499)
  assert.equal(response.headers.get('cache-control'), CACHE)
  assert.equal(tokenCalls, 0)
  assert.equal(calls.get.length, 0)
  assert.equal(calls.post.length, 0)
})

test('abort during the search request propagates through the signal and returns 499', async t => {
  const calls = setUp(t)
  const controller = new AbortController()
  axiosInstance.get = async (url, config) => {
    calls.get.push({ url, config })
    controller.abort()
    throw new Error('cancelled')
  }
  const response = await GET(makeRequest('test', { signal: controller.signal }))
  assert.equal(response.status, 499)
  assert.equal(response.headers.get('cache-control'), CACHE)
  assert.equal(calls.post.length, 0)
})

test('abort during batch verification returns 499 instead of an empty success', async t => {
  const calls = setUp(t)
  const controller = new AbortController()
  const sourceItems = [item('a', 'a.txt', '/drive/root:/Share')]
  respondSearch(calls, sourceItems)
  axiosInstance.post = async (url, data, config) => {
    calls.post.push({ url, data, config })
    controller.abort()
    throw new Error('cancelled')
  }
  const response = await GET(makeRequest('test', { signal: controller.signal }))
  assert.equal(response.status, 499)
  assert.equal(response.headers.get('cache-control'), CACHE)
  assert.ok(calls.post.length >= 1)
})

test('token failures return 499 after cancellation but surface otherwise', async t => {
  const calls = setUp(t)
  const controller = new AbortController()
  odApi.getAccessToken = async () => {
    controller.abort()
    throw new Error('token boom')
  }
  const cancelled = await GET(makeRequest('test', { signal: controller.signal }))
  assert.equal(cancelled.status, 499)
  assert.equal(cancelled.headers.get('cache-control'), CACHE)

  odApi.getAccessToken = async () => {
    throw new Error('token boom')
  }
  await assert.rejects(GET(makeRequest()), /token boom/)
  assert.equal(calls.get.length, 0)
  assert.equal(calls.post.length, 0)
})

test('invalid drive endpoints return 503 when verification is required and skip otherwise', async t => {
  const calls = setUp(t)
  for (const driveApi of [
    'https://graph.microsoft.com/v2.0/me/drive',
    'http://graph.microsoft.com/v1.0/me/drive',
    'https://user:pass@graph.microsoft.com/v1.0/me/drive',
    'https://graph.microsoft.com/v1.0/me/drive?extra=1',
  ]) {
    apiConfig.driveApi = driveApi
    calls.get.length = 0
    calls.post.length = 0
    respondSearch(calls, [item('x', 'x.txt', '/drive/root:/Share')])
    const response = await GET(makeRequest())
    assert.equal(response.status, 503, driveApi)
    assert.equal(calls.post.length, 0, driveApi)

    calls.get.length = 0
    calls.post.length = 0
    respondSearch(calls, [])
    const empty = await GET(makeRequest())
    assert.equal(empty.status, 200, driveApi)
    assert.deepEqual(await empty.json(), [], driveApi)
    assert.equal(calls.post.length, 0, driveApi)
  }
})

test('batch endpoint follows the configured API version, including beta', async t => {
  const calls = setUp(t)
  for (const version of ['v1.0', 'beta']) {
    apiConfig.driveApi = 'https://graph.microsoft.com/' + version + '/me/drive'
    calls.get.length = 0
    calls.post.length = 0
    const sourceItems = [item('x', 'x.txt', '/drive/root:/Share')]
    respondSearch(calls, sourceItems)
    installFreshBatch(calls, sourceItems)

    const body = await (await GET(makeRequest())).json()
    assert.equal(body.length, 1, version)
    assert.equal(calls.post[0].url, 'https://graph.microsoft.com/' + version + '/$batch', version)
    assert.match(calls.get[0].url, new RegExp('/' + version.replace('.', '\\.') + '/me/drive/'))
    assert.equal(authHeader(calls.post[0].config), 'Bearer access')
  }
})

test('search nextLink is never followed', async t => {
  const calls = setUp(t)
  const sourceItems = [item('one', 'one.txt', '/drive/root:/Share')]
  respondSearch(calls, sourceItems, {
    '@odata.nextLink': "https://graph.microsoft.com/v1.0/me/drive/root:/Share:/search(q='test')?$skiptoken=abc",
  })
  installFreshBatch(calls, sourceItems)

  const body = await (await GET(makeRequest())).json()
  assert.equal(body.length, 1)
  assert.equal(calls.get.length, 1)
  assert.equal(calls.post.length, 1)
  assert.ok(!calls.get.some(call => call.url.includes('skiptoken')))
})

test('malicious fresh names and parent paths from Graph are rejected', async t => {
  const calls = setUp(t)
  const sourceItems = [
    item('good', 'a.txt', '/drive/root:/Share'),
    item('slashName', 'b.txt', '/drive/root:/Share'),
    item('dotdotName', 'c.txt', '/drive/root:/Share'),
    item('backslashName', 'd.txt', '/drive/root:/Share'),
    item('badRoot', 'e.txt', '/drive/root:/Share'),
    item('travParent', 'f.txt', '/drive/root:/Share'),
    item('drivesOk', 'g.txt', '/drive/root:/Share'),
  ]
  respondSearch(calls, sourceItems)
  installBatch(calls, {
    good: { name: 'ok.txt', parentReference: { path: '/drive/root:/Share' } },
    slashName: { name: 'sub/evil.txt', parentReference: { path: '/drive/root:/Share' } },
    dotdotName: { name: '..', parentReference: { path: '/drive/root:/Share' } },
    backslashName: {
      name: 'sub' + String.fromCharCode(92) + 'evil.txt',
      parentReference: { path: '/drive/root:/Share' },
    },
    badRoot: { name: 'evil.txt', parentReference: { path: '/evil/root:/Share' } },
    travParent: { name: 'evil.txt', parentReference: { path: '/drive/root:/Share/..' } },
    drivesOk: { name: 'ok.txt', parentReference: { path: '/drives/driveId/root:/Share' } },
  })
  const body = await (await GET(makeRequest())).json()
  assert.deepEqual(body.map(entry => entry.id), ['good', 'drivesOk'])
})

test('cache-control stays private, no-store across outcomes', async t => {
  const calls = setUp(t)
  odApi.getAccessToken = async () => ''
  assert.equal((await GET(makeRequest())).headers.get('cache-control'), CACHE)

  odApi.getAccessToken = async () => 'access'
  assert.equal((await GET(new NextRequest('https://example.test/api'))).headers.get('cache-control'), CACHE)

  const sourceItems = [item('a', 'a.txt', '/drive/root:/Share')]
  respondSearch(calls, sourceItems)
  installFreshBatch(calls, sourceItems)
  assert.equal((await GET(makeRequest())).headers.get('cache-control'), CACHE)

  axiosInstance.get = async () => {
    throw new Error('down')
  }
  assert.equal((await GET(makeRequest())).headers.get('cache-control'), CACHE)
})
