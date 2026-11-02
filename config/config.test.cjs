const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')

function load(file, env = {}, browser = false) {
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith('NEXT_PUBLIC_') && key !== 'KV_PREFIX' && key !== 'ADMIN_PASSWORD_HASH',
    ),
  )
  return spawnSync(
    process.execPath,
    [
      '-e',
      `${browser ? 'global.window = {};' : ''} console.log(JSON.stringify(require('./config/${file}.config.js')))`,
    ],
    { cwd: require('node:path').join(__dirname, '..'), env: { ...cleanEnv, ...env }, encoding: 'utf8' },
  )
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
    NEXT_PUBLIC_USER_PRINCIPLE_NAME: 'user',
    NEXT_PUBLIC_ICON: 'icon',
    KV_PREFIX: 'private:',
    NEXT_PUBLIC_SITE_TITLE: '',
    NEXT_PUBLIC_BASE_DIRECTORY: '/base',
    NEXT_PUBLIC_MAX_ITEMS: '200',
    NEXT_PUBLIC_GOOGLE_FONT_SANS: 'sans',
    NEXT_PUBLIC_GOOGLE_FONT_MONO: 'mono',
    NEXT_PUBLIC_GOOGLE_FONT_LINKS: '["font"]',
    NEXT_PUBLIC_FOOTER: 'footer',
    NEXT_PUBLIC_PROTECTED_ROUTES: '["/secret"]',
    NEXT_PUBLIC_EMAIL: '',
    NEXT_PUBLIC_LINKS: '[{"name":"n","link":"l"}]',
    NEXT_PUBLIC_DATETIME_FORMAT: 'format',
  })
  assert.deepEqual(site, {
    userPrincipalName: 'user',
    icon: 'icon',
    kvPrefix: 'private:',
    title: '一个假的网盘',
    baseDirectory: '/base',
    maxItems: 200,
    googleFontSans: 'sans',
    googleFontMono: 'mono',
    googleFontLinks: ['font'],
    footer: 'footer',
    protectedRoutes: ['/secret'],
    email: '',
    links: [{ name: 'n', link: 'l' }],
    datetimeFormat: 'format',
  })
  assert.deepEqual(
    config('api', {
      NEXT_PUBLIC_CLIENT_ID: 'id',
      NEXT_PUBLIC_REDIRECT_URI: 'http://localhost',
      NEXT_PUBLIC_AUTH_API: 'https://example.com/auth',
      NEXT_PUBLIC_DRIVE_API: 'https://example.com/drive',
      NEXT_PUBLIC_SCOPE: 'scope',
      NEXT_PUBLIC_CACHE_CONTROL_HEADER: 'cache',
      ADMIN_PASSWORD_HASH: 'configured-hash',
    }),
    {
      clientId: 'id',
      redirectUri: 'http://localhost',
      authApi: 'https://example.com/auth',
      driveApi: 'https://example.com/drive',
      scope: 'scope',
      cacheControlHeader: 'cache',
    },
  )
  assert.equal(config('api').clientId, '6280202a-1acd-47d6-b311-7a6367163699')
  assert.equal(config('api').scope, 'user.read files.read offline_access')
  assert.equal(
    config('api', { ADMIN_PASSWORD_HASH: 'configured-hash' }).scope,
    'user.read files.readwrite offline_access',
  )
})

test('scope overrides cannot request write permissions without an admin password hash', () => {
  for (const hash of [undefined, '']) {
    const env = { NEXT_PUBLIC_SCOPE: 'files.readwrite.all mail.send' }
    if (hash !== undefined) env.ADMIN_PASSWORD_HASH = hash
    assert.equal(config('api', env).scope, 'user.read files.read offline_access')
  }
  assert.equal(
    config('api', {
      ADMIN_PASSWORD_HASH: 'configured-hash',
      NEXT_PUBLIC_SCOPE: 'custom.scope',
    }).scope,
    'custom.scope',
  )
  assert.equal(
    config(
      'api',
      {
        ADMIN_PASSWORD_HASH: 'server-only-hash',
        NEXT_PUBLIC_SCOPE: 'files.readwrite.all',
      },
      true,
    ).scope,
    'user.read files.read offline_access',
  )
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

test('third-party content is operator-defined, generic and validated', () => {
  assert.deepEqual(config('thirdParty'), { headLinks: [], scripts: [], vercelAnalytics: false })

  const configured = config('thirdParty', {
    NEXT_PUBLIC_THIRD_PARTY_LINKS:
      '[{"rel":"dns-prefetch","href":"https://www.googletagmanager.com"},{"rel":"preconnect","href":"https://client.crisp.chat","crossOrigin":true},{"rel":"preconnect","href":"https://cdn.example.com","crossOrigin":"anonymous"}]',
    NEXT_PUBLIC_THIRD_PARTY_SCRIPTS:
      '[{"id":"ga","src":"https://www.googletagmanager.com/gtag/js?id=G-TEST"},{"id":"ga-init","content":"window.dataLayer=window.dataLayer||[];gtag(\\"config\\",\\"G-TEST\\")","strategy":"afterInteractive"},{"id":"late","content":"window.late=true"}]',
    NEXT_PUBLIC_VERCEL_ANALYTICS: 'true',
  })
  assert.equal(configured.headLinks.length, 3)
  assert.deepEqual(configured.headLinks[0], { rel: 'dns-prefetch', href: 'https://www.googletagmanager.com' })
  // A bare crossOrigin renders as an empty attribute, which is what reuses a connection.
  assert.equal(configured.headLinks[1].crossOrigin, '')
  assert.equal(configured.headLinks[2].crossOrigin, 'anonymous')
  assert.equal(configured.scripts.length, 3)
  assert.equal(configured.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-TEST')
  assert.equal(configured.scripts[0].strategy, 'lazyOnload')
  assert.equal(configured.scripts[1].strategy, 'afterInteractive')
  assert.equal(configured.scripts[1].content, 'window.dataLayer=window.dataLayer||[];gtag("config","G-TEST")')
  assert.equal(configured.scripts[1].src, undefined)
  assert.equal(configured.scripts[2].strategy, 'lazyOnload')
  assert.equal(configured.vercelAnalytics, true)
  assert.equal(config('thirdParty', { NEXT_PUBLIC_VERCEL_ANALYTICS: 'false' }).vercelAnalytics, false)

  for (const [name, values] of Object.entries({
    NEXT_PUBLIC_THIRD_PARTY_LINKS: [
      '{',
      '{}',
      '[1]',
      'null',
      '[{"rel":"preload"}]',
      '[{"rel":"script","href":"https://cdn.example.com/a.js"}]',
      '[{"rel":"preconnect","href":"javascript:alert(1)"}]',
      '[{"rel":"preconnect","href":"https://user:pass@cdn.example.com"}]',
      '[{"rel":"preconnect","href":"https://cdn.example.com","extra":1}]',
      '[{"rel":"preconnect","href":"https://cdn.example.com","crossOrigin":"maybe"}]',
    ],
    NEXT_PUBLIC_THIRD_PARTY_SCRIPTS: [
      'null',
      '{}',
      '[{"src":"https://cdn.example.com/a.js"}]',
      '[{"id":"a"}]',
      '[{"id":"a","src":"https://cdn.example.com/a.js","content":"x"}]',
      '[{"id":"bad id","content":"x"}]',
      '[{"id":"a","content":1}]',
      '[{"id":"a","src":"ftp://cdn.example.com/a.js"}]',
      '[{"id":"a","content":"x","strategy":"immediate"}]',
      '[{"id":"a","src":"https://cdn.example.com/a.js","junk":true}]',
      '[{"id":"a","src":"https://cdn.example.com/a.js"},{"id":"a","src":"https://cdn.example.com/b.js"}]',
    ],
    NEXT_PUBLIC_VERCEL_ANALYTICS: ['yes', '1', 'TRUE'],
  })) {
    for (const value of values) {
      const result = load('thirdParty', { [name]: value })
      assert.notEqual(result.status, 0, `${name}=${value}`)
      assert.match(result.stderr, new RegExp(name))
    }
  }
})

test('paste mistakes are reported with an actionable message', () => {
  for (const name of ['NEXT_PUBLIC_THIRD_PARTY_LINKS', 'NEXT_PUBLIC_THIRD_PARTY_SCRIPTS']) {
    const result = load('thirdParty', { [name]: "'[]'" })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /must not be wrapped in quotes/)
  }

  // .env files need \$ and unescape it; a value that never went through a .env file
  // keeps the backslash, so the config warns instead of shipping broken JavaScript.
  const script = JSON.stringify([{ id: 'x', content: 'window.\\$x=1' }])
  const result = load('thirdParty', { NEXT_PUBLIC_THIRD_PARTY_SCRIPTS: script })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stderr, /keep the backslash only for values read from a \.env file/)
})
