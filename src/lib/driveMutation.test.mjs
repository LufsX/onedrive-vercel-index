import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const require = createRequire(import.meta.url)
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename,
)
const oauthConfigPath = require.resolve('./oauthServerConfig.ts')
require.cache[oauthConfigPath] = {
  id: oauthConfigPath, filename: oauthConfigPath, loaded: true,
  exports: { getOAuthClientSecret: () => '' },
}
export const { NextRequest, NextResponse } = require('next/server')
export const admin = require('./adminAuth.ts')
export const od = require('./odApi.ts')
export const cache = require('./cache.ts')
export const axios = require('../utils/axiosInstance.ts').default
export const site = require('../../config/site.config.js')
export const api = require('../../config/api.config.js')
export const mutation = require('./driveMutation.ts')
export const itemId = path => path === '/' ? 'root-id' : 'id-' + encodeURIComponent(path)

export function graphItem(path, kind = 'folder', extra = {}) {
  if (path === '/') return {
    id: itemId('/'), name: 'root', root: {}, folder: {}, eTag: '"root-v1"', size: 0,
    parentReference: { driveId: 'drive-one' }, ...extra,
  }
  const parent = path.slice(0, path.lastIndexOf('/')) || '/'
  const encodedParent = parent === '/' ? '' : '/' + parent.slice(1).split('/').map(encodeURIComponent).join('/')
  return {
    id: itemId(path), name: path.slice(path.lastIndexOf('/') + 1), [kind]: {}, eTag: '"v1"', size: 0,
    parentReference: { id: itemId(parent), driveId: 'drive-one', path: '/drive/root:' + encodedParent },
    ...extra,
  }
}

export function setup(t) {
  const saved = {
    auth: admin.requireAdmin, validate: admin.validateWriteRequest, limit: admin.checkAdminRateLimit,
    token: od.getAccessToken, get: axios.get, post: axios.post, delete: axios.delete, base: site.baseDirectory,
  }
  t.after(() => {
    admin.requireAdmin = saved.auth; admin.validateWriteRequest = saved.validate
    admin.checkAdminRateLimit = saved.limit; od.getAccessToken = saved.token
    axios.get = saved.get; axios.post = saved.post; axios.delete = saved.delete
    site.baseDirectory = saved.base; cache.clearCache()
  })
  site.baseDirectory = '/Corp/Share'
  const state = {
    calls: [], rates: [], tokenCalls: 0, nodes: new Map(), transform: data => data,
  }
  for (const path of ['/', '/Corp', '/Corp/Share', '/Corp/Share/Folder']) {
    state.nodes.set(path, graphItem(path))
  }
  for (const path of ['/Corp/Share/file.txt', '/Corp/Share/.hidden', '/Corp/Share/Folder/a%20 #中.txt']) {
    state.nodes.set(path, graphItem(path, 'file', { size: 12 }))
  }
  admin.requireAdmin = async () => null
  admin.checkAdminRateLimit = async (...args) => { state.rates.push(args); return true }
  od.getAccessToken = async () => { state.tokenCalls++; return 'test-secret-token' }
  axios.get = async (url, config) => {
    const call = { method: 'get', url, config }
    state.calls.push(call)
    const endpoint = url.slice(api.driveApi.length)
    let data
    if (endpoint === '/root') data = state.nodes.get('/')
    else if (endpoint.startsWith('/root:/')) {
      const path = '/' + endpoint.slice('/root:/'.length).split('/').map(decodeURIComponent).join('/')
      data = state.nodes.get(path)
    } else if (endpoint.startsWith('/items/')) {
      const child = /^\/items\/([^/]+):\/([^/]+)$/.exec(endpoint)
      if (child) {
        const parent = [...state.nodes.entries()].find(([, item]) => item.id === decodeURIComponent(child[1]))?.[0]
        if (parent) data = state.nodes.get((parent === '/' ? '' : parent) + '/' + decodeURIComponent(child[2]))
      } else {
        data = [...state.nodes.values()].find(item => item.id === decodeURIComponent(endpoint.slice('/items/'.length)))
      }
    } else assert.fail('Unexpected Graph endpoint')
    if (!data) throw { response: { status: 404 } }
    return { status: 200, data: state.transform(structuredClone(data), call) }
  }
  axios.post = async (url, body, config) => {
    state.calls.push({ method: 'post', url, body, config })
    const parentId = decodeURIComponent(url.slice((api.driveApi + '/items/').length, -'/children'.length))
    const parent = [...state.nodes.entries()].find(([, item]) => item.id === parentId)?.[0]
    assert.ok(parent, 'creation must use a known parent ID')
    const path = (parent === '/' ? '' : parent) + '/' + body.name
    return { status: 201, data: graphItem(path, 'folder', { eTag: '"new-v1"' }) }
  }
  axios.delete = async (url, config) => {
    state.calls.push({ method: 'delete', url, config })
    return { status: 204 }
  }
  return state
}

export function request(action, body, extraHeaders = {}) {
  return new NextRequest('https://example.test/api/manage/' + action, {
    method: 'POST',
    headers: {
      'content-type': 'application/json', host: 'example.test', origin: 'https://example.test',
      'x-requested-with': 'XMLHttpRequest', ...extraHeaders,
    },
    body: JSON.stringify(body),
  })
}

export async function expectError(promise, code, status) {
  await assert.rejects(promise, error => {
    assert.ok(error instanceof mutation.MutationError)
    assert.equal(error.code, code)
    assert.equal(error.status, status)
    return true
  })
}

export async function responseError(response, code, status) {
  assert.equal(response.status, status)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await response.json(), { error: code })
}

function resolverTests() {
  test('resolver reads Graph root, all ancestors and fresh ID metadata once per resolution', async t => {
    const state = setup(t)
    const signal = new AbortController().signal
    const item = await mutation.resolveManagedItem('token', '/file.txt', itemId('/Corp/Share/file.txt'), signal)
    assert.deepEqual(item, {
      id: itemId('/Corp/Share/file.txt'), name: 'file.txt', path: '/file.txt', eTag: '"v1"', size: 12, kind: 'file',
    })
    assert.deepEqual(state.calls.map(call => call.url.slice(api.driveApi.length)), [
      '/root', '/root:/Corp', '/root:/Corp/Share', '/items/' + encodeURIComponent(item.id),
    ])
    for (const { config } of state.calls) {
      assert.equal(config.signal, signal)
      assert.equal(config.maxRedirects, 0)
      assert.equal(config.params.select, 'id,name,parentReference,folder,file,remoteItem,eTag,size,root')
      assert.equal(config.headers['Cache-Control'], 'no-cache')
    }
    await mutation.resolveManagedItem('token', '/file.txt', item.id)
    assert.equal(state.calls.length, 8, 'resolver never reuses cached metadata')
  })

  test('directory resolver accepts configured shared root and drive root as parents', async t => {
    const state = setup(t)
    assert.equal((await mutation.resolveManagedDirectory('token', '/')).id, itemId('/Corp/Share'))
    assert.equal(state.calls.length, 3)
    site.baseDirectory = '/'
    state.calls.length = 0
    assert.equal((await mutation.resolveManagedDirectory('token', '/')).id, itemId('/'))
    assert.equal(state.calls.length, 1)
  })

  test('decoded paths preserve ordinary dot names and encode literal percent/hash/unicode once', async t => {
    const state = setup(t)
    assert.equal((await mutation.resolveManagedItem('token', '/.hidden', itemId('/Corp/Share/.hidden'))).name, '.hidden')
    const path = '/Folder/a%20 #中.txt'
    const item = await mutation.resolveManagedItem('token', path, itemId('/Corp/Share' + path))
    assert.equal(item.path, path)
    state.nodes.set('/Corp/Share/100% Folder', graphItem('/Corp/Share/100% Folder'))
    await mutation.resolveManagedDirectory('token', '/100% Folder')
    assert.match(state.calls.at(-1).url, /100%25%20Folder$/)
  })

  test('traversal, malformed decoded paths, password descendants and shared-root targets stop before Graph', async t => {
    const state = setup(t)
    for (const path of ['../x', '/a/../x', '/a/./x', '/a//x', '/a/', '/a\\x', '/a\u0000x', '']) {
      await expectError(mutation.resolveManagedItem('token', path, 'id'), 'invalid_request', 400)
    }
    for (const path of ['/.password', '/A/.PASSWORD/x', '/']) {
      await expectError(mutation.resolveManagedItem('token', path, 'id'), 'protected_item', 403)
    }
    assert.equal(state.calls.length, 0)
  })

  test('dot-segment IDs and malformed UTF-16 fail before Graph URL construction', async t => {
    const state = setup(t)
    for (const id of ['.', '..', String.fromCharCode(0xd800)]) {
      await expectError(mutation.resolveManagedItem('token', '/file.txt', id), 'invalid_request', 400)
    }
    await expectError(mutation.resolveManagedDirectory('token', '/' + String.fromCharCode(0xd800)), 'invalid_request', 400)
    assert.equal(state.calls.length, 0)
  })

  test('invalid base configuration is never normalized into a writable scope', async t => {
    const state = setup(t)
    for (const base of ['/Corp/../Share', '/Corp//Share', '/Corp/.password', 'relative', '']) {
      site.baseDirectory = base
      await expectError(mutation.resolveManagedDirectory('token', '/'), 'invalid_configuration', 503)
    }
    assert.equal(state.calls.length, 0)
  })

  test('shortcuts at Graph root, above shared root, at shared root and below it are rejected', async t => {
    const state = setup(t)
    for (const path of ['/', '/Corp', '/Corp/Share', '/Corp/Share/Folder']) {
      state.nodes.get(path).remoteItem = { id: 'remote', parentReference: { driveId: 'other-drive' } }
      await expectError(mutation.resolveManagedDirectory('token', '/Folder'), 'unsupported_item', 400)
      delete state.nodes.get(path).remoteItem
    }
    state.nodes.get('/Corp/Share/file.txt').remoteItem = {}
    await expectError(mutation.resolveManagedItem('token', '/file.txt', itemId('/Corp/Share/file.txt')), 'unsupported_item', 400)
  })

  test('each ancestor binds its parent ID and drive ID, including a drives-form path', async t => {
    const state = setup(t)
    for (const path of ['/Corp', '/Corp/Share', '/Corp/Share/Folder']) {
      const node = state.nodes.get(path)
      const saved = structuredClone(node.parentReference)
      node.parentReference.id = 'forged-parent'
      await expectError(mutation.resolveManagedDirectory('token', '/Folder'), 'item_changed', 409)
      node.parentReference = { ...saved, driveId: 'other-drive' }
      await expectError(mutation.resolveManagedDirectory('token', '/Folder'), 'outside_share', 403)
      node.parentReference = { ...saved, path: saved.path.replace('/drive/root:', '/drives/other-drive/root:') }
      await expectError(mutation.resolveManagedDirectory('token', '/Folder'), 'outside_share', 403)
      node.parentReference = saved
    }
  })

  test('fresh target ID must bind expected path, shared scope, parent ID and drive ID', async t => {
    const state = setup(t)
    const original = structuredClone(state.nodes.get('/Corp/Share/file.txt'))
    const target = state.nodes.get('/Corp/Share/file.txt')
    for (const [change, code, status] of [
      [{ name: 'moved.txt' }, 'item_changed', 409],
      [{ parentReference: { ...original.parentReference, path: '/drive/root:/Other' } }, 'outside_share', 403],
      [{ parentReference: { ...original.parentReference, id: 'forged' } }, 'item_changed', 409],
      [{ parentReference: { ...original.parentReference, driveId: 'other' } }, 'outside_share', 403],
      [{ name: '.password' }, 'protected_item', 403],
    ]) {
      Object.assign(target, original, change)
      await expectError(mutation.resolveManagedItem('token', '/file.txt', original.id), code, status)
    }
    Object.assign(target, original)
    state.transform = data => data.id === original.id ? { ...data, id: 'forged-response-id' } : data
    await expectError(mutation.resolveManagedItem('token', '/file.txt', original.id), 'item_changed', 409)
    state.transform = data => data
    await expectError(mutation.resolveManagedItem('token', '/file.txt', 'missing-id'), 'item_not_found', 404)
    await expectError(mutation.resolveManagedItem('token', '/file.txt', itemId('/Corp/Share')), 'protected_item', 403)
  })

  test('missing drive IDs are tolerated, but all available IDs must agree', async t => {
    const state = setup(t)
    for (const node of state.nodes.values()) delete node.parentReference.driveId
    assert.equal((await mutation.resolveManagedDirectory('token', '/Folder')).kind, 'folder')
    state.nodes.get('/Corp').parentReference.driveId = 'available-drive'
    state.nodes.get('/Corp/Share/Folder').parentReference.driveId = 'different-drive'
    await expectError(mutation.resolveManagedDirectory('token', '/Folder'), 'outside_share', 403)
  })

  test('drive identity returned only in Graph root parent path also binds all descendants', async t => {
    const state = setup(t)
    const root = state.nodes.get('/')
    delete root.parentReference.driveId
    root.parentReference.path = '/drives/drive-one/root:'
    assert.equal((await mutation.resolveManagedDirectory('token', '/')).kind, 'folder')
    root.parentReference.path = '/drives/other-drive/root:'
    await expectError(mutation.resolveManagedDirectory('token', '/'), 'outside_share', 403)
  })

  test('malformed upstream metadata, encoded traversal and unsupported facets fail closed', async t => {
    const state = setup(t)
    const original = structuredClone(state.nodes.get('/Corp/Share/file.txt'))
    for (const [change, code] of [
      [{ eTag: undefined }, 'upstream_unavailable'], [{ eTag: 'W/"v1"' }, 'upstream_unavailable'],
      [{ eTag: '*' }, 'upstream_unavailable'], [{ eTag: '"v1", "v2"' }, 'upstream_unavailable'],
      [{ size: -1 }, 'upstream_unavailable'], [{ size: 1.5 }, 'upstream_unavailable'],
      [{ file: undefined }, 'unsupported_item'], [{ folder: {} }, 'unsupported_item'],
      [{ name: '../x' }, 'upstream_unavailable'],
      [{ parentReference: { ...original.parentReference, path: '/drive/root:/Corp/%2e%2e/Share' } }, 'upstream_unavailable'],
      [{ parentReference: { ...original.parentReference, path: '/drive/root:/Corp%2fShare' } }, 'upstream_unavailable'],
      [{ parentReference: { ...original.parentReference, path: '/drive/root:/Corp/.password' } }, 'protected_item'],
    ]) {
      state.transform = data => data.id === original.id ? { ...data, ...change } : data
      await expectError(mutation.resolveManagedItem('token', '/file.txt', original.id), code, code === 'unsupported_item' ? 400 : code === 'protected_item' ? 403 : 502)
    }
  })

  test('child resolver reads by validated parent ID and encodes a decoded name exactly once', async t => {
    const state = setup(t)
    const name = '新 #目录.txt'
    const path = '/Corp/Share/Folder/' + name
    state.nodes.set(path, graphItem(path, 'file', { size: 25 }))
    const signal = new AbortController().signal
    const item = await mutation.resolveManagedChild('token', '/Folder', name, signal)
    assert.deepEqual(item, {
      id: itemId(path), name, path: '/Folder/' + name, eTag: '"v1"', size: 25, kind: 'file',
    })
    assert.equal(state.calls.length, 5)
    const child = state.calls.at(-1)
    assert.equal(child.url, api.driveApi + '/items/' + encodeURIComponent(itemId('/Corp/Share/Folder')) + ':/' + encodeURIComponent(name))
    assert.equal(child.config.signal, signal)
    assert.equal(child.config.maxRedirects, 0)
    assert.equal(child.config.params.select, 'id,name,parentReference,folder,file,remoteItem,eTag,size,root')
    const folder = await mutation.resolveManagedChild('token', '/', 'Folder')
    assert.equal(folder.kind, 'folder')
    assert.equal(folder.path, '/Folder')
  })

  test('child resolver accepts only child GET 404 as absent and never caches safety metadata', async t => {
    const state = setup(t)
    assert.equal(await mutation.resolveManagedChild('token', '/', 'absent.txt'), null)
    assert.equal(state.calls.length, 4)
    const path = '/Corp/Share/absent.txt'
    state.nodes.set(path, graphItem(path, 'file'))
    assert.equal((await mutation.resolveManagedChild('token', '/', 'absent.txt')).id, itemId(path))
    assert.equal(state.calls.length, 8)
    state.nodes.delete('/Corp/Share')
    await expectError(mutation.resolveManagedChild('token', '/', 'absent.txt'), 'item_not_found', 404)
    assert.equal(state.calls.length, 11)
    assert.equal(state.calls.at(-1).method, 'get')
    assert.ok(state.calls.at(-1).url.endsWith('/root:/Corp/Share'))
  })

  test('child resolver rejects invalid path/name and validates all ancestors before child lookup', async t => {
    const state = setup(t)
    for (const name of ['.password', '.hidden', '..', 'a/b', 'a%20b', 'bad.', '', 123]) {
      await expectError(mutation.resolveManagedChild('token', '/', name), 'invalid_name', 400)
    }
    await expectError(mutation.resolveManagedChild('token', '/a/../b', 'file.txt'), 'invalid_request', 400)
    await expectError(mutation.resolveManagedChild('token', '/.password/child', 'file.txt'), 'protected_item', 403)
    assert.equal(state.calls.length, 0)
    for (const path of ['/', '/Corp', '/Corp/Share']) {
      state.nodes.get(path).remoteItem = {}
      await expectError(mutation.resolveManagedChild('token', '/', 'file.txt'), 'unsupported_item', 400)
      delete state.nodes.get(path).remoteItem
    }
    assert.ok(state.calls.every(call => !call.url.includes('/items/')))
  })

  test('child resolver binds name/full path, parent ID and drive ID and rejects unsafe metadata', async t => {
    const state = setup(t)
    const targetId = itemId('/Corp/Share/file.txt')
    const parentReference = state.nodes.get('/Corp/Share/file.txt').parentReference
    for (const [change, code, status] of [
      [{ name: 'other.txt' }, 'item_changed', 409],
      [{ parentReference: { ...parentReference, path: '/drive/root:/Other' } }, 'item_changed', 409],
      [{ parentReference: { ...parentReference, id: 'forged-parent' } }, 'item_changed', 409],
      [{ parentReference: { ...parentReference, driveId: 'other-drive' } }, 'outside_share', 403],
      [{ id: itemId('/') }, 'item_changed', 409],
      [{ remoteItem: {} }, 'unsupported_item', 400],
      [{ folder: {} }, 'unsupported_item', 400],
      [{ file: undefined }, 'unsupported_item', 400],
      [{ root: {} }, 'item_changed', 409],
      [{ name: '.password' }, 'protected_item', 403],
      [{ eTag: undefined }, 'upstream_unavailable', 502],
      [{ eTag: 'W/"v1"' }, 'upstream_unavailable', 502],
      [{ eTag: '*' }, 'upstream_unavailable', 502],
      [{ size: -1 }, 'upstream_unavailable', 502],
    ]) {
      state.transform = data => data.id === targetId ? { ...data, ...change } : data
      await expectError(mutation.resolveManagedChild('token', '/', 'file.txt'), code, status)
    }
  })

  test('child lookup propagates transport/upstream failures and never treats malformed responses as absent', async t => {
    setup(t)
    const get = axios.get
    for (const [failure, code, status] of [
      [new Error('private upstream URL'), 'upstream_unavailable', 502],
      [{ response: { status: 401 } }, 'upstream_unavailable', 502],
      [{ response: { status: 403 } }, 'upstream_unavailable', 502],
      [{ response: { status: 409 } }, 'conflict', 409],
      [{ response: { status: 412 } }, 'item_changed', 412],
      [{ response: { status: 429 } }, 'rate_limited', 429],
      [{ response: { status: 500 } }, 'upstream_unavailable', 502],
    ]) {
      axios.get = async (url, config) => {
        if (url.includes('/items/')) throw failure
        return get(url, config)
      }
      await expectError(mutation.resolveManagedChild('token', '/', 'file.txt'), code, status)
    }
    for (const response of [{ status: 200, data: null }, { status: 202, data: graphItem('/Corp/Share/file.txt', 'file') }]) {
      axios.get = async (url, config) => url.includes('/items/') ? response : get(url, config)
      await expectError(mutation.resolveManagedChild('token', '/', 'file.txt'), 'upstream_unavailable', 502)
    }
  })

  test('directory chains are verified in path order even when GETs finish in reverse order', async t => {
    const state = setup(t)
    const get = axios.get
    const pending = []
    axios.get = (url, config) => new Promise((resolve, reject) => {
      pending.push({ url, finish: () => get(url, config).then(resolve, reject) })
    })
    const result = mutation.resolveManagedDirectory('token', '/Folder')
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(pending.length, 4, 'all root and ancestor requests must start before any completes')
    assert.equal(state.calls.length, 0)
    // The deeper node references a forged ancestor; parallel retrieval must not skip chain validation.
    state.nodes.get('/Corp/Share/Folder').parentReference.id = 'forged-parent'
    await Promise.all(pending.toReversed().map(call => call.finish()))
    await expectError(result, 'item_changed', 409)
  })

  test('listing SELECT includes version and shortcut metadata and preserves them on returned children', async t => {
    setup(t)
    const listing = require('./driveListing.ts')
    const children = [
      { id: 'file-id', name: 'file.txt', file: {}, eTag: '"list-version"' },
      { id: 'shortcut-id', name: 'shortcut', folder: {}, remoteItem: { id: 'remote-id' } },
    ]
    axios.get = async (_url, config) => {
      assert.ok(config.params.select.split(',').includes('eTag'))
      assert.ok(config.params.select.split(',').includes('remoteItem'))
      return { status: 200, data: { value: children } }
    }
    const result = await listing.loadDrivePath('/', 'token')
    assert.deepEqual(result.folder.value, children)
  })

  test('read transport failures and non-200 responses are never accepted as metadata', async t => {
    setup(t)
    axios.get = async () => { throw new Error('test-secret-token upstream URL') }
    await expectError(mutation.resolveManagedDirectory('token', '/'), 'upstream_unavailable', 502)
    axios.get = async () => ({ status: 202, data: graphItem('/') })
    await expectError(mutation.resolveManagedDirectory('token', '/'), 'upstream_unavailable', 502)
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) resolverTests()
