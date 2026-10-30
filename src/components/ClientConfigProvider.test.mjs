import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('./ClientConfigProvider.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText
const loaded = { exports: {} }
new Function('require', 'module', 'exports', compiled)(require, loaded, loaded.exports)
const { ConfigProvider, useClientConfig } = loaded.exports

const siteConfig = {
  userPrincipalName: 'owner@example.com',
  icon: '/icon.png',
  title: 'Runtime title',
  baseDirectory: '/Runtime',
  footer: 'Footer',
  protectedRoutes: ['/private'],
  email: '',
  links: [],
  datetimeFormat: 'YYYY',
}
const apiConfig = {
  clientId: 'runtime-client',
  redirectUri: 'http://localhost',
  authApi: 'https://example.com/token',
  driveApi: 'https://example.com/drive',
  scope: 'files.read',
}

function Reader() {
  return React.createElement('pre', null, JSON.stringify(useClientConfig()))
}

function render(site, api) {
  return renderToStaticMarkup(
    React.createElement(ConfigProvider, { siteConfig: site, apiConfig: api }, React.createElement(Reader)),
  )
}

test('reads each provider value and retains only whitelisted fields', () => {
  const first = render({ ...siteConfig, kvPrefix: 'secret-prefix', unexpected: 'site-extra' }, {
    ...apiConfig, cacheControlHeader: 'secret-header', unexpected: 'api-extra',
  })
  assert.match(first, /Runtime title/)
  assert.match(first, /runtime-client/)
  assert.doesNotMatch(first, /secret-prefix|secret-header|site-extra|api-extra|kvPrefix|cacheControlHeader/)
  const second = render({ ...siteConfig, title: 'Changed' }, { ...apiConfig, clientId: 'changed-client' })
  assert.match(second, /Changed/)
  assert.match(second, /changed-client/)
  assert.doesNotMatch(second, /Runtime title|runtime-client/)
})

test('throws when the provider is absent', () => {
  assert.throws(() => renderToStaticMarkup(React.createElement(Reader)), /ConfigProvider is required/)
})

test('configuration modules are not imported at runtime', () => {
  assert.doesNotMatch(compiled, /require\(["'].*config\/(site|api)\.config/)
})
