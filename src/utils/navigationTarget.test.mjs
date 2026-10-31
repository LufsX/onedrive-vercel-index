import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const code = ts.transpileModule(readFileSync(new URL('./navigationTarget.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const loaded = { exports: {} }
new Function('module', 'exports', code)(loaded, loaded.exports)
const { canonicalNavigationPath, createNavigationTargetCache } = loaded.exports

test('root is always a known folder and direct links start unknown', () => {
  const cache = createNavigationTargetCache()
  assert.equal(cache.get('/'), 'folder')
  assert.equal(cache.get('/direct-link.txt'), undefined)
  cache.remember('/', 'file')
  assert.equal(cache.get('/'), 'folder')
})

test('folder responses register the current folder and every child type', () => {
  const cache = createNavigationTargetCache()
  cache.rememberFolder('/Shared%20files', [
    { name: 'report.pdf' },
    { name: 'photos', folder: { childCount: 0 } },
    { name: '.password' },
  ])
  assert.equal(cache.get('/Shared files'), 'folder')
  assert.equal(cache.get('/Shared%20files/report.pdf'), 'file')
  assert.equal(cache.get('/Shared%20files/photos'), 'folder')
  assert.equal(cache.get('/Shared%20files/.password'), 'file')
})

test('encoded parent paths and literal percent names retain distinct identities', () => {
  const cache = createNavigationTargetCache()
  cache.rememberFolder('/100%25/%E4%B8%AD/', [
    { name: 'a%20.txt' },
    { name: 'a .txt', folder: {} },
    { name: '中 😀 #?+.txt' },
    { name: '%2F.txt' },
  ])
  assert.equal(cache.get('/100%25/中/a%2520.txt'), 'file')
  assert.equal(cache.get('/100%25/中/a%20.txt'), 'folder')
  assert.equal(cache.get('/100%25/中/' + encodeURIComponent('中 😀 #?+.txt')), 'file')
  assert.equal(cache.get('/100%25/中/%252F.txt'), 'file')
  assert.equal(cache.get('/100%25/中/%2F.txt'), undefined)
  assert.equal(cache.get('/100%25/中/a%252520.txt'), undefined)
})

test('canonical paths normalize encoding without changing encoded segment boundaries or Unicode identities', () => {
  assert.equal(canonicalNavigationPath('//folder///%e4%b8%ad/'), '/folder/%E4%B8%AD')
  assert.equal(canonicalNavigationPath('/中/😀'), '/%E4%B8%AD/%F0%9F%98%80')
  assert.equal(canonicalNavigationPath('/a%2fb'), '/a%2Fb')
  assert.notEqual(canonicalNavigationPath('/a%2Fb'), canonicalNavigationPath('/a/b'))
  assert.notEqual(canonicalNavigationPath('/é'), canonicalNavigationPath('/e\u0301'))
})

test('malformed percent sequences and unpaired surrogates cannot throw or destabilize keys', () => {
  for (const path of ['/100%', '/%zz', '/%FF', '/%E4%B8', '/%41%FF', '/\uD800', '/\uDC00']) {
    const key = canonicalNavigationPath(path)
    assert.equal(canonicalNavigationPath(key), key)
    const cache = createNavigationTargetCache()
    cache.rememberFolder(path, [{ name: 'bad\uD800%name' }])
    assert.equal(cache.get(path), 'folder')
    assert.equal(cache.get(key + '/bad%EF%BF%BD%25name'), 'file')
  }
})

test('actual responses replace earlier type hints at the same canonical path', () => {
  const cache = createNavigationTargetCache()
  cache.rememberFolder('/', [{ name: 'item.txt' }])
  assert.equal(cache.get('/item.txt'), 'file')
  cache.rememberFolder('/item.txt', [{ name: 'nested' }])
  assert.equal(cache.get('/item.txt'), 'folder')
  assert.equal(cache.get('/item.txt/nested'), 'file')
  cache.remember('/item.txt', 'file')
  assert.equal(cache.get('/item.txt'), 'file')
})

test('the cache evicts oldest records after 1024 distinct paths and reuses existing paths', () => {
  const cache = createNavigationTargetCache()
  for (let index = 0; index < 1024; index++) cache.remember('/' + index, 'file')
  cache.remember('/%30', 'folder')
  cache.remember('/new', 'file')
  assert.equal(cache.get('/0'), 'folder')
  assert.equal(cache.get('/1'), undefined)
  assert.equal(cache.get('/2'), 'file')
  assert.equal(cache.get('/new'), 'file')
  assert.equal(cache.get('/'), 'folder')
})

test('large folder responses keep the current directory within the bounded cache', () => {
  const cache = createNavigationTargetCache()
  cache.rememberFolder(
    '/large',
    Array.from({ length: 1100 }, (_, index) => ({ name: String(index) })),
  )
  assert.equal(cache.get('/large'), 'folder')
  assert.equal(cache.get('/large/0'), undefined)
  assert.equal(cache.get('/large/1099'), 'file')
})
