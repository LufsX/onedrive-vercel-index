import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const code = ts.transpileModule(readFileSync(new URL('./driveManagement.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const item = { id: 'file-id', name: 'file.txt', path: '/Public/file.txt', eTag: '"v1"', size: 10, kind: 'file' }
const signal = () => new AbortController().signal
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })

function load(fetch) {
  const loaded = { exports: {} }
  new Function('module', 'exports', 'fetch', code)(loaded, loaded.exports, fetch)
  return loaded.exports
}

test('management requests stay same-origin with CSRF headers and decoded JSON paths', async () => {
  const path = '/Public/a%20 #中.txt'
  const api = load(async (url, options) => {
    assert.equal(url, '/api/manage/inspect')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers['X-Requested-With'], 'XMLHttpRequest')
    assert.equal(options.cache, 'no-store')
    assert.deepEqual(JSON.parse(options.body), { path, id: item.id })
    return json({ item: { ...item, path, name: 'a%20 #中.txt' } })
  })
  assert.equal((await api.inspectManagedItem(path, item.id, signal())).path, path)
})

test('inspection rejects a different target identity, location, type, size or invalid entity tag', async () => {
  for (const patch of [
    { id: 'other' },
    { path: '/outside/file.txt' },
    { kind: 'shortcut' },
    { size: -1 },
    { size: 0.5 },
    { eTag: '*' },
    { eTag: 'W/"v1"' },
  ]) {
    const api = load(async () => json({ item: { ...item, ...patch } }))
    await assert.rejects(api.inspectManagedItem(item.path, item.id, signal()), { code: 'item_changed' })
  }
})

test('folder creation validates returned identity and location before reporting success', async () => {
  const folder = { ...item, id: 'folder-id', name: 'New', path: '/Public/New', kind: 'folder', size: 0 }
  const api = load(async (url, options) => {
    assert.equal(url, '/api/manage/folders')
    assert.deepEqual(JSON.parse(options.body), { path: '/Public', name: 'New' })
    return json({ item: folder }, 201)
  })
  assert.deepEqual(await api.createManagedFolder('/Public', 'New', signal()), folder)
  for (const patch of [{ path: '/Other/New' }, { name: 'New 1' }, { kind: 'file' }, { eTag: '' }]) {
    const malformed = load(async () => json({ item: { ...folder, ...patch } }, 201))
    await assert.rejects(malformed.createManagedFolder('/Public', 'New', signal()), { code: 'write_uncertain' })
  }
})

test('folder creation handles the shared root without a double slash', async () => {
  const api = load(async () => json({ item: { ...item, name: 'New', path: '/New', kind: 'folder' } }, 201))
  assert.equal((await api.createManagedFolder('/', 'New', signal())).path, '/New')
})

test('delete submits the confirmed snapshot and accepts only an explicit matching receipt', async () => {
  const api = load(async (url, options) => {
    assert.equal(url, '/api/manage/delete')
    assert.deepEqual(JSON.parse(options.body), { path: item.path, id: item.id, eTag: item.eTag })
    return json({ deleted: true, id: item.id })
  })
  await api.deleteManagedFile(item, signal())
  for (const receipt of [{}, { deleted: false, id: item.id }, { deleted: true, id: 'other' }]) {
    const malformed = load(async () => json(receipt))
    await assert.rejects(malformed.deleteManagedFile(item, signal()), { code: 'write_uncertain' })
  }
})

test('management errors preserve conflicts and do not expose upstream text', async () => {
  const conflict = load(async () => json({ error: 'item_changed', token: 'private' }, 412))
  await assert.rejects(conflict.deleteManagedFile(item, signal()), { code: 'item_changed', message: 'item_changed' })
  const unknown = load(async () => json({ error: 'upstream secret URL' }, 500))
  await assert.rejects(unknown.deleteManagedFile(item, signal()), {
    code: 'write_uncertain',
    message: 'write_uncertain',
  })
})

test('lost write responses and invalid JSON never report success', async () => {
  for (const response of [
    () => {
      throw new Error('network')
    },
    () => new Response('not JSON', { status: 200 }),
  ]) {
    const api = load(response)
    await assert.rejects(api.createManagedFolder('/Public', 'New', signal()), { code: 'write_uncertain' })
    await assert.rejects(api.deleteManagedFile(item, signal()), { code: 'write_uncertain' })
    await assert.rejects(api.inspectManagedItem(item.path, item.id, signal()), { code: 'upstream_unavailable' })
  }
})
