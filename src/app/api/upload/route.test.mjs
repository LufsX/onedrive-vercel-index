import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename,
)
const { NextRequest, NextResponse } = require('next/server')
const admin = require('../../../lib/adminAuth.ts')
const oauthConfigPath = require.resolve('../../../lib/oauthServerConfig.ts')
require.cache[oauthConfigPath] = { id: oauthConfigPath, filename: oauthConfigPath, loaded: true, exports: { getOAuthClientSecret: () => '' } }
const od = require('../../../lib/odApi.ts')
const cache = require('../../../lib/cache.ts')
const axios = require('../../../utils/axiosInstance.ts').default
const guard = require('../../../lib/pathGuard.ts')
const site = require('../../../../config/site.config.js')
const { POST } = require('./session/route.ts')
const complete = require('./complete/route.ts').POST

const makeRequest = (body = { path: '/', name: 'file.txt', size: 10 }) =>
  new NextRequest('https://example.test/api/upload/session', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })

function setup(t) {
  const saved = { auth: admin.requireAdmin, validate: admin.validateWriteRequest, limit: admin.checkAdminRateLimit,
    token: od.getAccessToken, get: axios.get, post: axios.post, put: axios.put, base: site.baseDirectory, limitEnv: process.env.UPLOAD_MAX_BYTES }
  t.after(() => {
    admin.requireAdmin = saved.auth; admin.validateWriteRequest = saved.validate; admin.checkAdminRateLimit = saved.limit
    od.getAccessToken = saved.token; axios.get = saved.get; axios.post = saved.post; axios.put = saved.put
    site.baseDirectory = saved.base
    if (saved.limitEnv === undefined) delete process.env.UPLOAD_MAX_BYTES
    else process.env.UPLOAD_MAX_BYTES = saved.limitEnv
    cache.clearCache()
  })
  site.baseDirectory = '/Share'
  delete process.env.UPLOAD_MAX_BYTES
  admin.requireAdmin = async () => null
  admin.validateWriteRequest = () => null
  admin.checkAdminRateLimit = async () => true
  od.getAccessToken = async () => 'secret-token'
  const calls = []
  axios.get = async (url, config) => {
    calls.push({ method: 'get', url, config })
    const isRoot = url.endsWith('/root' + od.encodePath('/'))
    return { data: isRoot
      ? { id: 'root-id', name: 'Share', parentReference: { path: '/drive/root:' }, folder: {} }
      : { id: 'child-id', name: 'Folder', parentReference: { path: '/drive/root:/Share' }, folder: {} } }
  }
  axios.post = async (url, body, config) => {
    calls.push({ method: 'post', url, body, config })
    return { data: { uploadUrl: 'https://abc.up.1drv.com/upload?token=private', expirationDateTime: '2099-01-01T00:00:00Z' } }
  }
  axios.put = async (url, body, config) => {
    calls.push({ method: 'put', url, body, config })
    return { status: 201, data: { id: 'new', size: 0 } }
  }
  return calls
}

test('paths, hidden names and ambiguous encodings fail closed', () => {
  for (const path of ['/..', '/a/../b', '/a//b', '/a/', '/.PASSWORD', '/a/%2e%2e', '/a\\b', 'relative']) {
    assert.equal(guard.uploadDirectory(path), null, path)
  }
  for (const name of ['.password', '.Password', '.DS_Store', 'Desktop.ini', 'THUMBS.DB', '$Recycle.Bin', '.', '..', 'a/b', 'a\\b', 'bad.', 'bad ', 'a%2f']) {
    assert.equal(guard.validUploadName(name), false, name)
  }
  assert.equal(guard.uploadDirectory('/Folder'), '/Folder')
  assert.equal(guard.validUploadName('中文 #1.txt'), true)
})

test('upload URL rejects untrusted hosts, credentials, insecure protocols and ports', () => {
  for (const url of ['http://abc.up.1drv.com/a', 'https://abc.up.1drv.com.evil.test/a',
    'https://sharepoint.com.evil.test', 'https://abc.sharepoint.com@evil.test', 'https://abc.1drv.com:444/a',
    'https://127.0.0.1/a', 'https://abc.1drv.com/a#secret',
    'https://my.microsoftpersonalcontent.com.evil.test/a', 'https://evil.microsoftpersonalcontent.com/a']) assert.equal(guard.validUploadUrl(url), false, url)
  for (const url of ['https://abc.up.1drv.com/a?x=1', 'https://tenant.sharepoint.com/a',
    'https://tenant.sharepoint.cn/a', 'https://my.microsoftpersonalcontent.com/a']) assert.equal(guard.validUploadUrl(url), true, url)
})

test('session creation checks scope and binds encoded file to validated parent id', async t => {
  const calls = setup(t)
  const response = await POST(makeRequest({ path: '/Folder', name: '中文 #.txt', size: 1 }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await response.json(), { uploadUrl: 'https://abc.up.1drv.com/upload?token=private', expirationDateTime: '2099-01-01T00:00:00Z' })
  assert.equal(calls.length, 3)
  assert.match(calls[2].url, /\/items\/child-id:\/%E4%B8%AD%E6%96%87%20%23.txt:\/createUploadSession$/)
  assert.equal(calls[2].body.item['@microsoft.graph.conflictBehavior'], 'rename')
  assert.equal(calls[2].config.headers.Authorization, 'Bearer secret-token')
  assert.equal(calls[2].config.maxRedirects, 0)
})

test('rejects directories outside the shared root and shortcuts before session creation', async t => {
  const calls = setup(t)
  for (const data of [
    { id: 'x', name: 'Share', parentReference: { path: '/drive/root:/Other' }, folder: {} },
    { id: 'x', name: 'Share', parentReference: { path: '/drive/root:' }, folder: {}, remoteItem: {} },
    { id: 'x', name: 'Share', parentReference: { path: '/drive/root:' }, file: {} },
  ]) {
    axios.get = async () => ({ data })
    assert.equal((await POST(makeRequest())).status, 400)
  }
  assert.equal(calls.length, 0)
})

test('empty files use conditional content PUT and invalidate even on ambiguous failure', async t => {
  const calls = setup(t)
  cache.rememberKind('/old', 'file', 30000)
  const response = await POST(makeRequest({ path: '/', name: 'empty.txt', size: 0 }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { completed: true })
  assert.equal(calls.at(-1).method, 'put')
  assert.equal(calls.at(-1).config.headers['If-Match'], '"0"')
  assert.equal(calls.at(-1).body.length, 0)
  assert.equal(cache.knownKind('/old'), undefined)
  cache.rememberKind('/old', 'file', 30000)
  axios.put = async () => { throw new Error('lost response') }
  assert.equal((await POST(makeRequest({ path: '/', name: 'empty.txt', size: 0 }))).status, 502)
  assert.equal(cache.knownKind('/old'), undefined)
})

test('invalid sizes, oversized body and hidden files fail before Graph', async t => {
  const calls = setup(t)
  for (const input of [
    { path: '/', name: '.PASSWORD', size: 0 }, { path: '/', name: '.hidden', size: 1 },
    { path: '/', name: 'x', size: -1 }, { path: '/', name: 'x', size: 1.5 },
    { path: '/', name: 'x', size: 250 * 1024 ** 3 + 1 }, { path: '/', name: 'x'.repeat(9000), size: 1 },
  ]) assert.equal((await POST(makeRequest(input))).status, 400)
  assert.equal(calls.length, 0)
})

test('configured upload limit is enforced and malformed configuration fails closed', async t => {
  const calls = setup(t)
  process.env.UPLOAD_MAX_BYTES = '5'
  assert.equal((await POST(makeRequest({ path: '/', name: 'x', size: 6 }))).status, 400)
  assert.equal((await POST(makeRequest({ path: '/', name: 'x', size: 5 }))).status, 200)
  for (const value of ['', '0', '-1', '1e3', ' 5', '999999999999999999999']) {
    process.env.UPLOAD_MAX_BYTES = value
    assert.equal((await POST(makeRequest())).status, 503, value)
  }
  assert.equal(calls.filter(call => call.method === 'post').length, 1)
})

test('conflict behavior supports fail and rename for sessions and empty files', async t => {
  const calls = setup(t)
  assert.equal((await POST(makeRequest({ path: '/', name: 'x', size: 1, conflictBehavior: 'fail' }))).status, 200)
  assert.equal(calls.at(-1).body.item['@microsoft.graph.conflictBehavior'], 'fail')
  assert.equal((await POST(makeRequest({ path: '/', name: 'x', size: 1, conflictBehavior: 'replace' }))).status, 400)

  const attempted = []
  axios.put = async (url, body, config) => {
    attempted.push({ url, config })
    if (attempted.length === 1) throw { response: { status: 412 } }
    return { status: 201, data: { id: 'new', size: 0 } }
  }
  assert.equal((await POST(makeRequest({ path: '/', name: 'x.txt', size: 0 }))).status, 200)
  assert.equal(attempted.length, 2)
  assert.match(attempted[1].url, /x%20\(1\).txt:\/content$/)
  assert.equal(attempted[1].config.headers['If-Match'], '"0"')
  attempted.length = 0
  assert.equal((await POST(makeRequest({ path: '/', name: 'x.txt', size: 0, conflictBehavior: 'fail' }))).status, 409)
  assert.equal(attempted.length, 1)
})

test('auth and rate failures stop Graph; upstream errors never leak secrets', async t => {
  const calls = setup(t)
  admin.validateWriteRequest = () => NextResponse.json({ error: 'csrf' }, { status: 403 })
  assert.equal((await POST(makeRequest())).status, 403)
  admin.validateWriteRequest = () => null
  admin.requireAdmin = async () => NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  assert.equal((await POST(makeRequest())).status, 401)
  admin.requireAdmin = async () => null
  admin.checkAdminRateLimit = async () => false
  assert.equal((await POST(makeRequest())).status, 429)
  admin.checkAdminRateLimit = async () => { throw new Error('redis secret') }
  assert.equal((await POST(makeRequest())).status, 503)
  assert.equal(calls.length, 0)
  admin.checkAdminRateLimit = async () => true
  axios.post = async () => { throw { response: { status: 500, data: 'secret-token' } } }
  const response = await POST(makeRequest())
  assert.equal(response.status, 502)
  assert.ok(!(await response.text()).includes('secret-token'))
  axios.post = async () => ({ data: { uploadUrl: 'https://evil.test/?secret=token', expirationDateTime: '2099-01-01' } })
  const invalid = await POST(makeRequest())
  assert.equal(invalid.status, 502)
  assert.ok(!(await invalid.text()).includes('secret=token'))
})

test('directory requests bypass the process cache and disable CDN caching during concurrent reads', async t => {
  setup(t)
  const listing = require('../../../lib/driveListing.ts')
  const previous = listing.getDrivePath
  const previousCheck = od.checkAuthRoute
  t.after(() => { listing.getDrivePath = previous; od.checkAuthRoute = previousCheck })
  od.checkAuthRoute = async () => ({ code: 200, message: '' })
  let release
  const old = new Promise(resolve => { release = resolve })
  let count = 0
  listing.getDrivePath = async (path, token, options, cacheable) => {
    assert.equal(cacheable, false)
    count++
    return count === 1 ? old : { folder: { value: [{ name: 'new.txt' }] } }
  }
  const { GET } = require('../route.ts')
  const request = () => new NextRequest('https://example.test/api?path=%2F')
  const pending = GET(request())
  await new Promise(resolve => setImmediate(resolve))
  const fresh = await GET(request())
  assert.equal(fresh.headers.get('cache-control'), 'private, no-store')
  assert.equal((await fresh.json()).folder.value[0].name, 'new.txt')
  release({ folder: { value: [] } })
  assert.equal((await pending).headers.get('cache-control'), 'private, no-store')
  assert.equal((await (await GET(request())).json()).folder.value[0].name, 'new.txt')
  assert.equal(count, 3)
})

test('raw download redirects and thumbnails fetch fresh targets without process or CDN caches', async t => {
  setup(t)
  const previousCheck = od.checkAuthRoute
  t.after(() => { od.checkAuthRoute = previousCheck })
  od.checkAuthRoute = async () => ({ code: 200, message: '' })
  const raw = require('../../../lib/rawFileHandler.ts').handleRawFile
  const thumbnail = require('../thumbnail/route.ts').GET
  let rawReads = 0, thumbnailReads = 0
  axios.get = async url => {
    if (url.endsWith('/thumbnails')) {
      thumbnailReads++
      return { data: { value: [{ medium: { url: 'https://example.test/thumbnail-' + thumbnailReads } }] } }
    }
    rawReads++
    return { data: { id: 'photo', size: 10, '@microsoft.graph.downloadUrl': 'https://example.test/file-' + rawReads } }
  }
  for (let version = 1; version <= 2; version++) {
    const download = await raw(new NextRequest('https://example.test/api/raw?path=%2Fphoto.jpg'))
    assert.equal(download.headers.get('cache-control'), 'private, no-store')
    assert.equal(download.headers.get('location'), 'https://example.test/file-' + version)
    const preview = await thumbnail(new NextRequest('https://example.test/api/thumbnail?path=%2Fphoto.jpg'))
    assert.equal(preview.headers.get('cache-control'), 'private, no-store')
    assert.equal(preview.headers.get('location'), 'https://example.test/thumbnail-' + version)
  }
  assert.equal(rawReads, 2)
  assert.equal(thumbnailReads, 2)
  od.checkAuthRoute = async () => ({ code: 403, message: 'Password required.' })
  assert.equal((await raw(new NextRequest('https://example.test/api/raw?path=%2Fphoto.jpg'))).status, 403)
  assert.equal((await thumbnail(new NextRequest('https://example.test/api/thumbnail?path=%2Fphoto.jpg'))).status, 403)
  assert.equal(rawReads, 2)
  assert.equal(thumbnailReads, 2)
})

test('completion authorization precedes cache clearing', async t => {
  setup(t)
  cache.rememberKind('/old', 'file', 30000)
  admin.requireAdmin = async () => NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  assert.equal((await complete(makeRequest())).status, 401)
  assert.equal(cache.knownKind('/old'), 'file')
  admin.requireAdmin = async () => null
  assert.equal((await complete(makeRequest())).status, 200)
  assert.equal(cache.knownKind('/old'), undefined)
})
