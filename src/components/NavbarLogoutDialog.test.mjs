import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const nodes = (type, props) => ({ ...props, type })

function loadComponent(path, mocks) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(
    name => {
      assert.ok(mocks[name], name)
      return mocks[name]
    },
    loaded,
    loaded.exports,
  )
  return loaded.exports.default
}

function find(node, type, result = []) {
  if (!node || typeof node !== 'object') return result
  if (Array.isArray(node)) {
    node.forEach(child => find(child, type, result))
    return result
  }
  if (node.type === type) result.push(node)
  find(node.children, type, result)
  find(node.footer, type, result)
  return result
}

function renderDialog({ uploading = false, busy = false, open = true } = {}) {
  const calls = []
  const stored = new Map([['/private', 'password']])
  const previousStorage = globalThis.localStorage
  const previousWindow = globalThis.window
  globalThis.localStorage = {
    getItem: key => stored.get(key) ?? null,
    removeItem: key => {
      calls.push(['remove', key])
      stored.delete(key)
    },
  }
  globalThis.window = { dispatchEvent: event => calls.push(['event', event.detail]) }
  const admin = {
    status: 'authenticated',
    busy,
    uploading,
    logout: async () => {
      calls.push(['logout'])
    },
  }
  const mocks = {
    react: { useState: value => [value, () => {}] },
    'react/jsx-runtime': { jsx: nodes, jsxs: nodes },
    'next/navigation': { useRouter: () => ({ refresh: () => calls.push(['refresh']) }) },
    './AppDialog': { __esModule: true, default: 'app-dialog' },
    './uiStyles': { uiButton: '', uiDangerButton: '' },
    'lucide-react': { KeyRound: 'key', LogOut: 'logout-icon', Trash2: 'trash' },
    'react-hot-toast': { __esModule: true, default: { success: () => {} } },
    './ClientConfigProvider': { useClientConfig: () => ({ siteConfig: { protectedRoutes: ['/private'] } }) },
    './ClientProviders': { useTranslations: () => value => value },
    '../utils/useAdminSession': { __esModule: true, default: () => admin },
  }
  const Dialog = loadComponent('./NavbarLogoutDialog.tsx', mocks)
  const tree = Dialog({ open, onClose: () => calls.push(['close']), tokenPresent: true })
  return {
    calls,
    tree,
    buttons: find(tree, 'button'),
    restore: () => {
      globalThis.localStorage = previousStorage
      globalThis.window = previousWindow
    },
  }
}

test('administrator logout and folder token clearing are independent', async () => {
  const view = renderDialog()
  try {
    const [logout, clear] = view.buttons
    await logout.onClick()
    assert.deepEqual(view.calls, [['logout'], ['close']])
    view.calls.length = 0
    clear.onClick()
    assert.deepEqual(view.calls, [['remove', '/private'], ['event', '/private'], ['close'], ['refresh']])
  } finally {
    view.restore()
  }
})

test('upload disables both logout actions until it finishes', () => {
  const view = renderDialog({ uploading: true })
  try {
    const [logout, clear] = view.buttons
    assert.equal(logout.disabled, true)
    assert.equal(clear.disabled, true)
    assert.deepEqual(view.calls, [])
  } finally {
    view.restore()
  }
})

test('busy logout blocks dismissal and a closed dialog stays available for its leave transition', () => {
  const view = renderDialog({ busy: true, open: false })
  try {
    assert.equal(view.tree.type, 'app-dialog')
    assert.equal(view.tree.open, false)
    assert.equal(view.tree.closeDisabled, true)
    const [logout, , close] = view.buttons
    assert.equal(logout.disabled, true)
    assert.equal(close.disabled, true)
  } finally {
    view.restore()
  }
})

test('shared dialog guards every close entry point and delegates cleanup to afterLeave', () => {
  const calls = []
  const AppDialog = loadComponent('./AppDialog.tsx', {
    react: { Fragment: 'fragment' },
    'react/jsx-runtime': { jsx: nodes, jsxs: nodes },
    '@headlessui/react': {
      Dialog: 'dialog',
      DialogPanel: 'panel',
      DialogTitle: 'title',
      Transition: 'transition',
      TransitionChild: 'transition-child',
    },
    'lucide-react': { X: 'x' },
    './ClientProviders': { useTranslations: () => value => value },
    './uiStyles': { uiIconButton: '', uiPanel: '' },
  })
  const initialFocus = { current: null }
  const props = {
    open: true,
    title: 'Test',
    children: 'Body',
    onClose: () => calls.push('close'),
    afterLeave: () => calls.push('left'),
    initialFocus,
  }
  const busy = AppDialog({ ...props, closeDisabled: true })
  find(busy, 'dialog')[0].onClose()
  find(busy, 'button')[0].onClick()
  assert.deepEqual(calls, [])
  assert.equal(find(busy, 'button')[0].disabled, true)
  assert.equal(find(busy, 'dialog')[0].initialFocus, initialFocus)

  const active = AppDialog(props)
  find(active, 'dialog')[0].onClose()
  find(active, 'button')[0].onClick()
  assert.deepEqual(calls, ['close', 'close'])
  const leaving = AppDialog({ ...props, open: false })
  assert.equal(leaving.show, false)
  assert.equal(find(leaving, 'panel').length, 1)
  leaving.afterLeave()
  assert.deepEqual(calls, ['close', 'close', 'left'])
})

function navbarView(admin = { status: 'authenticated', busy: false }) {
  const states = []
  let cursor = 0
  const Navbar = loadComponent('./Navbar.tsx', {
    react: {
      useState: initial => {
        const index = cursor++
        if (!(index in states)) states[index] = initial
        return [
          states[index],
          value => {
            states[index] = typeof value === 'function' ? value(states[index]) : value
          },
        ]
      },
      useEffect: () => {},
      useCallback: callback => callback,
      useId: () => 'login-form',
      useRef: current => ({ current }),
    },
    'react/jsx-runtime': { jsx: nodes, jsxs: nodes },
    'lucide-react': { LogIn: 'login-icon', LogOut: 'logout-icon', Mail: 'mail-icon', Search: 'search-icon' },
    'react-hot-toast': { Toaster: 'toaster' },
    'next/link': { __esModule: true, default: 'link' },
    'next/image': { __esModule: true, default: 'image' },
    'next/dynamic': {
      __esModule: true,
      default: loader => (loader.toString().includes('./SearchModal') ? 'search-modal' : 'logout-dialog'),
    },
    './ClientConfigProvider': {
      useClientConfig: () => ({ siteConfig: { protectedRoutes: [], links: [], icon: '/icon.png', title: 'Test' } }),
    },
    './ClientProviders': { useTranslations: () => value => value },
    './BrandIconsProvider': { useBrandIcons: () => ({}) },
    './BrandIcon': { __esModule: true, default: 'brand-icon' },
    './SwitchLang': { __esModule: true, default: 'switch-lang' },
    './FeatureBoundary': { __esModule: true, default: 'boundary' },
    './AppDialog': { __esModule: true, default: 'app-dialog' },
    './Loading': { LoadingIcon: 'loading-icon' },
    './uiStyles': { uiButton: '', uiFieldLabel: '', uiInput: '', uiPrimaryButton: '' },
    '../utils/useDeviceOS': { __esModule: true, default: () => 'mac' },
    '../utils/useAdminSession': { __esModule: true, default: () => admin },
  })
  return () => {
    cursor = 0
    return Navbar()
  }
}

test('Navbar retains lazy search and logout components when closed so leave animations can finish', () => {
  const render = navbarView()
  const initial = render()
  assert.equal(find(initial, 'search-modal').length, 0)
  assert.equal(find(initial, 'logout-dialog').length, 0)

  find(initial, 'button')[0].onClick()
  const search = find(render(), 'search-modal')[0]
  assert.equal(search.searchOpen, true)
  search.setSearchOpen(false)
  assert.equal(find(render(), 'search-modal')[0].searchOpen, false)

  find(render(), 'button')
    .find(button => button['aria-label'] === 'Logout')
    .onClick()
  const logout = find(render(), 'logout-dialog')[0]
  assert.equal(logout.open, true)
  logout.onClose()
  assert.equal(find(render(), 'logout-dialog')[0].open, false)
})

test('login keeps its password until afterLeave and blocks closing or submitting while busy', async () => {
  let loginCalls = 0
  const admin = {
    status: 'anonymous',
    busy: false,
    login: async () => {
      loginCalls++
    },
  }
  const render = navbarView(admin)
  find(render(), 'button')
    .find(button => button['aria-label'] === 'Administrator login')
    .onClick()
  find(render(), 'input')[0].onChange({ target: { value: 'test-password' } })

  admin.busy = true
  const busy = find(render(), 'app-dialog')[0]
  busy.onClose()
  await find(busy, 'form')[0].onSubmit({ preventDefault() {} })
  assert.equal(find(render(), 'app-dialog')[0].open, true)
  assert.equal(loginCalls, 0)
  assert.equal(
    find(busy, 'button').find(button => button.type === 'button' && button.form).form,
    find(busy, 'form')[0].id,
  )

  admin.busy = false
  find(render(), 'app-dialog')[0].onClose()
  const leaving = find(render(), 'app-dialog')[0]
  assert.equal(leaving.open, false)
  assert.equal(find(leaving, 'input')[0].value, 'test-password')
  leaving.afterLeave()
  assert.equal(find(render(), 'input')[0].value, '')
})
