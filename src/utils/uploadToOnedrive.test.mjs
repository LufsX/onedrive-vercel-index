import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'

function load(filename, imports = {}, globals = {}) {
  const source = readFileSync(new URL(filename, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', ...Object.keys(globals), compiled)(
    id => { assert.ok(Object.hasOwn(imports, id), 'Unexpected import ' + id); return imports[id] },
    loaded, loaded.exports, ...Object.values(globals),
  )
  return loaded.exports
}
const management = load('./driveManagement.ts')
const MAX = 4 * 1024 * 1024
const CHUNK = 10 * 320 * 1024
const jobId = 'a'.repeat(64)
const uploadUrl = 'https://upload.onedrive.com/session'
const session = () => ({ uploadUrl, expirationDateTime: new Date(Date.now() + 3600000).toISOString() })
const large = () => ({ mode: 'replaceLarge', jobId, ...session() })
const item = (size = 10, extra = {}) => ({
  id: 'old-id', name: 'test.bin', path: '/folder/test.bin', eTag: '"v1"', size, kind: 'file', ...extra,
})
const receipt = (size, extra = {}) => ({
  ok: true, backupName: '.__odvi-backup-original.bin', item: item(size, { id: 'temp-id', eTag: '"v2"' }), ...extra,
})
const file = size => new File([new Uint8Array(size)], 'test.bin')
function setup(overrides = {}) {
  const calls = []
  const replacements = []
  const controller = new AbortController()
  const progress = []
  let put = 0
  const engine = load('./uploadToOnedrive.ts', {
    './driveManagement': management,
    './replaceManagedFile': {
      MAX_REPLACEMENT_BYTES: MAX,
      async replaceManagedFile(...args) {
        replacements.push(args)
        if (overrides.replace) return overrides.replace(...args)
        args[3](args[1].size, args[1].size)
        return { ...args[0], size: args[1].size, eTag: '"v2"' }
      },
    },
  }, {
    async fetch(url, options) {
      calls.push([url, options])
      if (overrides.fetch) return overrides.fetch(url, options)
      if (url === '/api/upload/prepare') return Response.json(overrides.prepare ?? { mode: 'create' })
      if (url === '/api/upload/session') {
        return Response.json(JSON.parse(options.body).size === 0 ? { completed: true } : session())
      }
      if (url === '/api/upload/complete') return Response.json({ ok: true })
      if (url === '/api/upload/replace/commit') {
        return Response.json(receipt(MAX + 3))
      }
      if (++put === 1 && overrides.chunks) return Response.json({ nextExpectedRanges: [CHUNK + '-'] }, { status: 202 })
      return Response.json({ id: 'temp-id' }, { status: 201 })
    },
  })
  const start = size => engine.uploadToOnedrive({
    file: file(size), path: '/folder', signal: controller.signal, onProgress: (...args) => progress.push(args),
  })
  return { ...engine, calls, replacements, controller, progress, start }
}

for (const range of [CHUNK + '-', CHUNK + '-' + (CHUNK + 2)]) {
  test('prepares and creates with fail behavior, then uploads sequential chunks: ' + range, async () => {
    let puts = 0
    const state = setup({ fetch: async url => {
      if (url === '/api/upload/prepare') return Response.json({ mode: 'create' })
      if (url === '/api/upload/session') return Response.json(session())
      if (url === '/api/upload/complete') return Response.json({ ok: true })
      if (++puts === 1) return Response.json({ nextExpectedRanges: [range] }, { status: 202 })
      return Response.json({ id: 'item' }, { status: 201 })
    } })
    await state.start(CHUNK + 3)
    assert.deepEqual(state.calls.map(([url]) => url), [
      '/api/upload/prepare', '/api/upload/session', uploadUrl, uploadUrl, '/api/upload/complete',
    ])
    assert.deepEqual(JSON.parse(state.calls[0][1].body), { path: '/folder', name: 'test.bin', size: CHUNK + 3 })
    assert.deepEqual(JSON.parse(state.calls[1][1].body), {
      path: '/folder', name: 'test.bin', size: CHUNK + 3, conflictBehavior: 'fail',
    })
    for (const [, options] of state.calls.filter(([url]) => url.startsWith('/api/'))) {
      assert.equal(options.headers['X-Requested-With'], 'XMLHttpRequest')
      assert.equal(options.credentials, 'same-origin')
      assert.equal(options.redirect, 'error')
    }
    const chunks = state.calls.filter(([url]) => url === uploadUrl)
    assert.equal(chunks[0][1].headers['Content-Range'], 'bytes 0-' + (CHUNK - 1) + '/' + (CHUNK + 3))
    assert.equal(chunks[1][1].headers['Content-Range'], 'bytes ' + CHUNK + '-' + (CHUNK + 2) + '/' + (CHUNK + 3))
    for (const [, options] of chunks) {
      assert.equal(options.credentials, 'omit')
      assert.equal(options.redirect, 'error')
      assert.equal(options.referrerPolicy, 'no-referrer')
      assert.deepEqual(Object.keys(options.headers).sort(), ['Content-Range', 'Content-Type'])
    }
    assert.deepEqual(state.progress, [[0, CHUNK + 3], [CHUNK, CHUNK + 3], [CHUNK + 3, CHUNK + 3]])
  })
}

test('create uploads accept the actual complete route HTTP 200 JSON contract', async () => {
  const require = createRequire(import.meta.url)
  let cleared = 0, authorized = 0
  const { POST } = load('../app/api/upload/complete/route.ts', {
    'next/server': require('next/server'),
    '../../../../lib/cache': { clearCache() { cleared++ } },
    '../shared': {
      headers: { 'Cache-Control': 'private, no-store' },
      async authorize() { authorized++; return null },
    },
  })
  for (const size of [0, 4]) {
    const state = setup({ fetch: async (url, options) => {
      if (url === '/api/upload/prepare') return Response.json({ mode: 'create' })
      if (url === '/api/upload/session') return Response.json(size === 0 ? { completed: true } : session())
      if (url === '/api/upload/complete') {
        const response = await POST(new Request('https://example.test' + url, options))
        assert.equal(response.status, 200)
        assert.deepEqual(await response.clone().json(), { ok: true })
        return response
      }
      return Response.json({ id: 'new-id' }, { status: 201 })
    } })
    await state.start(size)
    assert.equal(state.calls.filter(([url]) => url === '/api/upload/complete').length, 1)
  }
  assert.equal(cleared, 2)
  assert.equal(authorized, 2)
})

test('ordinary completion requires HTTP 200 and a JSON object with ok exactly true', async () => {
  const invalid = [
    () => new Response(null, { status: 204 }),
    () => Response.json({ ok: true }, { status: 201 }),
    () => Response.json({ ok: true }, { status: 202 }),
    () => new Response('invalid-json', { status: 200 }),
    ...[null, [], {}, { ok: false }, { ok: 'true' }, { ok: 1 }].map(data => () => Response.json(data)),
  ]
  for (const response of invalid) {
    const state = setup({ fetch: async () => response() })
    await assert.rejects(state.completeUpload('/folder', 'test.bin', state.controller.signal), error => {
      assert.ok(error instanceof state.UploadCompletionError)
      assert.equal(error.completion, undefined)
      return true
    })
    assert.equal(state.calls.length, 1)
    assert.equal(state.calls[0][0], '/api/upload/complete')
  }
})

test('creates empty files without chunks and completes normally', async () => {
  const state = setup()
  await state.start(0)
  assert.deepEqual(state.calls.map(([url]) => url), ['/api/upload/prepare', '/api/upload/session', '/api/upload/complete'])
  assert.equal(JSON.parse(state.calls[1][1].body).conflictBehavior, 'fail')
  assert.deepEqual(state.progress, [[0, 0]])
})

test('a same-name race at session creation fails without rename or replacement fallback', async () => {
  const state = setup({ fetch: async url => url === '/api/upload/prepare'
    ? Response.json({ mode: 'create' }) : Response.json({ error: 'conflict' }, { status: 409 }) })
  await assert.rejects(state.start(5), /Unable to create upload session/)
  assert.deepEqual(state.calls.map(([url]) => url), ['/api/upload/prepare', '/api/upload/session'])
  assert.equal(JSON.parse(state.calls[1][1].body).conflictBehavior, 'fail')
  assert.equal(state.replacements.length, 0)
})

for (const size of [0, MAX]) {
  test('silently replaces same-name small files using the XHR helper at size ' + size, async () => {
    const preparedItem = item(MAX * 10)
    const state = setup({ prepare: { mode: 'replaceSmall', item: preparedItem } })
    await state.start(size)
    assert.deepEqual(state.calls.map(([url]) => url), ['/api/upload/prepare'])
    assert.equal(state.replacements.length, 1)
    const [target, replacement, signal] = state.replacements[0]
    assert.deepEqual(target, preparedItem)
    assert.equal(replacement.size, size)
    assert.equal(signal, state.controller.signal)
    assert.deepEqual(state.progress, [[size, size]])
  })
}

test('maps only small replacement write_uncertain to UploadUncertainError; other errors fail normally', async () => {
  for (const code of ['write_uncertain', 'item_changed', 'protected_item', 'file_too_large']) {
    const failure = new management.ManagementError(code)
    const state = setup({ prepare: { mode: 'replaceSmall', item: item() }, replace: () => { throw failure } })
    await assert.rejects(state.start(3), error => code === 'write_uncertain'
      ? error instanceof state.UploadUncertainError : error === failure)
    assert.equal(state.calls.length, 1)
    assert.equal(state.replacements.length, 1)
  }
})

test('large replacement uploads only its temporary session, commits its ID and returns the backup receipt', async () => {
  const state = setup({ prepare: large(), chunks: true })
  const result = await state.start(MAX + 3)
  assert.deepEqual(result, { backupName: receipt(MAX + 3).backupName, item: receipt(MAX + 3).item })
  assert.deepEqual(state.calls.map(([url]) => url), ['/api/upload/prepare', uploadUrl, uploadUrl, '/api/upload/replace/commit'])
  assert.deepEqual(JSON.parse(state.calls.at(-1)[1].body), { jobId, uploadedItemId: 'temp-id' })
  for (const [, options] of state.calls.filter(([url]) => url === uploadUrl)) {
    assert.equal(options.credentials, 'omit')
    assert.equal(options.headers.Authorization, undefined)
    assert.equal(options.headers['X-Requested-With'], undefined)
  }
})

test('large commit failures retain the exact context for finalization-only retry', async () => {
  for (const outcome of ['network', 'json', 'status', 'aborted']) {
    const state = setup({ fetch: async (url, options) => {
      if (url === '/api/upload/prepare') return Response.json(large())
      if (url === '/api/upload/replace/commit') {
        if (outcome === 'network') throw new TypeError('network')
        if (outcome === 'aborted') throw new DOMException('Aborted', 'AbortError')
        if (outcome === 'json') return new Response('bad-json')
        return Response.json({ error: 'write_uncertain' }, { status: 502 })
      }
      const final = options.headers['Content-Range'].endsWith('-' + (MAX + 2) + '/' + (MAX + 3))
      return Response.json(final ? { id: 'temp-id' } : { nextExpectedRanges: [CHUNK + '-'] }, { status: final ? 201 : 202 })
    } })
    await assert.rejects(state.start(MAX + 3), error => {
      assert.ok(error instanceof state.UploadCompletionError)
      assert.deepEqual(error.completion, { jobId, uploadedItemId: 'temp-id' })
      return true
    })
    assert.equal(state.calls.filter(([url]) => url === '/api/upload/replace/commit').length, 1)
  }
})

test('unknown final temporary write preserves job-only context without retrying the PUT', async () => {
  for (const outcome of ['network', 'abort', 'json', 'bad-id', '500', '202', '200']) {
    let puts = 0
    const state = setup({ fetch: async url => {
      if (url === '/api/upload/prepare') return Response.json(large())
      if (++puts === 1) return Response.json({ nextExpectedRanges: [CHUNK + '-'] }, { status: 202 })
      if (outcome === 'network') throw new TypeError('network')
      if (outcome === 'abort') { state.controller.abort(); throw new DOMException('Aborted', 'AbortError') }
      if (outcome === 'json') return new Response('bad-json', { status: 201 })
      if (outcome === 'bad-id') return Response.json({ id: 'bad\nID' }, { status: 201 })
      return Response.json({ id: 'temp-id' }, { status: Number(outcome) })
    } })
    await assert.rejects(state.start(MAX + 3), error => {
      assert.ok(error instanceof state.UploadCompletionError)
      assert.deepEqual(error.completion, { jobId })
      return true
    })
    assert.equal(puts, 2)
    assert.equal(state.calls.some(([url]) => url.includes('/commit')), false)
  }
})

test('validates commit receipts and retains context for every invalid response', async () => {
  const context = { jobId, uploadedItemId: 'temp-id' }
  const invalid = [
    null, {}, { ...receipt(9), ok: false }, { ...receipt(9), backupName: '../escape' },
    { ...receipt(9), backupName: 'test.bin' }, { ...receipt(9), backupName: '.password' },
  ]
  for (const [key, value] of [
    ['id', 'other-id'], ['path', '/elsewhere/test.bin'], ['name', 'else.bin'],
    ['kind', 'folder'], ['size', -1], ['size', '9'], ['eTag', '*'], ['eTag', 'W/"v2"'],
  ]) invalid.push({ ...receipt(9), item: { ...receipt(9).item, [key]: value } })
  for (const data of invalid) {
    const state = setup({ fetch: async () => Response.json(data) })
    await assert.rejects(state.completeUpload('/folder', 'test.bin', state.controller.signal, context), error => {
      assert.ok(error instanceof state.UploadCompletionError)
      assert.deepEqual(error.completion, context)
      return true
    })
    assert.equal(state.calls.length, 1)
  }
})

test('job-only completion can recover the final receipt; malformed contexts never send a request', async () => {
  const state = setup({ fetch: async () => Response.json(receipt(8)) })
  const result = await state.completeUpload('/folder', 'test.bin', state.controller.signal, { jobId })
  assert.equal(result.backupName, receipt(8).backupName)
  assert.deepEqual(JSON.parse(state.calls[0][1].body), { jobId })
  for (const completion of [{ jobId: 'bad' }, { jobId: '*'.repeat(64) }, { jobId, uploadedItemId: '' }]) {
    await assert.rejects(state.completeUpload('/folder', 'test.bin', state.controller.signal, completion), state.UploadCompletionError)
  }
  assert.equal(state.calls.length, 1)
  const cause = new Error('original')
  const error = new state.UploadCompletionError('compatible', { cause, completion: { jobId } })
  assert.equal(error.cause, cause)
  assert.deepEqual(error.completion, { jobId })
})

test('rejects wrong final replacement size even when the commit receipt is otherwise valid', async () => {
  const state = setup({ prepare: large(), chunks: true, fetch: async (url, options) => {
    if (url === '/api/upload/prepare') return Response.json(large())
    if (url === '/api/upload/replace/commit') return Response.json(receipt(1))
    return Response.json(options.headers['Content-Range'].startsWith('bytes 0-')
      ? { nextExpectedRanges: [CHUNK + '-'] } : { id: 'temp-id' },
    { status: options.headers['Content-Range'].startsWith('bytes 0-') ? 202 : 201 })
  } })
  await assert.rejects(state.start(MAX + 3), error => error instanceof state.UploadCompletionError &&
    error.completion.uploadedItemId === 'temp-id')
})

test('rejects malformed prepare modes, target metadata and large job IDs without any write', async () => {
  const invalid = [
    null, {}, { mode: 'rename' }, { mode: 'replaceSmall', item: item(2, { kind: 'folder' }) },
    { mode: 'replaceSmall', item: item(2, { path: '/outside/test.bin' }) },
    { mode: 'replaceSmall', item: item(2, { eTag: '*' }) },
    { mode: 'replaceLarge', jobId: 'bad', ...session() },
  ]
  for (const prepared of invalid) {
    const state = setup({ fetch: async () => Response.json(prepared) })
    await assert.rejects(state.start(prepared?.mode === 'replaceSmall' ? 3 : MAX + 1), /Invalid upload preparation/)
    assert.equal(state.calls.length, 1)
    assert.equal(state.replacements.length, 0)
  }
  for (const prepared of [
    { mode: 'replaceSmall', item: item() }, large(),
  ]) {
    const state = setup({ prepare: prepared })
    await assert.rejects(state.start(prepared.mode === 'replaceSmall' ? MAX + 1 : 1), /Invalid upload preparation/)
    assert.equal(state.calls.length, 1)
  }
})

test('rejects expired or untrusted sessions, including spoofed trusted hosts', async () => {
  for (const patch of [
    { uploadUrl: 'http://upload.onedrive.com/x' }, { uploadUrl: 'https://upload.onedrive.com.evil.test/x' },
    { uploadUrl: 'https://upload.evil.test/x' }, { uploadUrl: 'https://user:pass@upload.onedrive.com/x' },
    { uploadUrl: 'https://upload.onedrive.com:444/x' }, { uploadUrl: uploadUrl + '#fragment' },
    { expirationDateTime: 'invalid' }, { expirationDateTime: '2000-01-01' }, { expirationDateTime: null },
  ]) {
    const state = setup({ prepare: { ...large(), ...patch } })
    await assert.rejects(state.start(MAX + 3), /Invalid upload session/)
    assert.equal(state.calls.length, 1)
  }
})

test('prepare errors and pre-aborted requests do not fall back or write', async () => {
  for (const code of ['protected_item', 'unsupported_item', 'write_uncertain']) {
    const state = setup({ fetch: async () => Response.json({ error: code }, { status: 403 }) })
    await assert.rejects(state.start(1), error => code === 'write_uncertain'
      ? error instanceof state.UploadUncertainError : !(error instanceof state.UploadUncertainError))
    assert.equal(state.calls.length, 1)
  }
  const state = setup()
  state.controller.abort()
  await assert.rejects(state.start(1), { name: 'AbortError' })
  assert.equal(state.calls.length, 0)
})

test('empty create with lost or malformed write receipts remains uncertain', async () => {
  for (const outcome of ['network', 'json', '500', 'invalid', 'unexpected-status']) {
    const state = setup({ fetch: async url => {
      if (url === '/api/upload/prepare') return Response.json({ mode: 'create' })
      if (outcome === 'network') throw new TypeError('lost response')
      if (outcome === 'json') return new Response('bad-json')
      if (outcome === '500') return new Response(null, { status: 500 })
      if (outcome === 'unexpected-status') return Response.json({ completed: true }, { status: 201 })
      return Response.json({ completed: false })
    } })
    await assert.rejects(state.start(0), state.UploadUncertainError)
    assert.equal(state.calls.length, 2)
  }
})

test('malformed prepare JSON and unexpected successful commit statuses fail closed', async () => {
  const state = setup({ fetch: async () => new Response('bad-json') })
  await assert.rejects(state.start(3), /Invalid upload preparation/)
  assert.equal(state.calls.length, 1)
  for (const status of [201, 202]) {
    const state = setup({ fetch: async () => Response.json(receipt(3), { status }) })
    await assert.rejects(state.completeUpload('/folder', 'test.bin', state.controller.signal, {
      jobId, uploadedItemId: 'temp-id',
    }), state.UploadCompletionError)
    assert.equal(state.calls.length, 1)
  }
})

test('create chunk recovery queries the offset before retrying and never sends credentials', async () => {
  let puts = 0
  const state = setup({ fetch: async (url, options) => {
    if (url === '/api/upload/prepare') return Response.json({ mode: 'create' })
    if (url === '/api/upload/session') return Response.json(session())
    if (url === '/api/upload/complete') return Response.json({ ok: true })
    if (!options.method) return Response.json({ nextExpectedRanges: ['0-3'] })
    if (++puts === 1) throw new TypeError('network')
    return Response.json({ id: 'new-id' }, { status: 201 })
  } })
  await state.start(4)
  assert.deepEqual(state.calls.map(([, options]) => options.method ?? 'GET'), ['POST', 'POST', 'PUT', 'GET', 'PUT', 'POST'])
  assert.equal(state.calls[3][1].credentials, 'omit')
})

test('rejects invalid or unexpected chunk ranges without completing', async () => {
  for (const range of ['1-', CHUNK + '-' + (CHUNK - 1), CHUNK + '-' + (CHUNK + 3), CHUNK + '-NaN', '9007199254740993-']) {
    const state = setup({ fetch: async url => {
      if (url === '/api/upload/prepare') return Response.json({ mode: 'create' })
      if (url === '/api/upload/session') return Response.json(session())
      return Response.json({ nextExpectedRanges: [range] }, { status: 202 })
    } })
    await assert.rejects(state.start(CHUNK + 3), /(?:Invalid|Unexpected) upload offset/)
    assert.equal(state.calls.some(([url]) => url === '/api/upload/complete'), false)
  }
})

test('cancellation interrupts chunk retry delay without completing', async () => {
  const state = setup({ fetch: async url => {
    if (url === '/api/upload/prepare') return Response.json({ mode: 'create' })
    if (url === '/api/upload/session') return Response.json(session())
    queueMicrotask(() => state.controller.abort())
    return new Response(null, { status: 503 })
  } })
  await assert.rejects(state.start(4), { name: 'AbortError' })
  assert.equal(state.calls.some(([url]) => url === '/api/upload/complete'), false)
})

test('lost create final response is uncertain; confirmed upload plus failed completion is completionFailed', async () => {
  for (const mode of ['uncertain', 'completion']) {
    const state = setup({ fetch: async (url, options) => {
      if (url === '/api/upload/prepare') return Response.json({ mode: 'create' })
      if (url === '/api/upload/session') return Response.json(session())
      if (url === '/api/upload/complete') return new Response(null, { status: 503 })
      if (mode === 'uncertain') {
        if (options.method === 'PUT') throw new TypeError('network')
        return new Response(null, { status: 404 })
      }
      return Response.json({ id: 'new-id' }, { status: 201 })
    } })
    await assert.rejects(state.start(4), error => mode === 'uncertain'
      ? error instanceof state.UploadUncertainError : error instanceof state.UploadCompletionError)
  }
})
