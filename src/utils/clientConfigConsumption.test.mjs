import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function load(name, mocks = {}) {
  const source = readFileSync(new URL(name, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(
    id => {
      if (Object.hasOwn(mocks, id)) return mocks[id]
      if (id.startsWith('./')) return load(id + '.ts', mocks)
      return require(id)
    },
    loaded,
    loaded.exports,
  )
  return loaded.exports
}

test('protected paths and stored credentials use the supplied routes', () => {
  const { matchProtectedRoute, getStoredToken, setStoredToken } = load('./protectedRouteHandler.ts')
  const data = new Map()
  const previousWindow = globalThis.window
  const previousStorage = globalThis.localStorage
  globalThis.window = {}
  globalThis.localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  }
  try {
    assert.equal(matchProtectedRoute('/other/file', ['/private']), '')
    assert.equal(matchProtectedRoute('/private/sub/file', ['/private', '/private/sub']), '/private/sub')
    setStoredToken('/private/file', 'password', ['/private'])
    assert.ok(getStoredToken('/private/file', ['/private']))
    assert.equal(getStoredToken('/private/file', ['/other']), null)
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    if (previousStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousStorage
  }
})

test('date and OAuth helpers use supplied runtime values', async () => {
  const calls = []
  const axios = { get: async url => { calls.push(url); return { data: { id: 1 }, status: 200 } } }
  const { formatModifiedDateTime } = load('./fileDetails.ts')
  const { generateAuthorisationUrl, extractAuthCodeFromRedirected, getAuthPersonInfo } = load('./oAuthHandler.ts', {
    axios,
  })
  assert.equal(formatModifiedDateTime('2024-02-03', 'YYYY/MM/DD'), '2024/02/03')
  assert.equal(formatModifiedDateTime('2024-02-03', 'MM'), '02')
  const url = new URL(generateAuthorisationUrl({
    clientId: 'runtime-id',
    redirectUri: 'http://runtime.local',
    authApi: 'https://example.com/token',
    scope: 'scope-a',
  }))
  assert.equal(url.toString().startsWith('https://example.com/authorize?'), true)
  assert.equal(url.searchParams.get('client_id'), 'runtime-id')
  assert.equal(extractAuthCodeFromRedirected('http://runtime.local/?code=abc', 'http://runtime.local'), 'abc')
  assert.equal(extractAuthCodeFromRedirected('http://runtime.local/?code=abc', 'http://other.local'), '')
  await getAuthPersonInfo('access', 'https://example.com/me/drive')
  assert.deepEqual(calls, ['https://example.com/me'])
})
