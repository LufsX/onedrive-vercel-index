import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

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

function load(path, mocks = {}, globals = {}) {
  const filename = new URL(path, import.meta.url)
  const source = readFileSync(filename, 'utf8')
  const compiled = compileOnce(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText
  const loaded = { exports: {} }
  vm.runInNewContext(
    compiled,
    {
      ...globals,
      module: loaded,
      exports: loaded.exports,
      require: name => {
        assert.ok(Object.hasOwn(mocks, name), `Unexpected import: ${name}`)
        return mocks[name]
      },
    },
    { filename: filename.pathname },
  )
  return loaded.exports
}

const adminErrors = load('../../../utils/adminErrors.ts')
const configuration = {
  passwordHash: `scrypt:16384:8:1:${'a'.repeat(32)}:${'b'.repeat(128)}`,
  sessionSecret: 'c'.repeat(64),
}
const password = 'new-admin-password'
const fallback = 'Could not generate administrator configuration.'
const json = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data })
const nodes = (type, props) => (typeof type === 'function' ? type(props) : { ...props, tag: type })

function find(node, type, result = []) {
  if (!node || typeof node !== 'object') return result
  if (Array.isArray(node)) {
    node.forEach(child => find(child, type, result))
    return result
  }
  if (node.tag === type) result.push(node)
  find(node.children, type, result)
  return result
}

function content(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (Array.isArray(node)) return Array.from(node, content).join('')
  if (typeof node === 'object') return content(node.children)
  return String(node)
}

function button(tree, label) {
  const match = find(tree, 'button').find(node => content(node) === label)
  assert.ok(match, `Missing button: ${label}`)
  return match
}

function formatDropdown(tree) {
  const match = find(tree, 'dropdown')[0]
  assert.ok(match, 'Missing configuration format control')
  return match
}

function fixture({ status = 'uninitialized', search = '', fetch = async () => json(configuration) } = {}) {
  const states = []
  const dependencies = []
  const requests = []
  const logins = []
  const destinations = []
  let stateCursor = 0
  let effectCursor = 0
  let effects = []
  let dirty = false
  let refreshes = 0

  const Page = load(
    './page.tsx',
    {
      react: {
        useState: initial => {
          const index = stateCursor++
          if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
          return [
            states[index],
            value => {
              const next = typeof value === 'function' ? value(states[index]) : value
              if (!Object.is(states[index], next)) {
                states[index] = next
                dirty = true
              }
            },
          ]
        },
        useEffect: (effect, deps) => {
          const index = effectCursor++
          const previous = dependencies[index]
          if (!previous || !deps || deps.some((value, offset) => !Object.is(value, previous[offset]))) {
            dependencies[index] = deps
            effects.push(effect)
          }
        },
      },
      'react/jsx-runtime': { jsx: nodes, jsxs: nodes, Fragment: 'fragment' },
      'next/navigation': { useRouter: () => ({ push: path => destinations.push(path) }) },
      'lucide-react': { ArrowRight: 'arrow-right', Check: 'check', ChevronDown: 'chevron-down' },
      '../../../components/SetupShell': {
        __esModule: true,
        default: 'setup-shell',
        SetupStatus: 'setup-status',
        SetupSessionState: 'setup-session-state',
      },
      '../../../components/Loading': { LoadingIcon: 'loading-icon' },
      '../../../components/uiStyles': { uiButton: '', uiFieldLabel: '', uiInput: '', uiPrimaryButton: '' },
      // Headless UI cannot render inside the VM harness, so the control is stubbed
      // and the tests drive onSelect() the way the real component would.
      '../../../components/Dropdown': { __esModule: true, default: props => nodes('dropdown', props) },
      '../../../components/ClientProviders': { useTranslations: () => value => value },
      '../../../utils/useAdminSession': {
        __esModule: true,
        default: () => ({
          status,
          refresh: async () => {
            refreshes++
          },
          login: async value => {
            logins.push(value)
          },
        }),
      },
      '../../../utils/adminErrors': adminErrors,
    },
    {
      URLSearchParams,
      window: { location: { search } },
      fetch: async (url, options) => {
        requests.push([url, options])
        return fetch(url, options)
      },
    },
  ).default

  function render() {
    let tree
    let passes = 0
    do {
      assert.ok(++passes < 10, 'Render/effect loop did not settle')
      stateCursor = 0
      effectCursor = 0
      effects = []
      dirty = false
      tree = Page()
      effects.forEach(effect => effect())
    } while (dirty)
    return tree
  }

  return { render, requests, logins, destinations, refreshes: () => refreshes }
}

function fillPasswords(view, value = password, confirmation = value) {
  const inputs = find(view.render(), 'input')
  assert.equal(inputs.length, 2)
  for (const input of inputs) {
    assert.equal(input.type, 'password')
    assert.equal(input.autoComplete, 'new-password')
    assert.equal(input.required, true)
    assert.equal(input.minLength, 8)
  }
  inputs[0].onChange({ target: { value } })
  inputs[1].onChange({ target: { value: confirmation } })
}

async function submit(view) {
  const form = find(view.render(), 'form')[0]
  assert.ok(form, 'Missing form')
  let prevented = false
  await form.onSubmit({
    preventDefault() {
      prevented = true
    },
  })
  assert.equal(prevented, true)
  return view.render()
}

function assertSetupRequest(view) {
  assert.equal(view.requests.length, 1)
  const [[url, options]] = view.requests
  assert.equal(url, '/api/admin/setup')
  assert.equal(options.method, 'POST')
  assert.equal(options.headers['Content-Type'], 'application/json')
  assert.equal(options.headers['X-Requested-With'], 'XMLHttpRequest')
  assert.deepEqual(JSON.parse(options.body), { password })
  assert.deepEqual(view.logins, [])
  assert.deepEqual(view.destinations, [])
}

test('without ADMIN_PASSWORD_HASH, uninitialized shows the setup hint, generation form and skip action', () => {
  // The session status models an absent hash; no environment files are read.
  const view = fixture()
  const tree = view.render()
  assert.equal(tree.title, 'Generate password configuration')
  assert.ok(
    find(tree, 'setup-status').some(
      node =>
        content(node) === 'Set ADMIN_PASSWORD_HASH to enable administrator functions, or skip for read-only OAuth.',
    ),
  )
  assert.equal(find(tree, 'form').length, 1)
  assert.equal(find(tree, 'input').length, 2)
  assert.equal(button(tree, 'Skip administrator setup (read-only OAuth)').disabled, false)
  assert.deepEqual(view.requests, [])
})

test('uninitialized can skip to step-1 or return to the canonical next=step-3 destination', () => {
  for (const [search, expected] of [
    ['', '/onedrive-vercel-index-oauth/step-1'],
    ['?next=step-3', '/onedrive-vercel-index-oauth/step-3'],
    ['?next=https://untrusted.example', '/onedrive-vercel-index-oauth/step-1'],
  ]) {
    const view = fixture({ search })
    button(view.render(), 'Skip administrator setup (read-only OAuth)').onClick()
    assert.deepEqual(view.destinations, [expected])
    assert.deepEqual(view.requests, [])
    assert.deepEqual(view.logins, [])
  }
})

test('anonymous cannot skip either the login form or explicit generation mode', () => {
  for (const search of ['', '?generate=1']) {
    const view = fixture({ status: 'anonymous', search })
    const tree = view.render()
    assert.ok(!find(tree, 'button').some(node => content(node).includes('Skip administrator setup')))
    assert.ok(!find(tree, 'button').some(node => content(node) === 'Proceed to OAuth'))
    assert.equal(find(tree, 'setup-session-state').length, 0)
    assert.deepEqual(view.destinations, [])
    if (!search) {
      assert.equal(tree.title, 'Administrator login')
      assert.equal(find(tree, 'input')[0].autoComplete, 'current-password')
      button(tree, 'Generate password configuration')
    } else {
      assert.equal(tree.title, 'Generate password configuration')
      assert.ok(find(tree, 'input').every(input => input.autoComplete === 'new-password'))
    }
  }
})

test('authenticated retains the generation entry and can generate again without logging in', async () => {
  const view = fixture({ status: 'authenticated' })
  const initial = view.render()
  button(initial, 'Proceed to OAuth')
  button(initial, 'Generate password configuration').onClick()
  fillPasswords(view)
  const generated = await submit(view)
  assertSetupRequest(view)
  assert.equal(find(generated, 'textarea').length, 1)

  button(generated, 'Generate again').onClick()
  const again = view.render()
  assert.equal(find(again, 'textarea').length, 0)
  assert.equal(find(again, 'form').length, 1)
  assert.ok(find(again, 'input').every(input => input.value === ''))
  fillPasswords(view)
  await submit(view)
  assert.equal(view.requests.length, 2)
  assert.deepEqual(view.logins, [])
  assert.equal(view.refreshes(), 0)
})

test('?generate=1 directly generates using only the new password, regardless of current session', async t => {
  for (const status of ['anonymous', 'authenticated']) {
    await t.test(status, async () => {
      const view = fixture({ status, search: '?generate=1' })
      assert.equal(view.render().title, 'Generate password configuration')
      fillPasswords(view)
      const tree = await submit(view)
      assertSetupRequest(view)
      assert.equal(find(tree, 'textarea').length, 1)
      assert.equal(find(tree, 'form').length, 0)
      assert.equal(find(tree, 'input').length, 0)
      assert.ok(!content(tree).includes(password))
    })
  }
})

test('mismatched password confirmation refuses the setup request and exposes a field error', async () => {
  const view = fixture({ status: 'anonymous', search: '?generate=1' })
  fillPasswords(view, password, 'different-password')
  const tree = await submit(view)
  assert.deepEqual(view.requests, [])
  assert.deepEqual(view.logins, [])
  assert.equal(find(tree, 'form')[0]['aria-busy'], false)
  assert.equal(find(tree, 'setup-status').find(node => node.tone === 'error').children, 'Passwords do not match.')
  assert.ok(find(tree, 'div').some(node => node.id === 'admin-error'))
  assert.ok(
    find(tree, 'input').every(input => input['aria-invalid'] === true && input['aria-describedby'] === 'admin-error'),
  )
  assert.equal(button(tree, 'Generate configuration').disabled, false)
})

test('successful generation renders exact colon-format env configuration and raw Vercel values', async () => {
  const view = fixture()
  fillPasswords(view)
  const tree = await submit(view)
  assertSetupRequest(view)
  const textarea = find(tree, 'textarea')[0]
  assert.equal(textarea.readOnly, true)
  assert.equal(textarea.autoComplete, 'off')
  assert.equal(
    textarea.value,
    `ADMIN_PASSWORD_HASH=${configuration.passwordHash}\nADMIN_SESSION_SECRET=${configuration.sessionSecret}`,
  )
  assert.match(textarea.value, /^ADMIN_PASSWORD_HASH=scrypt:16384:8:1:[a-f0-9]{32}:[a-f0-9]{128}\n/)
  assert.ok(!/["'\\$]/.test(textarea.value))
  assert.ok(
    find(tree, 'setup-status').some(
      node =>
        node.tone === 'success' &&
        content(node) ===
          'Replace these environment variables and restart or redeploy. Generating them does not change the current password.',
    ),
  )
  const format = formatDropdown(tree)
  // Array.from keeps the comparison in this realm; VM arrays have a foreign prototype.
  assert.deepEqual(
    Array.from(format.items, option => option.value),
    ['env', 'vercel'],
  )
  assert.equal(format.items[format.selectedIndex].value, 'env')

  format.onSelect(format.items[1])
  const vercel = view.render()
  assert.equal(find(vercel, 'textarea').length, 0)
  assert.ok(content(vercel).includes('In Vercel, paste each value without quotes or backslashes.'))
  const inputs = find(vercel, 'input')
  assert.deepEqual(
    inputs.map(input => input.value),
    [configuration.passwordHash, configuration.sessionSecret],
  )
  for (const [index, name] of ['ADMIN_PASSWORD_HASH', 'ADMIN_SESSION_SECRET'].entries()) {
    assert.ok(
      find(vercel, 'label').some(
        label => content(label) === name && find(label, 'input')[0]?.value === inputs[index].value,
      ),
    )
    assert.equal(inputs[index].readOnly, true)
    assert.equal(inputs[index].autoComplete, 'off')
    assert.ok(!/["'\\$]/.test(inputs[index].value))
  }

  const backToEnv = formatDropdown(vercel)
  backToEnv.onSelect(backToEnv.items[0])
  assert.equal(find(view.render(), 'textarea')[0].value, textarea.value)
  assert.equal(view.requests.length, 1)
})

test('generation failures show mapped safe errors or the setup fallback, never upstream secrets', async t => {
  const secret = 'redis://user:private-password@private.example'
  for (const [name, fetch, expected] of [
    [
      'known API code',
      async () => json({ error: 'redis_not_configured', message: secret }, 503),
      'Redis is not configured. Set REDIS_URL and redeploy.',
    ],
    ['unknown API error', async () => json({ error: secret, message: secret }, 500), fallback],
    ['rate limit', async () => json({ error: secret }, 429), 'Too many requests. Try again later.'],
    [
      'unreadable error body',
      async () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error(secret)
        },
      }),
      fallback,
    ],
    [
      'network error',
      async () => {
        throw new Error(secret)
      },
      fallback,
    ],
    [
      'unreadable success body',
      async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error(secret)
        },
      }),
      fallback,
    ],
  ]) {
    await t.test(name, async () => {
      const view = fixture({ fetch })
      fillPasswords(view)
      const tree = await submit(view)
      assertSetupRequest(view)
      assert.equal(find(tree, 'setup-status').find(node => node.tone === 'error').children, expected)
      assert.ok(!content(tree).includes(secret))
      assert.equal(find(tree, 'textarea').length, 0)
      assert.equal(find(tree, 'form')[0]['aria-busy'], false)
      assert.equal(button(tree, 'Generate configuration').disabled, false)
      assert.ok(find(tree, 'input').every(input => input.disabled === false))
    })
  }
})

test('malformed successful configuration payloads never render environment values', async t => {
  for (const [name, data] of [
    ['null', null],
    ['missing fields', {}],
    ['non-string hash', { ...configuration, passwordHash: 123 }],
    ['legacy dollar-format hash', { ...configuration, passwordHash: configuration.passwordHash.replaceAll(':', '$') }],
    ['invalid hash length', { ...configuration, passwordHash: configuration.passwordHash.slice(0, -1) }],
    ['invalid secret', { ...configuration, sessionSecret: '"unsafe\\value"' }],
  ]) {
    await t.test(name, async () => {
      const view = fixture({ fetch: async () => json(data) })
      fillPasswords(view)
      const tree = await submit(view)
      assertSetupRequest(view)
      assert.equal(find(tree, 'setup-status').find(node => node.tone === 'error').children, fallback)
      assert.equal(find(tree, 'textarea').length, 0)
      assert.equal(find(tree, 'dropdown').length, 0)
      assert.equal(find(tree, 'form')[0]['aria-busy'], false)
    })
  }
})
