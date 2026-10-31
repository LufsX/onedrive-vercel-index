import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

function setup(fetch) {
  const source = readFileSync(new URL('./useAdminSession.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const observers = []
  let snapshot
  const react = {
    useSyncExternalStore(subscribe, getSnapshot) {
      snapshot = getSnapshot
      subscribe(() => observers.forEach(observer => observer(getSnapshot())))
      return getSnapshot()
    },
    useEffect(effect) { effect() },
  }
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', 'fetch', compiled)(
    name => {
      assert.equal(name, 'react')
      return react
    },
    loaded,
    loaded.exports,
    fetch,
  )
  return { useSession: loaded.exports.default, beginUpload: loaded.exports.beginAdminUpload, endUpload: loaded.exports.endAdminUpload, observers, getSnapshot: () => snapshot() }
}

const response = (data, ok = true) => ({ ok, json: async () => data })
const tick = () => new Promise(resolve => setImmediate(resolve))

test('login synchronizes subscribers and ignores a stale initial session response', async () => {
  let resolveSession
  const store = setup(url => url.endsWith('/session')
    ? new Promise(resolve => { resolveSession = resolve })
    : Promise.resolve(response({ authenticated: true })))
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

test('logout updates all subscribers without clearing directory credentials', async () => {
  const calls = []
  const store = setup(async (url, options) => {
    calls.push([url, options?.method])
    return response(url.endsWith('/session') ? { initialized: true, authenticated: true } : { authenticated: false })
  })
  const session = store.useSession()
  store.useSession()
  await tick()
  await session.logout()
  assert.deepEqual(store.getSnapshot(), { status: 'anonymous', busy: false, uploading: false })
  assert.deepEqual(calls.map(([url]) => url), ['/api/admin/session', '/api/admin/logout'])
})

test('upload blocks administrator logout until completion', async () => {
  const calls = []
  const store = setup(async url => {
    calls.push(url)
    return response(url.endsWith('/session') ? { initialized: true, authenticated: true } : {})
  })
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
  const store = setup(async () => response(valid
    ? { initialized: true, authenticated: false }
    : { initialized: false, authenticated: true }))
  const session = store.useSession()
  await tick()
  assert.equal(store.getSnapshot().status, 'error')
  valid = true
  await session.refresh()
  assert.equal(store.getSnapshot().status, 'anonymous')
})
