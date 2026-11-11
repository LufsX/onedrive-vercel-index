import assert from 'node:assert/strict'
import { test } from 'node:test'
import { downloadFiles } from './downloadQueue.ts'

test('downloads are bounded, each file is retained once and progress tracks completed bodies', async t => {
  let active = 0
  let maximum = 0
  t.mock.method(globalThis, 'fetch', async url => {
    maximum = Math.max(maximum, ++active)
    await new Promise(resolve => setTimeout(resolve, 5))
    return {
      ok: true,
      blob: async () => {
        active--
        return new Blob([url])
      },
    }
  })
  const files = Array.from({ length: 10 }, (_, index) => ({ url: `file-${index}` }))
  const consumed = []
  const progress = []
  await downloadFiles(
    files,
    new AbortController(),
    (file, blob) => consumed.push([file.url, blob.size]),
    completed => progress.push(completed),
  )
  assert.ok(maximum > 1 && maximum <= 3)
  assert.deepEqual(consumed.map(([url]) => url).sort(), files.map(file => file.url).sort())
  assert.deepEqual(
    progress,
    Array.from({ length: 10 }, (_, index) => index + 1),
  )
  assert.ok(consumed.every(([, size]) => size > 0))
})

test('one failed file cancels pending reads and prevents later work', async t => {
  let requested = 0
  let cancelled = 0
  t.mock.method(globalThis, 'fetch', async (url, { signal }) => {
    requested++
    if (url === 'bad') return { ok: false, status: 500 }
    return new Promise((resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          cancelled++
          reject(signal.reason)
        },
        { once: true },
      )
    })
  })
  const controller = new AbortController()
  const files = ['pending', 'bad', 'later', 'never'].map(url => ({ url }))
  await assert.rejects(
    downloadFiles(
      files,
      controller,
      () => assert.fail('No file finished'),
      () => {},
    ),
    /Download failed: 500/,
  )
  assert.equal(controller.signal.aborted, true)
  assert.equal(cancelled, 1)
  assert.ok(requested <= 3)
})

test('cancellation closes a streamed directory and never consumes late responses', async t => {
  const controller = new AbortController()
  let closed = false
  async function* files() {
    try {
      for (let index = 0; index < 10; index++) yield { url: String(index) }
    } finally {
      closed = true
    }
  }
  t.mock.method(globalThis, 'fetch', async () => {
    controller.abort()
    return { ok: true, blob: async () => new Blob(['late']) }
  })
  await assert.rejects(
    downloadFiles(
      files(),
      controller,
      () => assert.fail('Cancelled file was consumed'),
      () => {},
    ),
    { name: 'AbortError' },
  )
  assert.equal(closed, true)
})
