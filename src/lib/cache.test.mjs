import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('./cache.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function fixture() {
  let now = 1_000_000
  const scans = { all: 0, keys: 0, values: 0 }
  const maps = []
  class TrackingMap extends Map {
    constructor() {
      super()
      maps.push(this)
    }
    [Symbol.iterator]() {
      scans.all++
      return super[Symbol.iterator]()
    }
    entries() {
      scans.all++
      return super.entries()
    }
    keys() {
      scans.keys++
      return super.keys()
    }
    values() {
      scans.values++
      return super.values()
    }
    forEach(callback, thisArg) {
      scans.all++
      return super.forEach(callback, thisArg)
    }
  }
  class Clock extends Date {
    static now() {
      return now
    }
  }
  const cache = {}
  vm.runInNewContext(code, { exports: cache, Map: TrackingMap, Date: Clock })
  return {
    cache,
    maps,
    scans,
    advance: ms => { now += ms },
    resetScans: () => { scans.all = scans.keys = scans.values = 0 },
  }
}

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

test('coalesces slow loads and starts the TTL when a load settles', async () => {
  const f = fixture()
  const gate = deferred()
  let calls = 0
  const load = () => { calls++; return gate.promise }
  const first = f.cache.cached('key', 100, load)
  const second = f.cache.cached('key', 100, load)
  await Promise.resolve()
  assert.equal(calls, 1)

  f.advance(1000)
  const third = f.cache.cached('key', 100, load)
  gate.resolve('value')
  assert.deepEqual(await Promise.all([first, second, third]), ['value', 'value', 'value'])
  assert.equal(calls, 1)

  f.advance(99)
  assert.equal(await f.cache.cached('key', 100, load), 'value')
  f.advance(1)
  assert.equal(await f.cache.cached('key', 100, async () => { calls++; return 'refreshed' }), 'refreshed')
  assert.equal(calls, 2)

  let immediate = 0
  assert.equal(await f.cache.cached('immediate', 0, async () => ++immediate), 1)
  assert.equal(await f.cache.cached('immediate', 0, async () => ++immediate), 2)
})

test('does not cache rejected loads, thrown errors, null or undefined', async () => {
  const { cache } = fixture()
  const gate = deferred()
  const error = new Error('load failed')
  let calls = 0
  const load = () => { calls++; return gate.promise }
  const first = cache.cached('error', 100, load)
  const second = cache.cached('error', 100, load)
  const failures = Promise.all([assert.rejects(first, error), assert.rejects(second, error)])
  await Promise.resolve()
  assert.equal(calls, 1)
  gate.reject(error)
  await failures
  assert.equal(await cache.cached('error', 100, async () => 'retry'), 'retry')

  await assert.rejects(cache.cached('thrown', 100, () => { throw error }), error)
  assert.equal(await cache.cached('thrown', 100, async () => 'retry'), 'retry')

  for (const value of [null, undefined]) {
    const key = String(value)
    assert.equal(await cache.cached(key, 100, async () => value), value)
    assert.equal(await cache.cached(key, 100, async () => 'retry'), 'retry')
  }
  for (const value of [false, 0, '']) {
    const key = String(value)
    assert.equal(await cache.cached(key, 100, async () => value), value)
    assert.equal(await cache.cached(key, 100, async () => 'unexpected'), value)
  }
})

test('kind lookups expire at the boundary and ignore nonpositive TTLs', () => {
  const f = fixture()
  const { cache } = f
  cache.rememberKinds('/', [
    { name: 'file', file: {} },
    { name: 'folder', folder: {}, file: {} },
    { name: 'unknown' },
  ], 100)
  cache.rememberKinds('/parent', [{ name: 'child', file: {} }], 100)
  cache.rememberKind('/file', 'folder', 0)
  cache.rememberKind('/negative', 'file', -1)
  cache.rememberKinds('', [{ name: 'ignored', file: {} }], 0)

  assert.equal(cache.knownKind('/file'), 'file')
  assert.equal(cache.knownKind('/folder'), 'folder')
  assert.equal(cache.knownKind('/parent/child'), 'file')
  assert.equal(cache.knownKind('/unknown'), undefined)
  assert.equal(cache.knownKind('/negative'), undefined)
  assert.equal(cache.knownKind('/ignored'), undefined)
  f.advance(99)
  assert.equal(cache.knownKind('/file'), 'file')
  f.advance(1)
  assert.equal(cache.knownKind('/file'), undefined)
  assert.equal(cache.knownKind('/folder'), undefined)
})

test('ordinary hits, misses and writes do not iterate either cache', async () => {
  const f = fixture()
  const { cache } = f
  for (let i = 0; i < 100; i++) {
    await cache.cached('metadata-' + i, i === 0 ? 10 : 100, async () => i)
    cache.rememberKind('/kind-' + i, 'file', 100)
  }
  cache.rememberKind('/expired', 'file', 10)
  f.advance(10)
  f.resetScans()

  assert.equal(await cache.cached('metadata-1', 100, async () => 'unexpected'), 1)
  assert.equal(await cache.cached('metadata-0', 100, async () => 'refreshed'), 'refreshed')
  assert.equal(await cache.cached('new', 100, async () => 'new'), 'new')
  assert.equal(cache.knownKind('/kind-1'), 'file')
  assert.equal(cache.knownKind('/expired'), undefined)
  assert.equal(cache.knownKind('/missing'), undefined)
  cache.rememberKind('/kind-1', 'folder', 100)
  cache.rememberKind('/added', 'file', 100)
  cache.rememberKind('/ignored', 'file', 0)
  cache.rememberKinds('/parent', [{ name: 'a', file: {} }, { name: 'b', folder: {} }], 100)
  assert.deepEqual(f.scans, { all: 0, keys: 0, values: 0 })
})

test('metadata capacity removes expired entries before evicting live entries', async () => {
  const f = fixture()
  const { cache } = f
  await cache.cached('old-live', 1000, async () => 'old')
  await cache.cached('expired', 10, async () => 'stale')
  for (let i = 0; i < 498; i++) await cache.cached('filler-' + i, 1000, async () => i)
  assert.equal(f.maps[0].size, 500)
  f.advance(10)
  f.resetScans()

  assert.equal(await cache.cached('new', 1000, async () => 'new'), 'new')
  assert.equal(f.scans.all, 1)
  assert.equal(f.maps[0].size, 500)
  assert.equal(await cache.cached('old-live', 1000, async () => 'unexpected'), 'old')
  assert.equal(await cache.cached('expired', 1000, async () => 'refreshed'), 'refreshed')
})

test('metadata capacity evicts the oldest settled entry without evicting a flight', async () => {
  const f = fixture()
  const { cache } = f
  const gate = deferred()
  let pendingCalls = 0
  const load = () => { pendingCalls++; return gate.promise }
  const pending = cache.cached('pending', 1000, load)
  for (let i = 0; i < 499; i++) await cache.cached('settled-' + i, 1000, async () => i)

  assert.equal(await cache.cached('settled-0', 1000, async () => 'unexpected'), 0)
  assert.equal(await cache.cached('new', 1000, async () => 'new'), 'new')
  assert.equal(f.maps[0].size, 500)
  const joined = cache.cached('pending', 1000, load)
  assert.equal(await cache.cached('settled-0', 1000, async () => 'reloaded'), 'reloaded')
  gate.resolve('pending value')
  assert.deepEqual(await Promise.all([pending, joined]), ['pending value', 'pending value'])
  assert.equal(pendingCalls, 1)
})

test('at full pending capacity new keys wait and then coalesce', async () => {
  const f = fixture()
  const { cache } = f
  const firstGate = deferred()
  const restGate = deferred()
  const newGate = deferred()
  const started = deferred()
  const flights = Array.from({ length: 500 }, (_, i) =>
    cache.cached('pending-' + i, 1000, () => i === 0 ? firstGate.promise : restGate.promise),
  )
  let newCalls = 0
  const loadNew = () => { newCalls++; started.resolve(); return newGate.promise }
  const first = cache.cached('new', 1000, loadNew)
  const second = cache.cached('new', 1000, loadNew)
  await Promise.resolve()
  assert.equal(newCalls, 0)
  assert.equal(f.maps[0].size, 500)

  firstGate.resolve('first')
  await started.promise
  assert.equal(newCalls, 1)
  assert.equal(f.maps[0].size, 500)
  newGate.resolve('new value')
  assert.deepEqual(await Promise.all([first, second]), ['new value', 'new value'])
  assert.equal(newCalls, 1)
  restGate.resolve('rest')
  await Promise.all(flights)
})

test('a rejected flight frees a slot for a saturated waiter', async () => {
  const f = fixture()
  const { cache } = f
  const firstGate = deferred()
  const restGate = deferred()
  const flights = Array.from({ length: 500 }, (_, i) =>
    cache.cached('pending-' + i, 1000, () => i === 0 ? firstGate.promise : restGate.promise),
  )
  const failure = assert.rejects(flights[0], /failed flight/)
  let waiterCalls = 0
  const waiter = cache.cached('new', 1000, async () => { waiterCalls++; return 'new value' })
  await Promise.resolve()
  assert.equal(waiterCalls, 0)
  firstGate.reject(new Error('failed flight'))
  await failure
  assert.equal(await waiter, 'new value')
  assert.equal(waiterCalls, 1)
  assert.equal(f.maps[0].size, 500)
  assert.equal(await cache.cached('pending-0', 1000, async () => 'retried'), 'retried')
  restGate.resolve('rest')
  await Promise.all(flights.slice(1))
})

test('kind capacity prunes expired entries and scans only once per batch', () => {
  const f = fixture()
  const { cache } = f
  cache.rememberKind('/old-live', 'file', 1000)
  cache.rememberKind('/expired', 'file', 10)
  cache.rememberKinds('/', Array.from({ length: 4998 }, (_, i) => ({ name: 'filler-' + i, file: {} })), 1000)
  assert.equal(f.maps[1].size, 5000)
  f.advance(10)
  f.resetScans()

  cache.rememberKind('/new', 'folder', 1000)
  assert.equal(f.scans.all, 1)
  assert.equal(f.scans.keys, 0)
  assert.equal(f.maps[1].size, 5000)
  assert.equal(cache.knownKind('/old-live'), 'file')
  assert.equal(cache.knownKind('/expired'), undefined)

  f.resetScans()
  cache.rememberKinds('/', Array.from({ length: 5 }, (_, i) => ({ name: 'batch-' + i, folder: {} })), 1000)
  assert.equal(f.scans.all, 1)
  assert.equal(f.scans.keys, 5)
  assert.equal(f.maps[1].size, 5000)
  assert.equal(cache.knownKind('/old-live'), undefined)
  assert.equal(cache.knownKind('/batch-4'), 'folder')
})

test('skips kind writes when a positive TTL rounds down to zero', () => {
  const f = fixture()
  const { cache } = f
  cache.rememberKinds('/', Array.from({ length: 5000 }, (_, i) => ({ name: 'filler-' + i, file: {} })), 30_000)
  f.resetScans()

  cache.rememberKind('/short-single', 'file', 1e-12)
  cache.rememberKind('/filler-0', 'folder', 1e-12)
  cache.rememberKinds('/', [{ name: 'short-batch', file: {} }, { name: 'filler-1', folder: {} }], 1e-12)
  assert.equal(f.maps[1].size, 5000)
  assert.deepEqual(f.scans, { all: 0, keys: 0, values: 0 })
  assert.equal(cache.knownKind('/short-single'), undefined)
  assert.equal(cache.knownKind('/short-batch'), undefined)
  assert.equal(cache.knownKind('/filler-0'), 'file')
  assert.equal(cache.knownKind('/filler-1'), 'file')
  f.advance(29_999)
  assert.equal(cache.knownKind('/filler-0'), 'file')
  f.advance(1)
  assert.equal(cache.knownKind('/filler-0'), undefined)
})

test('remembers positive TTLs that are representable by the clock', () => {
  const f = fixture()
  const { cache } = f
  cache.rememberKind('/single', 'file', 1e-9)
  cache.rememberKinds('/', [{ name: 'batch', folder: {} }], 1e-9)
  assert.equal(cache.knownKind('/single'), 'file')
  assert.equal(cache.knownKind('/batch'), 'folder')
  f.advance(1e-9)
  assert.equal(cache.knownKind('/single'), undefined)
  assert.equal(cache.knownKind('/batch'), undefined)
})

test('kind updates preserve insertion order and expired replacements move to the end', () => {
  const f = fixture()
  const { cache } = f
  cache.rememberKind('/expired', 'file', 10)
  cache.rememberKind('/next', 'file', 1000)
  cache.rememberKinds('/', Array.from({ length: 4998 }, (_, i) => ({ name: 'filler-' + i, file: {} })), 1000)
  f.advance(10)
  f.resetScans()

  cache.rememberKind('/expired', 'folder', 1000)
  cache.rememberKind('/next', 'folder', 1000)
  assert.deepEqual(f.scans, { all: 0, keys: 0, values: 0 })
  assert.equal(f.maps[1].size, 5000)
  cache.rememberKind('/new', 'file', 1000)
  assert.equal(cache.knownKind('/expired'), 'folder')
  assert.equal(cache.knownKind('/next'), undefined)
  assert.equal(cache.knownKind('/new'), 'file')
  assert.equal(f.maps[1].size, 5000)
})

test('clearCache advances the generation and stale flights cannot replace or delete new entries', async () => {
  for (const outcome of ['value', 'null', 'error']) {
    const f = fixture()
    const { cache } = f
    const oldGate = deferred()
    const old = cache.cached('key', 1000, () => oldGate.promise)
    const oldFailure = outcome === 'error' ? assert.rejects(old, /old failure/) : undefined
    await Promise.resolve()
    assert.equal(await cache.cached('settled', 1000, async () => 'old settled'), 'old settled')
    cache.rememberKind('/path', 'file', 1000)
    const generation = cache.cacheGeneration()
    cache.clearCache()
    assert.equal(cache.cacheGeneration(), generation + 1)
    assert.equal(cache.knownKind('/path'), undefined)
    assert.equal(await cache.cached('settled', 1000, async () => 'new settled'), 'new settled')

    const newGate = deferred()
    let calls = 0
    const load = () => { calls++; return newGate.promise }
    const current = cache.cached('key', 1000, load)
    await Promise.resolve()
    if (outcome === 'error') {
      oldGate.reject(new Error('old failure'))
      await oldFailure
    } else {
      oldGate.resolve(outcome === 'null' ? null : 'old value')
      assert.equal(await old, outcome === 'null' ? null : 'old value')
    }
    const joined = cache.cached('key', 1000, load)
    newGate.resolve('new value')
    assert.deepEqual(await Promise.all([current, joined]), ['new value', 'new value'])
    assert.equal(calls, 1)
    assert.equal(await cache.cached('key', 1000, async () => 'unexpected'), 'new value')
  }
})

test('clearCache preserves the saturation waiter generation behavior', async () => {
  const f = fixture()
  const { cache } = f
  const gate = deferred()
  const flights = Array.from({ length: 500 }, (_, i) => cache.cached('pending-' + i, 1000, () => gate.promise))
  let waiterCalls = 0
  const waiter = cache.cached('key', 1000, async () => { waiterCalls++; return 'uncached waiter' })
  await Promise.resolve()
  assert.equal(waiterCalls, 0)
  const generation = cache.cacheGeneration()
  cache.clearCache()
  assert.equal(cache.cacheGeneration(), generation + 1)
  assert.equal(await cache.cached('key', 1000, async () => 'fresh'), 'fresh')

  gate.resolve('old')
  assert.equal(await waiter, 'uncached waiter')
  assert.equal(waiterCalls, 1)
  await Promise.all(flights)
  assert.equal(await cache.cached('key', 1000, async () => 'unexpected'), 'fresh')
})
