import assert from 'node:assert/strict'
import { test } from 'node:test'
import { searchResultPath } from './searchResultPath.ts'

test('search links retain repeated shared directory names and enforce segment boundaries', () => {
  assert.equal(
    searchResultPath('/drive/root:/Share/docs/Share/reports', 'report.pdf', '/Share'),
    '/docs/Share/reports/report.pdf',
  )
  assert.equal(searchResultPath('/drive/root:/Shared/docs', 'report.pdf', '/Share'), null)
  assert.equal(searchResultPath('/drives/example/root:/share/docs', 'report.pdf', '/Share/'), '/docs/report.pdf')
  assert.equal(searchResultPath('/drive/root:', 'file.txt', '/'), '/file.txt')
})

test('search links encode names exactly once and reject malformed or unsafe paths', () => {
  assert.equal(
    searchResultPath('/drive/root:/%E5%85%B1%E4%BA%AB/100%25', 'a%20 #?.txt', '/共享'),
    '/100%25/a%2520%20%23%3F.txt',
  )
  for (const path of ['/drive/root:/Share/%FF', '/drive/root:/Share/%2F', '/drive/root:/Share/..', '/other/Share']) {
    assert.equal(searchResultPath(path, 'file.txt', '/Share'), null)
  }
  assert.equal(searchResultPath('/drive/root:/Share', '../file.txt', '/Share'), null)
})
