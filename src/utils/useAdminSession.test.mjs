import { strict as assert } from 'node:assert'
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
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToString } from 'react-dom/server'
import * as adminErrors from './adminErrors.ts'

function setup(fetch, initialBootstrap = { status: 'anonymous', hasSessionCookie: false }) {
  const source = readFileSync(new URL('./useAdminSession.ts', import.meta.url), 'utf8')
  const compiled = compileOnce(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const observers = []
  let snapshot
  let bootstrap = initialBootstrap
  let server = false
  const react = {
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
      if (server) return getServerSnapshot()
      snapshot = getSnapshot
      subscribe(() => observers.forEach(observer => observer(getSnapshot())))
      return getSnapshot()
    },
    useEffect(effect) {
      if (!server) effect()
    },
    useMemo(factory) {
      return factory()
    },
  }
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', 'fetch', compiled)(
    name => {
      if (name === './adminErrors') return adminErrors
      if (name === '../components/AdminSessionProvider') return { useAdminSessionBootstrap: () => bootstrap }
      assert.equal(name, 'react')
      return react
    },
    loaded,
    loaded.exports,
    fetch,
  )
  return {
    useSession: loaded.exports.default,
    beginUpload: loaded.exports.beginAdminUpload,
    endUpload: loaded.exports.endAdminUpload,
    observers,
    getSnapshot: () => snapshot(),
    setBootstrap: next => {
      bootstrap = next
    },
    renderServer(next) {
      const previous = bootstrap
      bootstrap = next
      server = true
      try {
        return loaded.exports.default()
      } finally {
        bootstrap = previous
        server = false
      }
    },
  }
}

const response = (data, ok = true) => ({ ok, json: async () => data })
const tick = () => new Promise(resolve => setImmediate(resolve))

test('login synchronizes subscribers and ignores a stale initial session response', async () => {
  let resolveSession
  const store = setup(
    url =>
      url.endsWith('/session')
        ? new Promise(resolve => {
            resolveSession = resolve
          })
        : Promise.resolve(response({ authenticated: true })),
    { status: 'anonymous', hasSessionCookie: true },
  )
  const first = store.useSession()
  store.useSession()
  const observed = []
  store.observers.push(value => observed.push(value))
  await first.login('password')
  assert.deepEqual(store.getSnapshot(), { status: 'authenticated', busy: false, uploading: false })
  resolveSession(response({ initialized: true, authenticated: false }))
  await tick()
  assert.deepEqual(store.getSnapshot(), { status: 'authenticated', busy: false, uploading: false })
  assert.ok(observed.some(value => value.status === 'authenticated'))
})

test('failed operations retain the current session and release busy state', async () => {
  const store = setup(async url => {
    if (url.endsWith('/session')) return response({ initialized: true, authenticated: false })
    return response({}, false)
  })
  const session = store.useSession()
  await tick()
  await assert.rejects(session.login('wrong'))
  assert.deepEqual(store.getSnapshot(), { status: 'anonymous', busy: false, uploading: false })
  await assert.rejects(session.logout())
  assert.deepEqual(store.getSnapshot(), { status: 'anonymous', busy: false, uploading: false })
})

test('malformed successful login payloads never authenticate or leave the store busy', async () => {
  for (const body of [null, {}, [], { authenticated: 'true' }, { authenticated: false }]) {
    const store = setup(async url =>
      response(url.endsWith('/session') ? { initialized: true, authenticated: false } : body),
    )
    const session = store.useSession()
    await tick()
    await assert.rejects(session.login('password'), /Administrator login failed/)
    assert.equal(store.getSnapshot().status, 'anonymous')
    assert.equal(store.getSnapshot().busy, false)
  }
})

test('login errors retain safe server-specific messages', async () => {
  const store = setup(async url =>
    response(
      url.endsWith('/session') ? { initialized: true, authenticated: false } : { error: 'redis_not_configured' },
      url.endsWith('/session'),
    ),
  )
  const session = store.useSession()
  await tick()
  await assert.rejects(session.login('password'), /Set REDIS_URL/)
  assert.equal(store.getSnapshot().status, 'anonymous')
})

test('logout updates all subscribers without clearing directory credentials', async () => {
  const calls = []
  const store = setup(
    async (url, options) => {
      calls.push([url, options?.method])
      return response(url.endsWith('/session') ? { initialized: true, authenticated: true } : { authenticated: false })
    },
    { status: 'anonymous', hasSessionCookie: true },
  )
  const session = store.useSession()
  store.useSession()
  await tick()
  await session.logout()
  assert.deepEqual(store.getSnapshot(), { status: 'anonymous', busy: false, uploading: false })
  assert.deepEqual(
    calls.map(([url]) => url),
    ['/api/admin/session', '/api/admin/logout'],
  )
})

test('upload blocks administrator logout until completion', async () => {
  const calls = []
  const store = setup(
    async url => {
      calls.push(url)
      return response(url.endsWith('/session') ? { initialized: true, authenticated: true } : {})
    },
    { status: 'anonymous', hasSessionCookie: true },
  )
  const session = store.useSession()
  await tick()
  assert.equal(store.beginUpload(), true)
  await assert.rejects(session.logout(), /Upload in progress/)
  assert.deepEqual(calls, ['/api/admin/session'])
  store.endUpload()
  await session.logout()
  assert.equal(store.getSnapshot().status, 'anonymous')
})

test('invalid session responses expose a retryable error', async () => {
  let valid = false
  const store = setup(
    async () =>
      response(valid ? { initialized: true, authenticated: false } : { initialized: false, authenticated: true }),
    { status: 'anonymous', hasSessionCookie: true },
  )
  const session = store.useSession()
  await tick()
  assert.equal(store.getSnapshot().status, 'error')
  valid = true
  await session.refresh()
  assert.equal(store.getSnapshot().status, 'anonymous')
})

test('anonymous public mounts and later bootstrap changes make zero automatic session requests', async () => {
  const calls = []
  const store = setup(async url => {
    calls.push(url)
    return response({ initialized: true, authenticated: true })
  })
  assert.equal(store.useSession().status, 'anonymous')
  store.useSession()
  store.setBootstrap({ status: 'anonymous', hasSessionCookie: true })
  store.useSession()
  await tick()
  assert.deepEqual(calls, [])
  assert.deepEqual(store.getSnapshot(), { status: 'anonymous', busy: false, uploading: false })
  assert.equal(store.beginUpload(), false)
})

test('missing hash and invalid configuration retain their bootstrap statuses without fetching', async () => {
  for (const status of ['uninitialized', 'error']) {
    for (const hasSessionCookie of [false, true]) {
      const calls = []
      const store = setup(
        async url => {
          calls.push(url)
        },
        { status, hasSessionCookie },
      )
      assert.equal(store.useSession().status, status)
      store.useSession()
      await tick()
      assert.deepEqual(calls, [])
      assert.deepEqual(store.getSnapshot(), { status, busy: false, uploading: false })
      assert.equal(store.beginUpload(), false)
    }
  }
})

test('an existing cookie verifies exactly once across subscribers and never grants bootstrap authority', async () => {
  const calls = []
  let resolveSession
  const store = setup(
    (url, options) => {
      calls.push([url, options])
      return new Promise(resolve => {
        resolveSession = resolve
      })
    },
    { status: 'anonymous', hasSessionCookie: true },
  )
  assert.equal(store.useSession().status, 'loading')
  store.useSession()
  store.useSession()
  assert.equal(store.beginUpload(), false)
  assert.deepEqual(store.getSnapshot(), { status: 'loading', busy: false, uploading: false })
  assert.deepEqual(calls, [['/api/admin/session', { cache: 'no-store' }]])
  resolveSession(response({ initialized: true, authenticated: true }))
  await tick()
  assert.equal(store.useSession().status, 'authenticated')
  assert.equal(calls.length, 1)
})

test('expired cookies and failed verification never authenticate or automatically retry', async () => {
  for (const [result, status] of [
    [response({ initialized: true, authenticated: false }), 'anonymous'],
    [response({}, false), 'error'],
  ]) {
    let calls = 0
    const store = setup(
      async () => {
        calls++
        return result
      },
      { status: 'anonymous', hasSessionCookie: true },
    )
    store.useSession()
    await tick()
    store.useSession()
    assert.equal(store.getSnapshot().status, status)
    assert.equal(store.beginUpload(), false)
    assert.equal(calls, 1)
  }
})

test('explicit refresh remains available for every non-authenticated bootstrap status', async () => {
  for (const status of ['anonymous', 'uninitialized', 'error']) {
    const calls = []
    let initialized = false
    const store = setup(
      async url => {
        calls.push(url)
        return response({ initialized, authenticated: initialized })
      },
      { status, hasSessionCookie: false },
    )
    const session = store.useSession()
    assert.deepEqual(calls, [])
    await session.refresh()
    assert.equal(store.getSnapshot().status, 'uninitialized')
    initialized = true
    await session.refresh()
    assert.equal(store.getSnapshot().status, 'authenticated')
    assert.deepEqual(calls, ['/api/admin/session', '/api/admin/session'])
  }
})

test('server snapshots are request-specific and never initialize or reuse the shared client store', async () => {
  const calls = []
  const store = setup(async url => {
    calls.push(url)
    return response({ authenticated: true })
  })
  for (const status of ['uninitialized', 'anonymous', 'error']) {
    assert.equal(store.renderServer({ status, hasSessionCookie: false }).status, status)
  }
  assert.equal(store.renderServer({ status: 'anonymous', hasSessionCookie: true }).status, 'loading')
  assert.deepEqual(calls, [])
  const session = store.useSession()
  assert.equal(session.status, 'anonymous')
  await session.login('password')
  for (const status of ['anonymous', 'uninitialized', 'error']) {
    assert.equal(store.renderServer({ status, hasSessionCookie: false }).status, status)
  }
  assert.equal(store.renderServer({ status: 'anonymous', hasSessionCookie: true }).status, 'loading')
  assert.equal(store.useSession().status, 'authenticated')
  assert.deepEqual(calls, ['/api/admin/login'])
})

test('busy operations block concurrent login, logout, refresh and upload until completion', async () => {
  const calls = []
  let resolveLogin
  const store = setup(url => {
    calls.push(url)
    return new Promise(resolve => {
      resolveLogin = resolve
    })
  })
  const session = store.useSession()
  const login = session.login('password')
  assert.equal(store.getSnapshot().busy, true)
  await assert.rejects(session.login('again'), /Session operation in progress/)
  await assert.rejects(session.logout(), /Session operation in progress/)
  await session.refresh()
  assert.equal(store.beginUpload(), false)
  assert.deepEqual(calls, ['/api/admin/login'])
  resolveLogin(response({ authenticated: true }))
  await login
  assert.deepEqual(store.getSnapshot(), { status: 'authenticated', busy: false, uploading: false })
})

test('logout invalidates a pending explicit refresh that would restore authentication', async () => {
  let resolveSession
  const store = setup(url =>
    url.endsWith('/session')
      ? new Promise(resolve => {
          resolveSession = resolve
        })
      : Promise.resolve(response({ authenticated: true })),
  )
  const session = store.useSession()
  await session.login('password')
  const refresh = session.refresh()
  await session.logout()
  resolveSession(response({ initialized: true, authenticated: true }))
  await refresh
  assert.deepEqual(store.getSnapshot(), { status: 'anonymous', busy: false, uploading: false })
})

test('the latest explicit refresh wins when responses arrive out of order', async () => {
  const pending = []
  const store = setup(
    () =>
      new Promise(resolve => {
        pending.push(resolve)
      }),
  )
  const session = store.useSession()
  const first = session.refresh()
  const second = session.refresh()
  pending[1](response({ initialized: true, authenticated: true }))
  await second
  pending[0](response({}, false))
  await first
  assert.equal(store.getSnapshot().status, 'authenticated')
})

test('the real provider and React SSR render each request bootstrap without fetching', () => {
  function load(path, mocks) {
    const compiled = compileOnce(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: false },
    }).outputText
    const loaded = { exports: {} }
    new Function('require', 'module', 'exports', 'fetch', compiled)(
      name => {
        assert.ok(Object.hasOwn(mocks, name), name)
        return mocks[name]
      },
      loaded,
      loaded.exports,
      () => assert.fail('SSR must not fetch the administrator session'),
    )
    return loaded.exports
  }
  const provider = load('../components/AdminSessionProvider.tsx', { react: React, 'react/jsx-runtime': jsxRuntime })
  const { default: useSession } = load('./useAdminSession.ts', {
    react: React,
    '../components/AdminSessionProvider': provider,
    './adminErrors': adminErrors,
  })
  function Consumer() {
    return React.createElement('span', null, useSession().status)
  }
  for (const [bootstrap, status] of [
    [{ status: 'anonymous', hasSessionCookie: false }, 'anonymous'],
    [{ status: 'anonymous', hasSessionCookie: true }, 'loading'],
    [{ status: 'uninitialized', hasSessionCookie: false }, 'uninitialized'],
    [{ status: 'error', hasSessionCookie: true }, 'error'],
    [{ status: 'anonymous', hasSessionCookie: false }, 'anonymous'],
  ]) {
    assert.equal(
      renderToString(React.createElement(provider.default, { bootstrap }, React.createElement(Consumer))),
      `<span>${status}</span>`,
    )
  }
})

test('root layout passes only status and cookie presence to the bootstrap provider', async () => {
  const compiled = compileOnce(readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: false },
  }).outputText
  const nodes = (type, props) => ({ type, props })
  const findProvider = node => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.map(findProvider).find(Boolean)
    if (node.type === 'admin-provider') return node.props
    return findProvider(node.props?.children)
  }
  for (const hash of [undefined, 'invalid-private-hash', 'valid-private-hash']) {
    for (const hasSessionCookie of [false, true]) {
      let validations = 0
      const mocks = {
        'react/jsx-runtime': { jsx: nodes, jsxs: nodes },
        '../components/OverlayScrollbars': { default: 'overlay-scrollbars' },
        '../components/ThirdPartyScripts': { default: 'third-party-scripts' },
        'next/headers': {
          cookies: async () => ({
            has(name) {
              assert.equal(name, 'admin_session')
              return hasSessionCookie
            },
            get() {
              assert.fail('Layout must not read cookie contents')
            },
          }),
        },
        '../../config/site.config': { default: { googleFontLinks: [] } },
        '../../config/api.config': { default: {} },
        '../components/ClientConfigProvider': { ConfigProvider: 'config-provider' },
        '../components/ClientProviders': { default: 'client-providers' },
        '../components/BrandIconsProvider': { default: 'brand-icons' },
        '../lib/brandIcons': { brandIcons: {} },
        '../components/ProgressBar': { default: 'progress' },
        '../lib/i18n': { getLocale: async () => 'en', getMessages: async () => ({}) },
        '../lib/adminAuth': {
          isAdminConfigurationValid: () => {
            validations++
            return hash === 'valid-private-hash'
          },
        },
        '../components/AdminSessionProvider': { default: 'admin-provider' },
        '../styles/globals.css': {},
        '../styles/markdown-github.css': {},
      }
      const loaded = { exports: {} }
      new Function('require', 'module', 'exports', 'process', compiled)(
        name => {
          assert.ok(Object.hasOwn(mocks, name), name)
          return mocks[name]
        },
        loaded,
        loaded.exports,
        { env: { ADMIN_PASSWORD_HASH: hash, ADMIN_SESSION_SECRET: 'private-session-secret' } },
      )
      assert.equal(loaded.exports.dynamic, 'force-dynamic')
      const tree = await loaded.exports.default({ children: 'page' })
      const props = findProvider(tree)
      assert.ok(props)
      assert.deepEqual(props.bootstrap, {
        status: !hash ? 'uninitialized' : hash === 'valid-private-hash' ? 'anonymous' : 'error',
        hasSessionCookie,
      })
      assert.equal(validations, hash ? 1 : 0)
      const serialized = JSON.stringify(tree)
      for (const secret of ['invalid-private-hash', 'valid-private-hash', 'private-session-secret']) {
        assert.equal(serialized.includes(secret), false)
      }
    }
  }
})
