import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

function load(filename, imports = {}, globals = {}) {
  const source = readFileSync(new URL(filename, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', ...Object.keys(globals), compiled)(
    name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`)
      return imports[name]
    },
    loaded, loaded.exports, ...Object.values(globals),
  )
  return loaded.exports
}

const engineImports = {
  './driveManagement': load('./driveManagement.ts'),
  './replaceManagedFile': {
    MAX_REPLACEMENT_BYTES: 4 * 1024 * 1024,
    async replaceManagedFile() { throw new Error('Unexpected small replacement') },
  },
}
const engine = load('./uploadToOnedrive.ts', engineImports)
const { UploadCompletionError, UploadUncertainError } = engine
const { createUploadQueue } = load('./uploadQueue.ts', { './uploadToOnedrive': engine })
const file = (name, size = 4, lastModified = 1) => new File([new Uint8Array(size)], name, { lastModified })
const tick = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function setup(overrides = {}, path = '/folder%20one/%E6%96%87%E4%BB%B6') {
  const events = []
  let locked = false
  const queue = createUploadQueue(path, {
    beginUpload() {
      events.push('begin')
      assert.equal(locked, false)
      locked = true
      return true
    },
    endUpload() {
      assert.equal(locked, true)
      locked = false
      events.push('end')
    },
    async upload({ file, onProgress }) {
      assert.equal(locked, true)
      events.push(file.name)
      onProgress(file.size)
    },
    async complete(path, name) {
      assert.equal(locked, true)
      events.push(`complete:${name}`)
    },
    async onComplete() {
      assert.equal(locked, true)
      events.push('refresh')
    },
    ...overrides,
  })
  return { queue, events, locked: () => locked }
}
const states = queue => queue.getSnapshot().items.map(item => item.state)

test('selection only enqueues, deduplicates by all three file fields, and has no small batch limit', () => {
  const { queue, events } = setup()
  queue.addFiles([file('a'), file('a'), file('a', 5), file('a', 4, 2)])
  queue.addFiles([file('a'), ...Array.from({ length: 300 }, (_, i) => file(`file-${i}`))])
  const { items } = queue.getSnapshot()
  assert.equal(items.length, 303)
  assert.equal(new Set(items.map(item => item.id)).size, 303)
  assert.ok(items.every(item => item.state === 'queued' && item.uploaded === 0))
  assert.deepEqual(events, [])
  queue.remove(items[0].id)
  queue.addFiles([file('a')])
  assert.equal(queue.getSnapshot().items.length, 303)
  queue.clear()
  assert.deepEqual(queue.getSnapshot(), { items: [], running: false, refreshFailed: false, startBlocked: false })
})

test('uploads sequentially, includes additions in the running batch, and holds one lock through every refresh', async () => {
  const gate = deferred()
  const events = []
  let active = 0
  const { queue, locked } = setup({
    async upload({ file, path, onProgress }) {
      assert.equal(locked(), true)
      assert.equal(++active, 1)
      assert.equal(path, '/folder one/文件')
      events.push(file.name)
      onProgress(2)
      if (file.name === 'a') await gate.promise
      active--
    },
    async onComplete() {
      assert.equal(locked(), true)
      events.push('refresh')
    },
  })
  queue.addFiles([file('a'), file('b')])
  const first = queue.start()
  assert.equal(queue.start(), first)
  await tick()
  assert.deepEqual(states(queue), ['uploading', 'queued'])
  assert.equal(queue.getSnapshot().items[0].uploaded, 2)
  queue.addFiles([file('c'), file('a')])
  gate.resolve()
  await first
  assert.deepEqual(events, ['a', 'refresh', 'b', 'refresh', 'c', 'refresh'])
  assert.deepEqual(states(queue), ['done', 'done', 'done'])
  assert.ok(queue.getSnapshot().items.every(item => item.uploaded === item.file.size))
  assert.equal(locked(), false)
  assert.equal(queue.getSnapshot().running, false)
  await queue.start()
  assert.equal(events.length, 6)
})

test('lock denial leaves all files queued and sets startBlocked until a successful start', async () => {
  let allowed = false
  let released = 0
  const { queue, events } = setup({
    beginUpload: () => allowed,
    endUpload: () => { released++ },
    async upload({ file }) { events.push(file.name) },
    async onComplete() {},
  })
  queue.addFiles([file('a')])
  await queue.start()
  assert.equal(queue.getSnapshot().startBlocked, true)
  assert.equal(queue.getSnapshot().running, false)
  assert.deepEqual(states(queue), ['queued'])
  assert.equal(released, 0)
  allowed = true
  await queue.start()
  assert.equal(queue.getSnapshot().startBlocked, false)
  assert.deepEqual(states(queue), ['done'])
  assert.equal(released, 1)
})

test('ordinary failure, uncertain result, and completion failure each allow the next upload', async () => {
  const { queue, events } = setup({
    async upload({ file, onProgress }) {
      events.push(file.name)
      onProgress(2)
      if (file.name === 'failed') throw new Error('network')
      if (file.name === 'uncertain') throw new UploadUncertainError('unknown')
      if (file.name === 'completion') throw new UploadCompletionError('finalize')
    },
  })
  queue.addFiles(['failed', 'uncertain', 'completion', 'done'].map(name => file(name)))
  await queue.start()
  assert.deepEqual(states(queue), ['failed', 'uncertain', 'completionFailed', 'done'])
  assert.deepEqual(queue.getSnapshot().items.map(item => item.uploaded), [2, 2, 4, 4])
  assert.deepEqual(events, ['begin', 'failed', 'uncertain', 'refresh', 'completion', 'refresh', 'done', 'refresh', 'end'])
})

test('cancel aborts the active file, cancels waiting files, and refreshes only the attempted file', async () => {
  let signal
  const { queue, events } = setup({
    upload(options) {
      signal = options.signal
      options.onProgress(2)
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      })
    },
  })
  queue.addFiles([file('a'), file('b')])
  const running = queue.start()
  await tick()
  queue.cancel()
  assert.equal(signal.aborted, true)
  assert.equal(queue.getSnapshot().items[1].state, 'cancelled')
  await running
  assert.deepEqual(states(queue), ['cancelled', 'cancelled'])
  assert.equal(queue.getSnapshot().items[0].uploaded, 2)
  assert.deepEqual(events, ['begin', 'refresh', 'end'])
  await queue.start()
  assert.deepEqual(events, ['begin', 'refresh', 'end'])
})

for (const [ErrorType, expected] of [[UploadUncertainError, 'uncertain'], [UploadCompletionError, 'completionFailed']]) {
  test(`cancel preserves ${expected} from the engine`, async () => {
    const { queue, events } = setup({
      upload({ signal }) {
        return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new ErrorType('abort')), { once: true }))
      },
    })
    queue.addFiles([file('a'), file('b')])
    const running = queue.start()
    await tick()
    queue.cancel()
    await running
    assert.deepEqual(states(queue), [expected, 'cancelled'])
    assert.deepEqual(events, ['begin', 'refresh', 'end'])
  })
}

test('cancellation before the first upload sends no request', async () => {
  const { queue, events } = setup()
  queue.addFiles([file('a'), file('b')])
  const running = queue.start()
  queue.cancel()
  await running
  assert.deepEqual(states(queue), ['cancelled', 'cancelled'])
  assert.deepEqual(events, ['begin', 'end'])
})

test('refresh failure is visible, does not change upload results, and does not stop the batch', async () => {
  let refreshes = 0
  const { queue, events } = setup({
    async onComplete() {
      if (++refreshes === 1) throw new Error('refresh failed')
    },
  })
  queue.addFiles([file('a'), file('b')])
  await queue.start()
  assert.deepEqual(states(queue), ['done', 'done'])
  assert.equal(queue.getSnapshot().refreshFailed, true)
  assert.equal(refreshes, 2)
  assert.deepEqual(events, ['begin', 'a', 'b', 'end'])
  queue.addFiles([file('c')])
  await queue.start()
  assert.equal(queue.getSnapshot().refreshFailed, false)
})

test('completionFailed retry finalizes only that item, preserves progress, and never reuploads done files', async () => {
  let attempts = 0
  const gate = deferred()
  const { queue, events } = setup({
    async upload({ file }) {
      events.push(file.name)
      if (file.name === 'a') throw new UploadCompletionError('finalize failed')
    },
    async complete(path, name, signal) {
      assert.equal(path, '/folder one/文件')
      assert.equal(name, 'a')
      assert.equal(signal.aborted, false)
      events.push('complete')
      if (++attempts === 1) throw new UploadCompletionError('still failed')
      await gate.promise
    },
  })
  queue.addFiles([file('a'), file('b')])
  await queue.start()
  const [first, second] = queue.getSnapshot().items
  assert.deepEqual(states(queue), ['completionFailed', 'done'])
  await queue.retry(second.id)
  assert.equal(events.filter(event => event === 'b').length, 1)
  await queue.retry(first.id)
  assert.deepEqual(states(queue), ['completionFailed', 'done'])
  const retrying = queue.retry(first.id)
  await tick()
  assert.equal(queue.getSnapshot().items[0].uploaded, 4)
  gate.resolve()
  await retrying
  assert.deepEqual(states(queue), ['done', 'done'])
  assert.equal(events.filter(event => event === 'a').length, 1)
  assert.equal(events.filter(event => event === 'complete').length, 2)
})

for (const state of ['failed', 'cancelled', 'uncertain']) {
  test(`retry explicitly reuploads only the selected ${state} item`, async () => {
    let retrying = false
    const uploads = []
    const { queue } = setup({
      async upload({ file, signal }) {
        uploads.push(file.name)
        if (retrying || file.name === 'done') return
        if (state === 'failed') throw new Error('failed')
        if (state === 'uncertain') throw new UploadUncertainError('unknown')
        queue.cancel()
        assert.equal(signal.aborted, true)
        throw new DOMException('Aborted', 'AbortError')
      },
    })
    queue.addFiles([file('done'), file('a'), file('b')])
    await queue.start()
    assert.deepEqual(states(queue), ['done', state, state])
    retrying = true
    await queue.retry(queue.getSnapshot().items[1].id)
    assert.deepEqual(states(queue), ['done', 'done', state])
    assert.deepEqual(uploads, state === 'cancelled' ? ['done', 'a', 'a'] : ['done', 'a', 'b', 'a'])
  })
}

test('retry is rejected while running, active removal is ignored, and clear is ignored until idle', async () => {
  const gate = deferred()
  const { queue } = setup({ async upload() { await gate.promise } })
  queue.addFiles([file('a'), file('b'), file('c')])
  const running = queue.start()
  await tick()
  const [a, b] = queue.getSnapshot().items
  await assert.rejects(queue.retry(a.id), /queue is running/)
  queue.remove(a.id)
  queue.clear()
  assert.equal(queue.getSnapshot().items.length, 3)
  queue.remove(b.id)
  gate.resolve()
  await running
  assert.deepEqual(queue.getSnapshot().items.map(item => item.file.name), ['a', 'c'])
  queue.remove(a.id)
  queue.clear()
  assert.equal(queue.getSnapshot().items.length, 0)
})

test('finalization retry stays finalization-only if the global lock is initially blocked', async () => {
  let allowed = true
  let uploads = 0, completions = 0
  const { queue } = setup({
    beginUpload: () => allowed,
    endUpload() {},
    async upload() { uploads++; throw new UploadCompletionError('failed') },
    async complete() { completions++ },
    async onComplete() {},
  })
  queue.addFiles([file('a')])
  await queue.start()
  const { id } = queue.getSnapshot().items[0]
  allowed = false
  await queue.retry(id)
  assert.equal(queue.getSnapshot().startBlocked, true)
  assert.equal(uploads, 1)
  assert.equal(completions, 0)
  allowed = true
  await queue.start()
  assert.equal(uploads, 1)
  assert.equal(completions, 1)
  assert.deepEqual(states(queue), ['done'])
})

test('dispose immediately aborts and releases the lock, ignores late progress/results, and stops remaining items', async () => {
  const gate = deferred()
  let options, updates = 0
  const { queue, events, locked } = setup({
    async upload(current) { options = current; await gate.promise },
  })
  queue.subscribe(() => { updates++ })
  queue.addFiles([file('a'), file('b')])
  const running = queue.start()
  await tick()
  queue.dispose()
  assert.equal(options.signal.aborted, true)
  assert.equal(locked(), false)
  const snapshot = queue.getSnapshot()
  const count = updates
  options.onProgress(4)
  queue.addFiles([file('c')])
  await queue.start()
  await queue.retry(snapshot.items[0].id)
  queue.cancel()
  queue.remove(snapshot.items[0].id)
  queue.clear()
  gate.resolve()
  await running
  assert.equal(queue.getSnapshot(), snapshot)
  assert.equal(updates, count)
  assert.deepEqual(events, ['begin', 'end'])
  assert.deepEqual(states(queue), ['cancelled', 'cancelled'])
})

test('dispose during refresh suppresses late refresh failures and does not start the next item', async () => {
  const refresh = deferred()
  const { queue, events } = setup({ onComplete: () => refresh.promise })
  queue.addFiles([file('a'), file('b')])
  const running = queue.start()
  await tick()
  assert.deepEqual(states(queue), ['done', 'queued'])
  queue.dispose()
  const snapshot = queue.getSnapshot()
  refresh.reject(new Error('late failure'))
  await running
  assert.equal(queue.getSnapshot(), snapshot)
  assert.deepEqual(states(queue), ['done', 'cancelled'])
  assert.equal(snapshot.refreshFailed, false)
  assert.deepEqual(events, ['begin', 'a', 'end'])
})

test('effect reactivation allows new work without a stale run releasing its lock or mutating it', async () => {
  const old = deferred()
  const fresh = deferred()
  let attempts = 0
  const { queue, events, locked } = setup({
    async upload() { await (++attempts === 1 ? old.promise : fresh.promise) },
  })
  queue.addFiles([file('old')])
  const first = queue.start()
  await tick()
  queue.dispose()
  queue.activate()
  queue.addFiles([file('new')])
  const second = queue.start()
  await tick()
  old.resolve()
  await first
  assert.equal(locked(), true)
  assert.deepEqual(states(queue), ['cancelled', 'uploading'])
  fresh.resolve()
  await second
  assert.deepEqual(states(queue), ['cancelled', 'done'])
  assert.deepEqual(events, ['begin', 'end', 'begin', 'refresh', 'end'])
})

test('malformed encoded paths fail without sending an upload request and release the lock', async () => {
  const { queue, events } = setup({}, '/bad%ZZ')
  queue.addFiles([file('a')])
  await queue.start()
  assert.deepEqual(states(queue), ['failed'])
  assert.deepEqual(events, ['begin', 'end'])
})

test('real engine integration retries completion without another session or chunk request', async () => {
  const calls = []
  let completionWorks = false
  const realEngine = load('./uploadToOnedrive.ts', engineImports, {
    async fetch(url, options) {
      calls.push([url, options])
      if (url === '/api/upload/prepare') return Response.json({ mode: 'create' })
      if (url === '/api/upload/session') return Response.json({
        uploadUrl: 'https://upload.onedrive.com/session', expirationDateTime: new Date(Date.now() + 3600000).toISOString(),
      })
      if (url === '/api/upload/complete') return completionWorks
        ? Response.json({ ok: true }) : new Response(null, { status: 503 })
      return Response.json({ id: 'item' }, { status: 201 })
    },
  })
  const realQueue = load('./uploadQueue.ts', { './uploadToOnedrive': realEngine })
  const queue = realQueue.createUploadQueue('/a%20b/%2525', {
    beginUpload: () => true, endUpload() {}, async onComplete() {},
  })
  queue.addFiles([file('a')])
  await queue.start()
  assert.deepEqual(states(queue), ['completionFailed'])
  completionWorks = true
  await queue.retry(queue.getSnapshot().items[0].id)
  assert.deepEqual(states(queue), ['done'])
  assert.deepEqual(calls.map(([url]) => url), [
    '/api/upload/prepare', '/api/upload/session', 'https://upload.onedrive.com/session', '/api/upload/complete', '/api/upload/complete',
  ])
  for (const [url, options] of calls) {
    if (url.startsWith('/api/')) assert.equal(JSON.parse(options.body).path, '/a b/%25')
  }
})

for (const lostFinalResponse of [false, true]) {
  test('large replacement retry commits only, preserving ' + (lostFinalResponse ? 'job-only' : 'uploaded-ID') + ' context and backup', async () => {
    const calls = []
    const jobId = 'b'.repeat(64)
    const size = 4 * 1024 * 1024 + 3
    const finalItem = { id: 'temp-id', name: 'a', path: '/a b/%25/a', eTag: '"v2"', size, kind: 'file' }
    let commits = 0
    const realEngine = load('./uploadToOnedrive.ts', engineImports, {
      async fetch(url, options) {
        calls.push([url, options])
        if (url === '/api/upload/prepare') return Response.json({
          mode: 'replaceLarge', jobId, uploadUrl: 'https://upload.onedrive.com/temp',
          expirationDateTime: new Date(Date.now() + 3600000).toISOString(),
        })
        if (url === '/api/upload/replace/commit') {
          if (++commits === 1) return Response.json({ error: 'write_uncertain' }, { status: 502 })
          return Response.json({ ok: true, backupName: '.__backup-a', item: finalItem })
        }
        assert.equal(url, 'https://upload.onedrive.com/temp')
        if (options.headers['Content-Range'].startsWith('bytes 0-')) {
          return Response.json({ nextExpectedRanges: ['3276800-'] }, { status: 202 })
        }
        if (lostFinalResponse) throw new TypeError('lost final response')
        return Response.json({ id: 'temp-id' }, { status: 201 })
      },
    })
    const realQueue = load('./uploadQueue.ts', { './uploadToOnedrive': realEngine })
    let refreshes = 0
    const queue = realQueue.createUploadQueue('/a%20b/%2525', {
      beginUpload: () => true, endUpload() {}, async onComplete() { refreshes++ },
    })
    queue.addFiles([file('a', size)])
    await queue.start()
    const initial = queue.getSnapshot().items[0]
    assert.equal(initial.state, 'completionFailed')
    assert.deepEqual(initial.completion, lostFinalResponse ? { jobId } : { jobId, uploadedItemId: 'temp-id' })
    assert.equal(initial.uploaded, size)
    const writesBefore = calls.filter(([url]) => url.startsWith('https:')).length
    // With a lost final response, the first explicit commit also fails before the next succeeds.
    if (lostFinalResponse) {
      await queue.retry(initial.id)
      assert.equal(queue.getSnapshot().items[0].state, 'completionFailed')
      assert.deepEqual(queue.getSnapshot().items[0].completion, { jobId })
    }
    await queue.retry(initial.id)
    const result = queue.getSnapshot().items[0]
    assert.equal(result.state, 'done')
    assert.equal(result.backupName, '.__backup-a')
    assert.equal(result.completion, undefined)
    assert.equal(calls.filter(([url]) => url === '/api/upload/prepare').length, 1)
    assert.equal(calls.filter(([url]) => url.startsWith('https:')).length, writesBefore)
    assert.equal(calls.some(([url]) => url === '/api/upload/session' || url === '/api/upload/complete'), false)
    assert.equal(refreshes, lostFinalResponse ? 3 : 2)
    for (const [url, options] of calls) {
      if (url === '/api/upload/replace/commit') assert.deepEqual(JSON.parse(options.body), initial.completion)
      if (url.startsWith('https:')) {
        assert.equal(options.credentials, 'omit')
        assert.equal(options.headers.Authorization, undefined)
      }
    }
  })
}

test('finalization context survives cancellation while a retry is waiting for the admin lock', async () => {
  const completion = { jobId: 'c'.repeat(64), uploadedItemId: 'temp-id' }
  let allowed = true
  let uploads = 0, commits = 0
  const { queue } = setup({
    beginUpload: () => allowed,
    endUpload() {},
    async upload() {
      uploads++
      throw new UploadCompletionError('failed commit', { completion, cause: new Error('network') })
    },
    async complete(path, name, signal, context) {
      commits++
      assert.deepEqual(context, completion)
      return { backupName: 'backup', item: { size: 4 } }
    },
  })
  queue.addFiles([file('a')])
  await queue.start()
  const id = queue.getSnapshot().items[0].id
  allowed = false
  await queue.retry(id)
  queue.cancel()
  assert.deepEqual(states(queue), ['cancelled'])
  allowed = true
  await queue.retry(id)
  assert.deepEqual(states(queue), ['done'])
  assert.equal(uploads, 1)
  assert.equal(commits, 1)
  assert.equal(queue.getSnapshot().items[0].backupName, 'backup')
})

test('a bad finalization receipt size stays completionFailed and preserves the completion context', async () => {
  const completion = { jobId: 'd'.repeat(64), uploadedItemId: 'temp-id' }
  let uploads = 0, commits = 0
  const { queue } = setup({
    async upload() { uploads++; throw new UploadCompletionError('retry', { completion }) },
    async complete(path, name, signal, context) {
      assert.deepEqual(context, completion)
      return { backupName: 'backup', item: { size: ++commits === 1 ? 999 : 4 } }
    },
  })
  queue.addFiles([file('a')])
  await queue.start()
  const id = queue.getSnapshot().items[0].id
  await queue.retry(id)
  assert.deepEqual(states(queue), ['completionFailed'])
  assert.deepEqual(queue.getSnapshot().items[0].completion, completion)
  assert.equal(queue.getSnapshot().items[0].backupName, undefined)
  await queue.retry(id)
  assert.deepEqual(states(queue), ['done'])
  assert.equal(uploads, 1)
  assert.equal(commits, 2)
})

test('real small replacement integration maps success, conflict and uncertain results into queue states', async () => {
  for (const [code, expected] of [[null, 'done'], ['item_changed', 'failed'], ['write_uncertain', 'uncertain']]) {
    let replacements = 0, fetches = 0, refreshes = 0
    const realEngine = load('./uploadToOnedrive.ts', {
      ...engineImports,
      './replaceManagedFile': {
        MAX_REPLACEMENT_BYTES: 4 * 1024 * 1024,
        async replaceManagedFile(item, file, signal, onProgress) {
          replacements++
          onProgress(file.size, file.size)
          if (code) throw new engineImports['./driveManagement'].ManagementError(code)
          return { ...item, size: file.size, eTag: '"v2"' }
        },
      },
    }, {
      async fetch(url) {
        fetches++
        assert.equal(url, '/api/upload/prepare')
        return Response.json({
          mode: 'replaceSmall', item: { id: 'id', path: '/a', name: 'a', size: 999999, eTag: '"v1"', kind: 'file' },
        })
      },
    })
    const realQueue = load('./uploadQueue.ts', { './uploadToOnedrive': realEngine })
    const queue = realQueue.createUploadQueue('/', {
      beginUpload: () => true, endUpload() {}, async onComplete() { refreshes++ },
    })
    queue.addFiles([file('a')])
    await queue.start()
    assert.deepEqual(states(queue), [expected])
    assert.equal(fetches, 1)
    assert.equal(replacements, 1)
    assert.equal(refreshes, expected === 'failed' ? 0 : 1)
  }
})

// This harness exercises hook ownership and effect cleanup without a DOM or animation.
function hookHarness() {
  const slots = []
  let cursor = 0
  let pendingEffects = []
  const same = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]))
  const react = {
    useRef(value) {
      const index = cursor++
      slots[index] ??= { current: value }
      return slots[index]
    },
    useMemo(factory, deps) {
      const index = cursor++
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: factory(), deps }
      return slots[index].value
    },
    useEffect(effect, deps) {
      const index = cursor++
      if (!slots[index] || !same(slots[index].deps, deps)) {
        const previous = slots[index]
        slots[index] = { deps, effect, cleanup: previous?.cleanup }
        pendingEffects.push(() => {
          previous?.cleanup?.()
          slots[index].cleanup = effect()
        })
      }
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      react.useEffect(() => subscribe(() => {}), [subscribe])
      return getSnapshot()
    },
  }
  const gates = []
  const uploads = []
  let held = false, releases = 0, begins = 0
  const imports = {
    react,
    './uploadQueue': {
      createUploadQueue(path, dependencies) {
        return createUploadQueue(path, {
          ...dependencies,
          async upload(options) {
            uploads.push(options)
            const gate = gates.shift()
            if (gate) await gate.promise
          },
        })
      },
    },
    './useAdminSession': {
      beginAdminUpload() {
        if (held) return false
        held = true
        begins++
        return true
      },
      endAdminUpload() { held = false; releases++ },
    },
  }
  const hook = load('./useUploadQueue.ts', imports).useUploadQueue
  return {
    render(path, onComplete) {
      cursor = 0
      const result = hook(path, onComplete)
      const effects = pendingEffects
      pendingEffects = []
      effects.forEach(effect => effect())
      return result
    },
    cleanup() { slots.forEach(slot => slot?.cleanup?.()) },
    replayEffects() {
      slots.forEach(slot => { if (slot?.effect) slot.cleanup = slot.effect() })
    },
    gates, uploads,
    held: () => held,
    begins: () => begins,
    releases: () => releases,
  }
}

test('hook retains its queue when onComplete changes and uses the latest callback for each item', async () => {
  const harness = hookHarness()
  const firstGate = deferred()
  harness.gates.push(firstGate)
  const callbacks = []
  let hook = harness.render('/one', async () => { callbacks.push('old') })
  const addFiles = hook.addFiles
  hook.addFiles([file('a'), file('b')])
  const running = hook.start()
  await tick()
  hook = harness.render('/one', async () => { callbacks.push('new') })
  assert.equal(hook.addFiles, addFiles)
  assert.equal(hook.items.length, 2)
  assert.equal(hook.running, true)
  firstGate.resolve()
  await running
  assert.deepEqual(callbacks, ['new', 'new'])
  assert.equal(harness.begins(), 1)
  assert.equal(harness.releases(), 1)
  harness.cleanup()
})

test('hook unmount aborts and releases immediately; late completion cannot refresh or start waiting items', async () => {
  const harness = hookHarness()
  const gate = deferred()
  harness.gates.push(gate)
  let refreshes = 0
  const hook = harness.render('/one', async () => { refreshes++ })
  hook.addFiles([file('a'), file('b')])
  const running = hook.start()
  await tick()
  harness.cleanup()
  assert.equal(harness.uploads[0].signal.aborted, true)
  assert.equal(harness.held(), false)
  assert.equal(harness.releases(), 1)
  gate.resolve()
  await running
  assert.equal(harness.uploads.length, 1)
  assert.equal(refreshes, 0)
  assert.equal(harness.releases(), 1)
})

test('hook path change disposes the old queue and decodes the new path exactly once', async () => {
  const harness = hookHarness()
  const gate = deferred()
  harness.gates.push(gate)
  let oldRefreshes = 0, newRefreshes = 0
  let hook = harness.render('/old', async () => { oldRefreshes++ })
  hook.addFiles([file('old'), file('waiting')])
  const oldRun = hook.start()
  await tick()
  hook = harness.render('/new%20folder/%2520', async () => { newRefreshes++ })
  assert.equal(harness.uploads[0].signal.aborted, true)
  assert.equal(hook.items.length, 0)
  hook.addFiles([file('new')])
  await hook.start()
  gate.resolve()
  await oldRun
  assert.equal(harness.uploads.length, 2)
  assert.equal(harness.uploads[1].path, '/new folder/%20')
  assert.equal(oldRefreshes, 0)
  assert.equal(newRefreshes, 1)
  harness.cleanup()
})

test('hook supports Strict Mode effect cleanup and setup replay', async () => {
  const harness = hookHarness()
  let refreshes = 0
  const hook = harness.render('/', async () => { refreshes++ })
  harness.cleanup()
  harness.replayEffects()
  hook.addFiles([file('a')])
  await hook.start()
  assert.equal(harness.uploads.length, 1)
  assert.equal(refreshes, 1)
  assert.equal(harness.held(), false)
  harness.cleanup()
})
