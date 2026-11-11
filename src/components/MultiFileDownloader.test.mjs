import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import JSZip from 'jszip'
import { downloadFiles } from '../utils/downloadQueue.ts'

const require = createRequire(import.meta.url)
const compiled = ts.transpileModule(readFileSync(new URL('./MultiFileDownloader.tsx', import.meta.url), 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

test('bounded downloads produce complete flat and nested ZIPs, including the shared root', async t => {
  const readerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'FileReader')
  class Reader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(
        result => {
          this.result = result
          this.onload({ target: this })
        },
        error => this.onerror(error),
      )
    }
  }
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: Reader })
  t.after(() => {
    if (readerDescriptor) Object.defineProperty(globalThis, 'FileReader', readerDescriptor)
    else delete globalThis.FileReader
  })
  t.mock.method(globalThis, 'fetch', async url => new Response(`Contents of ${url}`))
  let archive
  const overrides = {
    'react-hot-toast': { default: { loading() {} } },
    '../utils/downloadQueue': { downloadFiles },
    '../utils/fetchWithSWR': { fetcher() {} },
    '../utils/protectedRouteHandler': { getStoredToken: () => null },
    './uiStyles': { uiIconButton: '' },
    './ClientProviders': { useTranslations: () => text => text },
  }
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', 'document', 'window', compiled)(
    id => (overrides[id] ? { __esModule: true, ...overrides[id] } : require(id)),
    loaded,
    loaded.exports,
    { createElement: () => ({ style: {}, click() {}, remove() {} }), body: { appendChild() {} } },
    {
      URL: {
        createObjectURL: blob => {
          archive = blob
          return 'blob:test'
        },
        revokeObjectURL() {},
      },
    },
  )
  await loaded.exports.downloadMultipleFiles({
    controller: new AbortController(),
    toastId: 'flat',
    files: [
      { name: 'a.txt', url: '/a' },
      { name: 'b.txt', url: '/b' },
    ],
  })
  let zip = await JSZip.loadAsync(await archive.arrayBuffer())
  assert.equal(await zip.file('a.txt').async('string'), 'Contents of /a')
  assert.equal(await zip.file('b.txt').async('string'), 'Contents of /b')
  for (const basePath of ['/', '/shared']) {
    const prefix = basePath === '/' ? '' : basePath
    async function* files() {
      yield { name: 'docs', path: `${prefix}/docs`, isFolder: true }
      yield { name: 'same.txt', path: `${prefix}/docs/same.txt`, url: '/nested', isFolder: false }
      yield { name: 'same.txt', path: `${prefix}/same.txt`, url: '/root', isFolder: false }
      yield { name: 'empty', path: `${prefix}/empty`, isFolder: true }
    }
    await loaded.exports.downloadTreelikeMultipleFiles({
      controller: new AbortController(),
      toastId: 'tree',
      files: files(),
      basePath,
    })
    zip = await JSZip.loadAsync(await archive.arrayBuffer())
    assert.equal(await zip.file('docs/same.txt').async('string'), 'Contents of /nested')
    assert.equal(await zip.file('same.txt').async('string'), 'Contents of /root')
    assert.equal(zip.files['empty/'].dir, true)
  }
})
