import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { itemPath, isPasswordFile, validProtectedRoutes } from './itemPath.ts'

const item = (parent, name = 'file.txt') => ({ name, parentReference: { path: parent } })

test('limits IDs to the configured base directory with segment boundaries', () => {
  assert.equal(itemPath(item('/drive/root:/Share/folder'), '/Share'), '/folder/file.txt')
  assert.equal(itemPath(item('/drives/123/root:/share'), '/Share'), '/file.txt')
  assert.equal(itemPath(item('/drive/root:', 'Share'), '/Share'), '/')
  assert.equal(itemPath(item('/drive/root:/Share2'), '/Share'), null)
  assert.equal(itemPath(item('/drive/root:/private'), '/Share'), null)
  assert.equal(itemPath(item('/drive/root:/private'), '/'), '/private/file.txt')
})

test('rejects unverifiable or ambiguous paths', () => {
  for (const parent of [
    '/drive/root:/Share/%2e%2e',
    '/drive/root:/Share%2Fprivate',
    '/drive/root:/Share/%',
    '/fake/root:/Share',
  ]) {
    assert.equal(itemPath(item(parent), '/Share'), null)
  }
  assert.equal(itemPath(item('/drive/root:/Share', '../secret'), '/Share'), null)
  assert.equal(itemPath({ name: 'secret' }, '/'), null)
  assert.equal(itemPath(item('/drive/root:/Share/a%20b', '100%.txt'), '/Share'), '/a b/100%.txt')
})

test('hides password files and rejects malformed route configuration', () => {
  assert.equal(isPasswordFile('/folder/.PASSWORD'), true)
  assert.equal(isPasswordFile('/folder/.password/child'), true)
  assert.equal(isPasswordFile('/folder/password'), false)
  assert.equal(validProtectedRoutes([]), true)
  assert.equal(validProtectedRoutes(['', '/secret']), true)
  assert.equal(validProtectedRoutes(['secret']), false)
  assert.equal(validProtectedRoutes(null), false)
})

test('path APIs deny password files and listing filters every page', async () => {
  const require = createRequire(import.meta.url)
  const ts = require('typescript')
  require.extensions['.ts'] = (module, filename) => {
    const source = readFileSync(filename, 'utf8')
    module._compile(
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      }).outputText,
      filename,
    )
  }
  const { NextRequest } = require('next/server')
  const configPath = require.resolve('./oauthServerConfig.ts')
  require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: { getOAuthClientSecret: () => '' } }
  const odApi = require('./odApi.ts')
  const axios = require('../utils/axiosInstance.ts').default
  const config = require('../../config/site.config.js')
  const { clearCache } = require('./cache.ts')
  const { GET: metadata } = require('../app/api/route.ts')
  const { GET: thumbnail } = require('../app/api/thumbnail/route.ts')
  const { GET: raw } = require('../app/api/raw/route.ts')
  const { GET: namedRaw } = require('../app/api/name/[name]/route.ts')
  const { getDrivePath } = require('./driveListing.ts')
  const originalToken = odApi.getAccessToken
  const originalGet = axios.get
  const originalRoutes = config.protectedRoutes
  let calls = 0

  try {
    odApi.getAccessToken = async () => 'access'
    config.protectedRoutes = ['/secret']
    axios.get = async url => {
      calls++
      if (url.includes('/children')) {
        return {
          data: {
            value: [
              { name: '.PASSWORD', file: {}, thumbnails: [{ medium: { url: 'private' } }] },
              { name: 'visible.txt', file: {}, thumbnails: [{ medium: { url: 'visible' } }] },
            ],
            '@odata.nextLink': 'https://graph.example/children?$skiptoken=next',
          },
        }
      }
      if (url === 'https://password.example') return { data: 'password' }
      if (url.includes('.password')) return { data: { '@microsoft.graph.downloadUrl': 'https://password.example' } }
      throw new Error('Unexpected Graph request: ' + url)
    }

    const crypto = require('crypto-es')
    const token = crypto.SHA256('password').toString()
    for (const path of ['/secret/.password', '/.PASSWORD', '/secret/.password/child']) {
      for (const handler of [metadata, thumbnail, raw, namedRaw]) {
        const request = new NextRequest('https://example.test/api?path=' + encodeURIComponent(path), {
          headers: { 'od-protected-token': token },
        })
        const response = await handler(request)
        assert.equal(response.status, 404, path)
      }
    }
    for (const suffix of ['&raw=true', '']) {
      const response = await metadata(new NextRequest('https://example.test/api?path=%2Fsecret%2F%2Epassword' + suffix))
      assert.equal(response.status, 404)
    }
    assert.equal(calls, 0)
    assert.deepEqual(await odApi.checkAuthRoute('/secret/file', 'access', token), {
      code: 200,
      message: 'Authenticated.',
    })

    for (const next of ['', 'next']) {
      const result = await getDrivePath('/', 'access', { next, thumbnails: 'medium' })
      assert.deepEqual(result.folder.value, [{ name: 'visible.txt', file: {}, thumbnailUrl: 'visible' }])
      assert.equal(result.next, 'next')
    }
  } finally {
    odApi.getAccessToken = originalToken
    axios.get = originalGet
    config.protectedRoutes = originalRoutes
    clearCache()
    delete require.extensions['.ts']
  }
})
