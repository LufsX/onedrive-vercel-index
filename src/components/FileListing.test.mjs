import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { rawFileUrl } from '../utils/rawFileUrl.ts'

const require = createRequire(import.meta.url)
let response
let layoutProps
const translate = text => text
const passthrough = ({ children }) => children
const overrides = {
  './ClientConfigProvider': { useClientConfig: () => ({ siteConfig: { protectedRoutes: [] } }) },
  './ClientProviders': { useTranslations: () => translate },
  '../ClientProviders': { useTranslations: () => translate },
  '../uiStyles': { uiButton: 'button', uiPanel: 'panel' },
  './uiStyles': { uiButton: 'button', uiPanel: 'panel' },
  './DirectoryBody.module.css': { default: {} },
  '../utils/fetchWithSWR': { useProtectedSWRInfinite: () => response },
  '../utils/useLocalStorage': { default: () => [{ name: 'List' }, () => {}, true] },
  '../utils/protectedRouteHandler': { getStoredToken: () => null },
  '../utils/navigationTarget': { navigationTargets: { get: () => 'folder' } },
  '../utils/getPreviewType': { getPreviewType: () => undefined, preview: {} },
  '../utils/rawFileUrl': { rawFileUrl },
  './UploadProvider': { useUploads: () => ({ registerRefresh: () => () => {} }) },
  './FileManager': { FileManagerProvider: passthrough, CreateFolderButton: () => null },
  './SwitchLayout': { default: () => null, layouts: [{ name: 'List' }] },
  './UploadControls': { default: () => null },
  './Breadcrumb': { default: () => null },
  './FeatureBoundary': { default: passthrough },
  './previews/Containers': { PreviewContainer: passthrough },
  './previews/PreviewToolbar': { PreviewToolbarTarget: React.createContext(null) },
  './Loading': { default: () => 'Loading', LoadingIcon: () => null },
  './folder/DirectoryBody.module.css': { default: {} },
  'next/navigation': {
    useRouter: () => ({ replace() {} }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
  },
  'next/dynamic': {
    default: loader => () =>
      React.createElement('div', { 'data-preview': String(loader).includes('FourOhFour') ? '404' : 'other' }),
  },
}

function load(relative) {
  const compiled = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(
    id => (overrides[id] ? { __esModule: true, ...overrides[id] } : require(id)),
    loaded,
    loaded.exports,
  )
  return loaded.exports.default
}

const DirectoryBody = load('./folder/DirectoryBody.tsx')
const renderLayout = props => {
  layoutProps = props
  return React.createElement(
    DirectoryBody,
    {
      loading: props.loading,
      empty: props.empty,
      refreshing: props.refreshing,
      onRefresh: props.onRefresh,
      placeholder: 'Loading directory',
    },
    props.folderChildren.map(file => React.createElement('span', { key: file.id }, file.name)),
  )
}
overrides['./FolderListLayout'] = { default: renderLayout }
overrides['./FolderGridLayout'] = { default: renderLayout }
overrides['./folder/DirectoryError'] = { default: load('./folder/DirectoryError.tsx') }
const FileListing = load('./FileListing.tsx')

function render(state) {
  response = { size: 1, mutate: async () => {}, setSize: async () => {}, isValidating: false, ...state }
  return renderToStaticMarkup(React.createElement(FileListing))
}
const page = (files, next) => ({
  folder: { value: files.map(name => ({ id: name, name })) },
  ...(next ? { next } : {}),
})

test('initial service and network errors offer retry without claiming the item is missing', () => {
  for (const status of [0, 429, 500, 503]) {
    const html = render({ error: { status } })
    assert.match(html, /role="alert"/)
    assert.match(html, /Retry/)
    assert.doesNotMatch(html, /data-preview="404"/)
  }
  assert.match(render({ error: { status: 404 } }), /data-preview="404"/)
})

test('single-page refresh failures retain files and expose retry through the real listing entry', () => {
  let refreshes = 0
  const html = render({
    data: [page(['report.pdf'])],
    error: { status: 503 },
    mutate: async () => {
      refreshes++
    },
  })
  assert.match(html, /report\.pdf/)
  assert.match(html, /Could not refresh/)
  assert.match(html, /Retry/)
  layoutProps.onRefresh()
  assert.equal(refreshes, 1)
})

test('loading, true empty folders and empty pages with more results remain distinct', () => {
  const loading = render({ data: undefined, isValidating: true })
  assert.match(loading, /Loading directory/)
  assert.doesNotMatch(loading, /This folder is empty/)
  const empty = render({ data: [page([])] })
  assert.match(empty, /This folder is empty/)
  assert.match(empty, /Refresh folder/)
  const partial = render({ data: [page([], 'next-page')] })
  assert.doesNotMatch(partial, /This folder is empty/)
  assert.match(partial, /Load more/)
})

test('pagination errors retain earlier pages and refreshing retains its existing files', () => {
  const failed = render({ data: [page(['kept.txt'], 'next-page')], size: 2, error: { status: 500 } })
  assert.match(failed, /kept\.txt/)
  assert.match(failed, /Could not refresh/)
  assert.doesNotMatch(failed, /Loading directory/)
  const refreshing = render({ data: [page(['kept.txt'])], isValidating: true })
  assert.match(refreshing, /kept\.txt/)
  assert.match(refreshing, /Refreshing/)
  assert.match(refreshing, /aria-busy="true"/)
})
