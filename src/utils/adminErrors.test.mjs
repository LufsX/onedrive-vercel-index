import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

// Transpiling dominates fixture setup, so compile each source once per test file.
const transpileCache = new Map()
function compileOnce(source, config) {
  const key = JSON.stringify(config ?? {}) + '\u0000' + source
  let output = transpileCache.get(key)
  if (output === undefined) {
    output = ts.transpileModule(source, config).outputText
    transpileCache.set(key, output)
  }
  return { outputText: output }
}

function load(path, mocks = {}, fetch) {
  const code = compileOnce(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', 'fetch', code)(
    name => {
      assert.ok(Object.hasOwn(mocks, name), name)
      return mocks[name]
    },
    loaded,
    loaded.exports,
    fetch,
  )
  return loaded.exports
}

const helpers = load('./adminErrors.ts')
const { readAdminError, getAdminErrorMessage } = helpers
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
const mappings = [
  [401, 'invalid_credentials', 'Incorrect administrator password.'],
  [403, 'invalid_origin', 'Administrator requests must come from the same origin.'],
  [403, 'https_required', 'Administrator login requires HTTPS.'],
  [403, 'invalid_request', 'Administrator request was rejected. Reload this page and try again.'],
  [429, 'rate_limited', 'Too many requests. Try again later.'],
  [503, 'redis_not_configured', 'Redis is not configured. Set REDIS_URL and redeploy.'],
  [503, 'redis_invalid_url', 'Redis URL configuration is invalid. Check REDIS_URL and redeploy.'],
  [503, 'redis_unavailable', 'Redis is unavailable. Try again later.'],
  [503, 'auth_unavailable', 'Administrator authentication is unavailable. Try again later.'],
  [
    503,
    'invalid_admin_configuration',
    'Administrator password configuration is invalid. Generate a new configuration and redeploy.',
  ],
  [503, 'admin_not_configured', 'Administrator password is not configured. Generate a configuration and redeploy.'],
]

test('administrator error codes map to distinct translation keys, never arbitrary backend messages', async () => {
  for (const [status, code, message] of mappings) {
    for (const field of ['error', 'code']) {
      const response = json({ [field]: code, message: 'private upstream URL and credentials' }, status)
      assert.equal(await readAdminError(response), message)
    }
    assert.equal(getAdminErrorMessage(new Error(message)), message)
  }
  assert.equal(new Set(mappings.map(([, , message]) => message)).size, mappings.length)
})

test('unknown codes, arbitrary messages and non-object JSON return only the trusted fallback', async () => {
  for (const data of [
    null,
    false,
    3,
    'private upstream text',
    [],
    ['invalid_credentials'],
    { error: 'private upstream text' },
    { error: '__proto__' },
    { error: 'constructor' },
    { error: { message: 'private upstream text' } },
    { error: ['invalid_credentials'] },
    { message: 'Incorrect administrator password.' },
    { message: 'private upstream text' },
  ]) {
    assert.equal(await readAdminError(json(data, 400)), 'Administrator login failed.')
    assert.equal(await readAdminError(json(data, 400), 'Trusted setup fallback.'), 'Trusted setup fallback.')
  }
  const inherited = { status: 400, json: async () => Object.create({ error: 'invalid_credentials' }) }
  assert.equal(await readAdminError(inherited), 'Administrator login failed.')
})

test('unreadable responses use safe status fallbacks or the caller fallback', async () => {
  for (const status of [401, 403, 429, 503, 500]) {
    for (const body of ['', '<html>private upstream URL</html>', '{']) {
      const expected = status === 429 ? mappings[4][2] : status === 503 ? mappings[8][2] : 'Trusted fallback.'
      assert.equal(await readAdminError(new Response(body, { status }), 'Trusted fallback.'), expected)
    }
  }
  assert.equal(
    await readAdminError({
      status: 400,
      json: async () => {
        throw new Error('private upstream URL')
      },
    }),
    'Administrator login failed.',
  )
  const consumed = json({ error: 'invalid_credentials' }, 401)
  await consumed.text()
  assert.equal(await readAdminError(consumed), 'Administrator login failed.')
})

test('caught failures expose only whitelisted messages or the caller fallback', () => {
  for (const [, , message] of mappings) {
    assert.equal(getAdminErrorMessage(message), message)
    assert.equal(getAdminErrorMessage({ message }), message)
  }
  const unreadable = {
    get message() {
      throw new Error('private detail')
    },
  }
  for (const failure of [
    undefined,
    null,
    false,
    7,
    {},
    unreadable,
    new Error('redis://user:secret@private.example'),
    { code: 'invalid_credentials' },
    { message: 'invalid_credentials' },
    'invalid_credentials',
    { message: '<script>private detail</script>' },
    new Proxy(
      {},
      {
        has() {
          throw new Error('private detail')
        },
      },
    ),
  ]) {
    assert.equal(getAdminErrorMessage(failure), 'Administrator login failed.')
    assert.equal(getAdminErrorMessage(failure, 'Trusted setup fallback.'), 'Trusted setup fallback.')
  }
})

function sessionFixture(loginResponse) {
  let snapshot
  const observers = []
  const requests = []
  const react = {
    useSyncExternalStore(subscribe, getSnapshot) {
      snapshot = getSnapshot
      subscribe(() => observers.push(getSnapshot()))
      return getSnapshot()
    },
    useEffect: effect => effect(),
    useMemo: factory => factory(),
  }
  const api = load(
    './useAdminSession.ts',
    {
      react,
      './adminErrors': helpers,
      '../components/AdminSessionProvider': {
        useAdminSessionBootstrap: () => ({ status: 'anonymous', hasSessionCookie: false }),
      },
    },
    async (url, options) => {
      requests.push([url, options])
      assert.equal(url, '/api/admin/login')
      return loginResponse()
    },
  )
  const session = api.default()
  return { session, requests, observers, snapshot: () => snapshot() }
}

test('login preserves mapped API errors and never authenticates on failure', async () => {
  for (const [status, code, message] of mappings) {
    const f = sessionFixture(() => json({ error: code, message: 'private detail' }, status))
    await assert.rejects(f.session.login('incorrect'), { message })
    assert.equal(f.snapshot().busy, false)
    assert.equal(f.snapshot().status, 'anonymous')
    assert.ok(f.observers.every(value => value.status !== 'authenticated'))
  }
})

test('login requires an object with authenticated strictly equal to true', async () => {
  for (const data of [
    null,
    false,
    true,
    1,
    'authenticated',
    [],
    {},
    { authenticated: false },
    { authenticated: 'true' },
    { authenticated: 1 },
    { initialized: true },
    { error: 'invalid_credentials' },
  ]) {
    const f = sessionFixture(() => json(data))
    await assert.rejects(f.session.login('password'), { message: 'Administrator login failed.' })
    assert.equal(f.snapshot().busy, false)
    assert.ok(f.observers.every(value => value.status !== 'authenticated'))
  }
  for (const status of [200, 204]) {
    const f = sessionFixture(() => new Response(status === 204 ? null : 'not JSON', { status }))
    await assert.rejects(f.session.login('password'), { message: 'Administrator login failed.' })
    assert.equal(f.snapshot().busy, false)
    assert.notEqual(f.snapshot().status, 'authenticated')
  }
})

test('only an explicitly authenticated login succeeds and retains the existing request settings', async () => {
  const f = sessionFixture(() => json({ authenticated: true }))
  await f.session.login('password')
  assert.deepEqual(f.snapshot(), { status: 'authenticated', busy: false, uploading: false })
  const [[url, options]] = f.requests
  assert.equal(url, '/api/admin/login')
  assert.equal(options.method, 'POST')
  assert.equal(options.headers['X-Requested-With'], 'XMLHttpRequest')
  assert.equal(options.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(options.body), { password: 'password' })
})
