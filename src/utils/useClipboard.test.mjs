import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const compiled = ts.transpileModule(readFileSync(new URL('./useClipboard.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function fixture(writeText, fallback) {
  let removed = 0
  let appended = 0
  const area = {
    style: {},
    setAttribute() {},
    select() {},
    remove() {
      removed++
    },
  }
  const document = {
    activeElement: null,
    createElement: () => area,
    body: {
      appendChild() {
        appended++
      },
    },
    execCommand: fallback,
  }
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', 'navigator', 'document', 'HTMLElement', compiled)(
    require,
    loaded,
    loaded.exports,
    { clipboard: { writeText } },
    document,
    class {},
  )
  return { copy: loaded.exports.copyText, removed: () => removed, appended: () => appended }
}

test('a confirmed clipboard write succeeds without using the fallback', async () => {
  let written
  const f = fixture(
    async text => {
      written = text
    },
    () => assert.fail('Fallback was used'),
  )
  assert.equal(await f.copy('link'), true)
  assert.equal(written, 'link')
  assert.equal(f.appended(), 0)
})

test('fallback results determine success and its temporary input is always removed', async () => {
  for (const result of [true, false]) {
    const f = fixture(
      async () => {
        throw new Error('Denied')
      },
      () => result,
    )
    assert.equal(await f.copy('link'), result)
    assert.equal(f.removed(), 1)
  }
  const f = fixture(
    async () => {
      throw new Error('Denied')
    },
    () => {
      throw new Error('Unsupported')
    },
  )
  assert.equal(await f.copy('link'), false)
  assert.equal(f.removed(), 1)
})
