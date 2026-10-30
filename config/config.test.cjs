const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')

function load(file, env = {}, browser = false) {
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !key.startsWith('NEXT_PUBLIC_') && key !== 'KV_PREFIX'))
  return spawnSync(process.execPath, ['-e',
    `${browser ? 'global.window = {};' : ''} console.log(JSON.stringify(require('./config/${file}.config.js')))`,
  ], { cwd: require('node:path').join(__dirname, '..'), env: { ...cleanEnv, ...env }, encoding: 'utf8' })
}
function config(file, env, browser) {
  const result = load(file, env, browser)
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

test('defaults and all runtime overrides', () => {
  const defaults = config('site')
  assert.equal(defaults.title, '一个假的网盘')
  assert.equal(defaults.maxItems, 100)
  assert.deepEqual(defaults.protectedRoutes, [])
  const site = config('site', {
    NEXT_PUBLIC_USER_PRINCIPLE_NAME: 'user', NEXT_PUBLIC_ICON: 'icon', KV_PREFIX: 'private:',
    NEXT_PUBLIC_SITE_TITLE: '', NEXT_PUBLIC_BASE_DIRECTORY: '/base', NEXT_PUBLIC_MAX_ITEMS: '200',
    NEXT_PUBLIC_GOOGLE_FONT_SANS: 'sans', NEXT_PUBLIC_GOOGLE_FONT_MONO: 'mono',
    NEXT_PUBLIC_GOOGLE_FONT_LINKS: '["font"]', NEXT_PUBLIC_FOOTER: 'footer',
    NEXT_PUBLIC_PROTECTED_ROUTES: '["/secret"]', NEXT_PUBLIC_EMAIL: '',
    NEXT_PUBLIC_LINKS: '[{"name":"n","link":"l"}]', NEXT_PUBLIC_DATETIME_FORMAT: 'format',
  })
  assert.deepEqual(site, {
    userPrincipalName: 'user', icon: 'icon', kvPrefix: 'private:', title: '一个假的网盘', baseDirectory: '/base',
    maxItems: 200, googleFontSans: 'sans', googleFontMono: 'mono', googleFontLinks: ['font'],
    footer: 'footer', protectedRoutes: ['/secret'], email: '', links: [{ name: 'n', link: 'l' }],
    datetimeFormat: 'format',
  })
  assert.deepEqual(config('api', {
    NEXT_PUBLIC_CLIENT_ID: 'id', NEXT_PUBLIC_REDIRECT_URI: 'http://localhost', NEXT_PUBLIC_AUTH_API: 'https://example.com/auth',
    NEXT_PUBLIC_DRIVE_API: 'https://example.com/drive', NEXT_PUBLIC_SCOPE: 'scope', NEXT_PUBLIC_CACHE_CONTROL_HEADER: 'cache',
  }), { clientId: 'id', redirectUri: 'http://localhost', authApi: 'https://example.com/auth', driveApi: 'https://example.com/drive', scope: 'scope', cacheControlHeader: 'cache' })
  assert.equal(config('api').clientId, '6280202a-1acd-47d6-b311-7a6367163699')
})

test('rejects invalid structured values', () => {
  for (const [name, values] of Object.entries({
    NEXT_PUBLIC_BASE_DIRECTORY: ['', 'relative', '/../secret', '/a//b'],
    NEXT_PUBLIC_MAX_ITEMS: ['', '0', '201', '1.0', '2x', '-1', ' 1'],
    NEXT_PUBLIC_PROTECTED_ROUTES: ['oops', '{}', '[1]', '["relative"]', '["/a//b"]', '["/../b"]', '["/a\\\\b"]'],
    NEXT_PUBLIC_GOOGLE_FONT_LINKS: ['null', '[1]'],
    NEXT_PUBLIC_LINKS: ['[{"name":"x"}]', '[{"name":1,"link":"x"}]', '[{"name":"n","link":"l","extra":true}]'],
  })) {
    for (const value of values) {
      const result = load('site', { [name]: value })
      assert.notEqual(result.status, 0, `${name}=${value}`)
      assert.match(result.stderr, new RegExp(name))
    }
  }
})

test('rejects invalid API URLs', () => {
  for (const name of ['NEXT_PUBLIC_REDIRECT_URI', 'NEXT_PUBLIC_AUTH_API', 'NEXT_PUBLIC_DRIVE_API']) {
    for (const value of ['', 'relative', 'javascript:alert(1)', 'https://user:pass@example.com/']) {
      const result = load('api', { [name]: value })
      assert.notEqual(result.status, 0, `${name}=${value}`)
      assert.match(result.stderr, new RegExp(name))
    }
  }
})

test('browser cannot read server environment', () => {
  const site = config('site', { KV_PREFIX: 'secret-marker', NEXT_PUBLIC_SITE_TITLE: 'runtime' }, true)
  assert.equal(site.kvPrefix, '')
  assert.equal(site.title, '一个假的网盘')
})
