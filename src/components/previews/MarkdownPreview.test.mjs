import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

const require = createRequire(import.meta.url)
let content = ''
const passthrough = ({ children }) => React.createElement('div', null, children)
const mocks = {
  'react-markdown': { default: ReactMarkdown },
  'remark-gfm': { default: remarkGfm },
  'remark-math': { default: remarkMath },
  'rehype-katex': { default: rehypeKatex },
  'katex/dist/katex.min.css': {},
  '../../utils/rawFileUrl': { rawFileUrl: path => path },
  '../../utils/protectedRouteHandler': { getStoredToken: () => null },
  '../../utils/fetchOnMount': { default: () => ({ response: content, error: null, validating: false }) },
  '../ClientProviders': { useTranslations: () => text => text },
  '../ClientConfigProvider': { useClientConfig: () => ({ siteConfig: { protectedRoutes: [] } }) },
  '../FourOhFour': { default: () => null },
  '../Loading': { default: () => null },
  '../DownloadBtnGtoup': { default: () => null },
  './Containers': { PreviewContainer: passthrough, DownloadBtnContainer: passthrough },
}
const source = readFileSync(new URL('./MarkdownPreview.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText
const loadedModule = { exports: {} }
new Function('require', 'module', 'exports', compiled)(
  id => Object.hasOwn(mocks, id) ? { __esModule: true, ...mocks[id] } : require(id),
  loadedModule,
  loadedModule.exports,
)
const MarkdownPreview = loadedModule.exports.default

function render(markdown) {
  content = markdown
  return renderToStaticMarkup(React.createElement(MarkdownPreview, {
    file: { name: 'test.md' },
    path: '/folder/test.md',
    standalone: true,
  }))
}

test('shows code while syntax highlighting loads', () => {
  const html = render('```js\nconst answer = 42\n```')
  assert.match(html, /const answer = 42/)
})

test('drops untrusted HTML and unsafe Markdown URLs', () => {
  const html = render(`<script>alert(1)</script>

<img src=x onerror="alert(2)">

<svg><script>alert(3)</script></svg>

<iframe srcdoc="<script>alert(4)</script>"></iframe>

[unsafe](javascript:alert%281%29)

![unsafe](javascript:alert%281%29)`)
  assert.doesNotMatch(html, /<script|<svg|<iframe|onerror|javascript:/i)
})

test('renders Markdown, GFM, relative URLs and inline and display math', () => {
  const html = render(`# Heading

**bold** and ~~removed~~ and [link](docs/page.md)

![image](images/a.png)

Inline $x^2$.

$$
y = x + 1
$$`)
  assert.match(html, /<h1>Heading<\/h1>/)
  assert.match(html, /<strong>bold<\/strong>/)
  assert.match(html, /<del>removed<\/del>/)
  assert.match(html, /href="\/folder\/docs\/page.md"/)
  assert.match(html, /src="\/folder\/images\/a.png"/)
  assert.match(html, /class="katex"/)
  assert.match(html, /class="katex-display"/)
})
