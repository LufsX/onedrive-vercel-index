import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

function load(name, mocks = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(name, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(id => {
    assert.ok(Object.hasOwn(mocks, id), 'Unexpected import ' + id)
    return mocks[id]
  }, loaded, loaded.exports)
  return loaded.exports
}
const management = load('./driveManagement.ts')
const { ManagementError } = management
const { MAX_REPLACEMENT_BYTES, replaceManagedFile } = load('./replaceManagedFile.ts', {
  './driveManagement': management,
})
const item = { id: 'id/+?中', name: 'old.txt', path: '/sub/a%20 +#中.txt', eTag: '"v1"', size: 9000000, kind: 'file' }
const file = size => new File([new Uint8Array(size)], 'replacement.bin', { type: 'text/plain' })
const matches = code => error => error instanceof ManagementError && error.code === code

class TrackedTarget extends EventTarget {
  listeners = new Map()
  addEventListener(type, listener, options) {
    super.addEventListener(type, listener, options)
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(listener)
  }
  removeEventListener(type, listener, options) {
    super.removeEventListener(type, listener, options)
    this.listeners.get(type)?.delete(listener)
  }
  get listenerCount() { return [...this.listeners.values()].reduce((n, set) => n + set.size, 0) }
}

function setup(t, failure) {
  const instances = []
  const previous = globalThis.XMLHttpRequest
  class XHR extends TrackedTarget {
    upload = new TrackedTarget()
    headers = {}
    withCredentials = false
    sends = 0
    aborts = 0
    constructor() {
      super()
      if (failure === 'constructor') throw new Error('constructor')
      instances.push(this)
    }
    open(method, url) {
      this.method = method; this.url = url
      if (failure === 'open') throw new Error('open')
    }
    setRequestHeader(name, value) {
      this.headers[name] = value
      if (failure === 'header') throw new Error('header')
    }
    send(body) {
      this.body = body; this.sends++
      if (failure === 'send') throw new Error('send')
    }
    abort() {
      this.aborts++
      if (failure === 'abort') throw new Error('abort')
      this.dispatchEvent(new Event('abort'))
    }
    respond(status, data) {
      this.status = status
      this.responseText = typeof data === 'string' ? data : JSON.stringify(data)
      this.dispatchEvent(new Event('load'))
    }
    progress(loaded) {
      const event = new Event('progress')
      Object.defineProperty(event, 'loaded', { value: loaded })
      this.upload.dispatchEvent(event)
    }
  }
  globalThis.XMLHttpRequest = XHR
  t.after(() => {
    if (previous === undefined) delete globalThis.XMLHttpRequest
    else globalThis.XMLHttpRequest = previous
  })
  const controller = new AbortController()
  let signalListeners = 0
  const add = controller.signal.addEventListener.bind(controller.signal)
  const remove = controller.signal.removeEventListener.bind(controller.signal)
  controller.signal.addEventListener = (...args) => { signalListeners++; add(...args) }
  controller.signal.removeEventListener = (...args) => { signalListeners--; remove(...args) }
  const progress = []
  const start = (size = 3, target = item) => replaceManagedFile(
    target, file(size), controller.signal, (...args) => progress.push(args),
  )
  const clean = xhr => {
    assert.equal(xhr.listenerCount, 0)
    assert.equal(xhr.upload.listenerCount, 0)
    assert.equal(signalListeners, 0)
  }
  return { instances, controller, progress, start, clean }
}
const success = size => ({ item: { ...item, size, eTag: '"v2"' } })

test('uses one same-origin raw PUT with encoded path, confirmed ETag and real upload progress', async t => {
  const state = setup(t)
  const pending = state.start()
  const [xhr] = state.instances
  assert.equal(xhr.method, 'PUT')
  const url = new URL(xhr.url, 'https://example.test')
  assert.equal(url.origin, 'https://example.test')
  assert.equal(url.pathname, '/api/manage/replace')
  assert.equal(url.searchParams.get('path'), item.path)
  assert.equal(url.searchParams.get('id'), item.id)
  assert.deepEqual(xhr.headers, {
    'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/octet-stream',
    'If-Match': item.eTag, 'X-File-Size': '3',
  })
  assert.ok(xhr.body instanceof File)
  assert.equal(xhr.body.name, 'replacement.bin')
  assert.equal(xhr.withCredentials, false)
  let settled = false
  void pending.then(() => { settled = true })
  xhr.progress(1)
  xhr.progress(3)
  xhr.upload.dispatchEvent(new Event('load'))
  await Promise.resolve()
  assert.equal(settled, false)
  assert.deepEqual(state.progress, [[1, 3], [3, 3]])
  xhr.respond(200, success(3))
  assert.deepEqual(await pending, success(3).item)
  assert.deepEqual(state.progress, [[1, 3], [3, 3]])
  state.clean(xhr)
  state.controller.abort()
  assert.equal(xhr.aborts, 0)
  assert.equal(xhr.sends, 1)
})

test('accepts zero and exactly 4 MiB irrespective of the original file size', async t => {
  const state = setup(t)
  assert.equal(MAX_REPLACEMENT_BYTES, 4 * 1024 * 1024)
  for (const size of [0, MAX_REPLACEMENT_BYTES]) {
    const pending = state.start(size)
    const xhr = state.instances.at(-1)
    assert.equal(xhr.body.size, size)
    xhr.respond(200, success(size))
    assert.equal((await pending).size, size)
    state.clean(xhr)
  }
  await assert.rejects(state.start(MAX_REPLACEMENT_BYTES + 1), matches('file_too_large'))
  assert.equal(state.instances.length, 2)
})

test('rejects unsupported items and unsafe ETags before constructing XHR', async t => {
  const state = setup(t)
  await assert.rejects(state.start(1, { ...item, kind: 'folder' }), matches('unsupported_item'))
  for (const eTag of ['', '*', 'W/"v1"', '"v1", "v2"', '"x\r\ny"', '"x\u0000y"', '"x\u007fy"']) {
    await assert.rejects(state.start(1, { ...item, eTag }), matches('invalid_request'))
  }
  assert.equal(state.instances.length, 0)
})

test('preserves known HTTP error codes, including 412, without retrying', async t => {
  const state = setup(t)
  for (const [status, code] of [
    [401, 'unauthorized'], [403, 'invalid_request'], [412, 'item_changed'], [413, 'file_too_large'],
    [429, 'rate_limited'], [502, 'write_uncertain'],
  ]) {
    const pending = state.start()
    const xhr = state.instances.at(-1)
    xhr.respond(status, { error: code })
    await assert.rejects(pending, matches(code))
    assert.equal(xhr.sends, 1)
    state.clean(xhr)
  }
})

test('treats network, timeout and abort as uncertain and removes all listeners', async t => {
  const state = setup(t)
  for (const event of ['error', 'timeout', 'abort']) {
    const pending = state.start()
    const xhr = state.instances.at(-1)
    xhr.dispatchEvent(new Event(event))
    await assert.rejects(pending, matches('write_uncertain'))
    assert.equal(xhr.sends, 1)
    state.clean(xhr)
  }
  const pending = state.start()
  const xhr = state.instances.at(-1)
  state.controller.abort()
  await assert.rejects(pending, matches('write_uncertain'))
  assert.equal(xhr.aborts, 1)
  state.clean(xhr)
  const count = state.instances.length
  await assert.rejects(state.start(), matches('write_uncertain'))
  assert.equal(state.instances.length, count)
})

test('maps constructor exceptions to ManagementError', async t => {
  const state = setup(t, 'constructor')
  await assert.rejects(state.start(), matches('write_uncertain'))
  assert.equal(state.instances.length, 0)
})

test('maps abort exceptions to ManagementError and removes listeners', async t => {
  const state = setup(t, 'abort')
  const pending = state.start()
  state.controller.abort()
  await assert.rejects(pending, matches('write_uncertain'))
  state.clean(state.instances[0])
})

for (const failure of ['open', 'header', 'send']) {
  test('handles synchronous XHR ' + failure + ' exceptions without retaining listeners', async t => {
    const state = setup(t, failure)
    await assert.rejects(state.start(), matches('write_uncertain'))
    state.clean(state.instances[0])
    assert.equal(state.instances.length, 1)
  })
}

test('invalid JSON, statuses and mismatched item fields never report business success', async t => {
  const state = setup(t)
  const badResponses = [
    [200, 'not-json'], [200, null], [200, {}], [201, success(3)], [204, ''],
    [302, success(3)], [0, {}], [500, { error: 'upstream-secret' }], [403, {}],
  ]
  for (const [key, value] of [
    ['id', 'other'], ['path', '/other'], ['name', 'replacement.bin'], ['size', 4],
    ['size', '3'], ['kind', 'folder'], ['eTag', ''], ['eTag', '*'], ['eTag', 'W/"v2"'],
  ]) badResponses.push([200, { item: { ...success(3).item, [key]: value } }])
  for (const [status, data] of badResponses) {
    const pending = state.start()
    const xhr = state.instances.at(-1)
    xhr.respond(status, data)
    await assert.rejects(pending, matches('write_uncertain'))
    state.clean(xhr)
    assert.equal(xhr.sends, 1)
  }
})
