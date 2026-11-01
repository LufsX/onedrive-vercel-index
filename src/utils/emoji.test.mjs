import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')

// Transpiling dominates fixture setup, so compile each source once per test file.
const transpileCache = new Map()
function compileOnce(source, config) {
  const key = JSON.stringify(config ?? {}) + '\u0000' + source
  let output = transpileCache.get(key)
  if (output === undefined) {
    output = ts.transpileModule(source, config).outputText
    transpileCache.set(key, output)
  }
  return { outputText: output }
}
const code = compileOnce(readFileSync(new URL('./emoji.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const loaded = { exports: {} }
new Function('module', 'exports', code)(loaded, loaded.exports)
const { firstEmoji } = loaded.exports

test('emoji at the start of a name is returned as one grapheme', () => {
  assert.equal(firstEmoji('📁 Documents'), '📁')
  assert.equal(firstEmoji('😀😀.txt'), '😀')
  assert.equal(firstEmoji('👨‍👩‍👧 family.txt'), '👨‍👩‍👧')
  assert.equal(firstEmoji('🇨🇳 flag.txt'), '🇨🇳')
  assert.equal(firstEmoji('👍🏽 tone.txt'), '👍🏽')
  assert.equal(firstEmoji('1️⃣ one.txt'), '1️⃣')
  assert.equal(firstEmoji('❤️ heart.txt'), '❤️')
})

test('emoji only counts when the name starts with it', () => {
  assert.equal(firstEmoji('a😀mid.txt'), undefined)
  assert.equal(firstEmoji('此文件😀.txt'), undefined)
  assert.equal(firstEmoji('test.txt'), undefined)
  assert.equal(firstEmoji(''), undefined)
})

test('digits and text presentation symbols are not treated as icons', () => {
  assert.equal(firstEmoji('3.14.txt'), undefined)
  assert.equal(firstEmoji('1.2.3.txt'), undefined)
  assert.equal(firstEmoji('#tag.txt'), undefined)
  assert.equal(firstEmoji('© 2024.pdf'), undefined)
  assert.equal(firstEmoji('™ t.txt'), undefined)
})
