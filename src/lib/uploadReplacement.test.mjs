import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
class MutationError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status }
}
function load(path, mocks) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(id => {
    assert.ok(Object.hasOwn(mocks, id), 'Unexpected import ' + id)
    return mocks[id]
  }, loaded, loaded.exports)
  return loaded.exports
}
const guard = load('./pathGuard.ts', { './itemPath': { isPasswordFile: value => value.toLowerCase().split('/').includes('.password') } })
const target = { id: 'old/+id', name: 'report.txt', path: '/sub/report.txt', size: 11, kind: 'file', eTag: '"old1"' }
const BIG = 5 * 1024 * 1024
function setup(t) {
  // Use an isolated configuration object; no environment files or real clients are loaded.
  const prior = process.env.UPLOAD_MAX_BYTES
  delete process.env.UPLOAD_MAX_BYTES
  t.after(() => { if (prior === undefined) delete process.env.UPLOAD_MAX_BYTES; else process.env.UPLOAD_MAX_BYTES = prior })
  const state = { store: new Map(), writes: [], gets: [], clears: 0, resolutions: [], rates: [], sets: [], saves: [] }
  const redis = {
    get: async key => state.store.get(key) ?? null,
    set: async (key, value, ...args) => {
      state.sets.push({ key, value, args })
      if (args.includes('NX') && state.store.has(key)) return null
      state.store.set(key, value)
      return 'OK'
    },
    eval: async (script, count, ...args) => {
      const [lock, jobKey, token, raw] = count === 2 ? args : [args[0], undefined, args[1]]
      if (state.store.get(lock) !== token) return 0
      if (count === 1) { state.store.delete(lock); return 1 }
      state.saves.push(JSON.parse(raw))
      if (state.saveFail?.(JSON.parse(raw))) throw new Error('private redis failure')
      state.store.set(jobKey, raw)
      return 1
    },
  }
  const items = new Map([[target.id, { ...target }]])
  const parent = { id: 'parent-id', name: 'sub', path: '/sub', kind: 'folder', size: 0, eTag: '"parent1"' }
  const resolver = {
    MutationError,
    mutationError: e => e instanceof MutationError ? e : new MutationError('upstream_unavailable', 502),
    validateManagedPath: path => {
      if (typeof path !== 'string' || !path.startsWith('/') || path.includes('/../') || path.includes('//') ||
          path.length > 4096) throw new MutationError('invalid_request', 400)
      if (path.toLowerCase().includes('.password')) throw new MutationError('protected_item', 403)
    },
    validateManagedId: id => { if (typeof id !== 'string' || !id || /\s/.test(id)) throw new MutationError('invalid_request', 400) },
    validManagedETag: eTag => typeof eTag === 'string' && /^"[\x21\x23-\x7e]+"$/.test(eTag),
    resolveManagedDirectory: async () => {
      if (state.parentError) throw new MutationError(...state.parentError)
      return { ...parent, ...(state.parentChange ?? {}) }
    },
    resolveManagedChild: async (_token, path, name) => {
      if (state.childError) throw new MutationError(...state.childError)
      if (state.absent) return null
      return [...items.values()].find(item => item.path === (path === '/' ? '' : path) + '/' + name) ?? null
    },
    resolveManagedItem: async (_token, path, id) => {
      state.resolutions.push({ path, id })
      const item = items.get(id)
      if (!item || item.path !== path) throw new MutationError('item_changed', 409)
      return { ...item }
    },
  }
  const axios = {
    post: async (url, body, config) => {
      state.writes.push({ method: 'post', url, body, config })
      if (state.sessionFailure) throw state.sessionFailure
      if (state.session) return state.session
      return { status: 200, data: { uploadUrl: 'https://abc.up.1drv.com/upload?secret=x', expirationDateTime: '2099-01-01T00:00:00Z' } }
    },
    get: async (url, config) => {
      state.gets.push({ url, config })
      if (url.slice(url.indexOf('/items/')).includes(':/')) {
        const name = decodeURIComponent(url.slice(url.indexOf('/items/')).split(':/')[1])
        const item = [...items.values()].find(item => item.name === name)
        if (!item) throw { response: { status: 404 } }
        return { status: 200, data: { id: item.id } }
      }
      const id = decodeURIComponent(url.split('/items/')[1])
      const item = items.get(id)
      return { status: 200, data: { ...item, parentReference: { id: parent.id } } }
    },
    patch: async (url, body, config) => {
      state.writes.push({ method: 'patch', url, body, config })
      const id = decodeURIComponent(url.split('/items/')[1])
      const item = items.get(id)
      const attempt = state.writes.filter(write => write.method === 'patch').length
      const result = await state.beforePatch?.({ attempt, item, body, config })
      if (result) return result
      assert.equal(config.headers['If-Match'], item.eTag)
      if ([...items.values()].some(other => other.id !== id && other.name === body.name)) throw { response: { status: 409 } }
      const renamed = { ...item, name: body.name, path: '/sub/' + body.name, eTag: '"v' + attempt + '"' }
      items.set(id, renamed)
      const response = { status: 200, data: { ...renamed, file: {}, parentReference: { id: parent.id } } }
      return state.afterPatch ? state.afterPatch(response, attempt) : response
    },
  }
  const lib = load('./uploadReplacement.ts', {
    'node:crypto': require('node:crypto'), 'next/server': {},
    '../../config/api.config': { driveApi: 'https://graph.test/drive' },
    '../../config/site.config': { kvPrefix: 'siteA:' },
    '../utils/axiosInstance': axios, '../utils/redisClient': { getRedisClient: () => redis },
    '../app/api/upload/shared': { authorize: async () => state.denied ?? null, readJson: async () => state.body ?? {} },
    './adminAuth': { checkAdminRateLimit: async (...args) => { state.rates.push(args); return !state.rateDenied } },
    './cache': { clearCache: () => state.clears++ },
    './driveMutation': resolver, './pathGuard': guard,
  })
  const prepare = body => lib.prepareReplacement('private-token', 'owner-hash', body ?? { path: '/sub', name: target.name, size: BIG })
  const job = async () => {
    const prepared = await prepare()
    const jobKey = 'siteA:upload:replacement:' + prepared.jobId
    const value = JSON.parse(state.store.get(jobKey))
    items.set('temp-id', { id: 'temp-id', name: value.tempName, path: '/sub/' + value.tempName, size: BIG, eTag: '"temp1"', kind: 'file' })
    return { prepared, value, jobKey }
  }
  const commit = (id, owner = 'owner-hash', extra = {}) => lib.commitReplacement('private-token', owner, { jobId: id, ...extra })
  return { lib, state, items, prepare, commit, job, redis }
}
async function fails(promise, code, status) {
  await assert.rejects(promise, error => {
    assert.equal(error.code, code); if (status) assert.equal(error.status, status)
    return true
  })
}
test('prepare selects create and small replacement without writing', async t => {
  const { prepare, state, items } = setup(t)
  assert.deepEqual(await prepare({ path: '/sub', name: target.name, size: 4 * 1024 * 1024 }), { mode: 'replaceSmall', item: target })
  assert.deepEqual(await prepare({ path: '/sub', name: 'new.txt', size: BIG }), { mode: 'create' })
  items.set(target.id, { ...target, kind: 'folder' })
  await fails(prepare(), 'unsupported_item', 400)
  assert.equal(state.writes.length, 0)
})
test('prepare validates paths, names, sizes, protected items and configured limits', async t => {
  const { prepare, state } = setup(t)
  for (const input of [
    { path: '/sub/../x' }, { path: 'relative' }, { path: '/sub//x' },
    { name: '.secret' }, { name: 'a%2f' }, { name: 'a/' }, { name: '\ud800' },
    { size: -1 }, { size: 1.5 }, { size: '5' }, { size: Number.MAX_SAFE_INTEGER + 1 },
  ]) await assert.rejects(prepare({ path: '/sub', name: target.name, size: BIG, ...input }))
  await fails(prepare({ path: '/.password', name: 'x', size: 0 }), 'protected_item', 403)
  await fails(prepare({ path: '/sub', name: target.name, size: 250 * 1024 ** 3 + 1 }), 'file_too_large', 413)
  process.env.UPLOAD_MAX_BYTES = '5'
  await fails(prepare(), 'file_too_large', 413)
  for (const value of ['', '0', '-1', ' 5', '1e3', '9007199254740992', String(250 * 1024 ** 3 + 1)]) {
    process.env.UPLOAD_MAX_BYTES = value
    await fails(prepare(), 'invalid_configuration', 503)
  }
  assert.equal(state.writes.length, 0)
})
test('resolver rejects remote or outside-share targets before a session', async t => {
  const { prepare, state } = setup(t)
  for (const failure of [['unsupported_item', 400], ['outside_share', 403], ['item_changed', 409], ['upstream_unavailable', 502]]) {
    state.childError = failure
    await fails(prepare(), ...failure)
  }
  assert.equal(state.writes.length, 0)
})
test('large preparation uses fail, random temporary names, owner binding, prefix and 24h TTL', async t => {
  const { prepare, state } = setup(t)
  const result = await prepare()
  assert.equal(result.mode, 'replaceLarge')
  assert.match(result.jobId, /^[a-f0-9]{64}$/)
  assert.deepEqual(Object.keys(result).sort(), ['expirationDateTime', 'jobId', 'mode', 'uploadUrl'])
  const stored = JSON.parse([...state.store.values()][0])
  assert.equal(stored.owner, 'owner-hash')
  assert.deepEqual(stored.target, target)
  assert.match(stored.tempName, /^\.__odvi-upload-[a-f0-9]{32}\.tmp$/)
  assert.match(stored.backupName, /^\.__odvi-backup-[a-f0-9]{32}-report.txt$/)
  assert.deepEqual(state.sets[0].args, ['EX', 86400, 'NX'])
  const write = state.writes[0]
  assert.deepEqual(write.body, { item: { '@microsoft.graph.conflictBehavior': 'fail' } })
  assert.ok(write.url.includes(encodeURIComponent(stored.tempName) + ':/createUploadSession'))
  assert.equal(Object.hasOwn(write.body, 'deferCommit'), false)
  assert.ok(write.url.includes('/items/parent-id:/'))
  assert.equal(write.config.maxRedirects, 0)
  assert.equal(write.config.timeout, 10000)
  assert.ok(!JSON.stringify(stored).includes('private-token'))
  assert.ok(!JSON.stringify(stored).includes('upload?'))
  assert.equal(state.clears, 1)
})
test('long backup name remains legal and does not split surrogate pairs', async t => {
  const { items, prepare, state } = setup(t)
  const name = '😀'.repeat(120) + 'x.txt'
  items.set(target.id, { ...target, name, path: '/sub/' + name })
  await prepare({ path: '/sub', name, size: BIG })
  const value = JSON.parse([...state.store.values()][0])
  assert.ok(value.backupName.length <= 255)
  assert.ok(value.backupName.isWellFormed())
  assert.ok(!/[. ]$/.test(value.backupName))
})
test('session URL, expiry and unexpected statuses fail closed and clear cache', async t => {
  const { prepare, state } = setup(t)
  for (const session of [
    { status: 200, data: { uploadUrl: 'https://evil.test/private', expirationDateTime: '2099-01-01' } },
    { status: 200, data: { uploadUrl: 'https://a.1drv.com/u', expirationDateTime: 'bad' } },
    { status: 200, data: { uploadUrl: 'https://a.1drv.com/u', expirationDateTime: '2000-01-01' } },
    { status: 302, data: {} },
  ]) {
    state.session = session
    await fails(prepare(), 'write_uncertain', 502)
  }
  assert.equal(state.clears, 4)
})
test('session creation 4xx maps to definite errors without leaking upstream details or retrying', async t => {
  const { prepare, state, lib, items } = setup(t)
  for (const [status, code, expectedStatus] of [
    [400, 'write_failed', 502], [401, 'write_failed', 403], [403, 'write_failed', 403],
    [404, 'item_not_found', 404], [409, 'conflict', 409], [412, 'item_changed', 412],
    [429, 'rate_limited', 429],
  ]) {
    state.sessionFailure = {
      response: { status, data: { error: { code: 'invalidRequest', message: 'private-token https://private-upload-url' } } },
    }
    const attempts = state.writes.length
    try { await prepare(); assert.fail('Expected a session failure') } catch (error) {
      assert.deepEqual(lib.replacementFailure(error), { body: { error: code }, status: expectedStatus })
    }
    assert.equal(state.writes.length, attempts + 1)
    assert.equal(state.clears, state.writes.length)
    assert.equal(items.size, 1)
    assert.deepEqual(items.get(target.id), target)
  }
})
test('commit retains backup, conditionally renames both files, and replays original receipt', async t => {
  const { job, commit, state, items } = setup(t)
  const { prepared, value, jobKey } = await job()
  const receipt = await commit(prepared.jobId, 'owner-hash', { uploadedItemId: 'temp-id' })
  assert.equal(receipt.ok, true)
  assert.equal(receipt.backupName, value.backupName)
  assert.equal(receipt.item.id, 'temp-id')
  assert.equal(receipt.item.name, target.name)
  assert.equal(items.get(target.id).name, value.backupName)
  assert.equal(items.size, 2)
  assert.equal(JSON.parse(state.store.get(jobKey)).phase, 'done')
  const patches = state.writes.filter(write => write.method === 'patch')
  assert.equal(patches.length, 2)
  assert.equal(patches[0].config.headers['If-Match'], target.eTag)
  assert.equal(patches[1].config.headers['If-Match'], '"temp1"')
  assert.equal(state.saves[0].phase, 'committing')
  for (const patch of patches) {
    assert.equal(patch.body['@microsoft.graph.conflictBehavior'], 'fail')
    assert.equal(patch.config.maxRedirects, 0)
    assert.equal(patch.config.timeout, 10000)
  }
  assert.deepEqual(await commit(prepared.jobId), receipt)
  assert.equal(state.writes.length, 3)
  assert.equal(state.clears, 3)
  assert.ok(![...state.store.keys()].some(key => key.endsWith(':lock')))
})
test('different owner, stale snapshot, wrong parent, wrong uploaded ID and size never rename', async t => {
  const { job, commit, state, items } = setup(t)
  const { prepared } = await job()
  await fails(commit(prepared.jobId, 'other-owner'), 'unauthorized', 403)
  items.set(target.id, { ...target, eTag: '"changed"' })
  await fails(commit(prepared.jobId), 'item_changed', 412)
  items.set(target.id, { ...target })
  state.parentChange = { id: 'new-parent' }
  await fails(commit(prepared.jobId), 'item_changed', 409)
  state.parentChange = undefined
  await fails(commit(prepared.jobId, 'owner-hash', { uploadedItemId: 'wrong' }), 'item_changed', 409)
  items.get('temp-id').size = BIG - 1
  await fails(commit(prepared.jobId), 'item_changed', 409)
  assert.equal(state.writes.filter(w => w.method === 'patch').length, 0)
})
test('first rename 412 stays visible and is terminal without a second write', async t => {
  const { job, commit, state, items } = setup(t)
  const { prepared, jobKey } = await job()
  state.beforePatch = () => { throw { response: { status: 412 } } }
  await fails(commit(prepared.jobId), 'item_changed', 412)
  await fails(commit(prepared.jobId), 'item_changed', 412)
  assert.equal(state.writes.length, 2)
  assert.equal(items.get(target.id).name, target.name)
  assert.equal(JSON.parse(state.store.get(jobKey)).phase, 'failed')
})
test('first rename lost response inspects original ID, persists uncertain and never reexecutes', async t => {
  const { job, commit, state, items } = setup(t)
  const { prepared, value, jobKey } = await job()
  state.afterPatch = () => { throw new Error('lost private response') }
  await fails(commit(prepared.jobId), 'write_uncertain', 502)
  assert.equal(items.get(target.id).name, value.backupName)
  assert.equal(items.get('temp-id').name, value.tempName)
  assert.ok(state.gets.some(read => read.url.endsWith('/items/' + encodeURIComponent(target.id))))
  assert.equal(JSON.parse(state.store.get(jobKey)).phase, 'uncertain')
  await fails(commit(prepared.jobId), 'write_uncertain', 502)
  assert.equal(state.writes.length, 2)
})
test('second rename definite failure rolls back with fresh backup ETag and fail', async t => {
  const { job, commit, state, items } = setup(t)
  const { prepared, jobKey, value } = await job()
  state.beforePatch = ({ attempt }) => { if (attempt === 2) throw { response: { status: 412 } } }
  await fails(commit(prepared.jobId), 'item_changed', 412)
  assert.equal(items.get(target.id).name, target.name)
  assert.equal(items.get('temp-id').name, value.tempName)
  const patches = state.writes.filter(w => w.method === 'patch')
  assert.equal(patches.length, 3)
  assert.equal(patches[2].config.headers['If-Match'], '"v1"')
  assert.equal(patches[2].body['@microsoft.graph.conflictBehavior'], 'fail')
  assert.equal(JSON.parse(state.store.get(jobKey)).phase, 'failed')
  await fails(commit(prepared.jobId), 'item_changed', 412)
  assert.equal(state.writes.length, 4)
})
test('rollback never overwrites a third-party file occupying the original name', async t => {
  const { job, commit, state, items, lib } = setup(t)
  const { prepared, value } = await job()
  state.beforePatch = ({ attempt }) => {
    if (attempt === 2) {
      items.set('third-party', { ...target, id: 'third-party', eTag: '"third"' })
      throw { response: { status: 409 } }
    }
  }
  try { await commit(prepared.jobId); assert.fail() } catch (error) {
    assert.deepEqual(lib.replacementFailure(error), {
      status: 502, body: { error: 'write_uncertain', recovery: { backupName: value.backupName, tempName: value.tempName } },
    })
  }
  assert.equal(state.writes.length, 3)
  assert.equal(items.get(target.id).name, value.backupName)
  assert.equal(items.get('temp-id').name, value.tempName)
  assert.equal(items.get('third-party').eTag, '"third"')
})
test('rollback name race uses fail and retains backup, temp and the competing file', async t => {
  const { job, commit, state, items } = setup(t)
  const { prepared, value } = await job()
  state.beforePatch = ({ attempt }) => {
    if (attempt === 2) throw { response: { status: 409 } }
    if (attempt === 3) items.set('third-party', { ...target, id: 'third-party', eTag: '"third"' })
  }
  await fails(commit(prepared.jobId), 'write_uncertain', 502)
  assert.equal(items.get(target.id).name, value.backupName)
  assert.equal(items.get('temp-id').name, value.tempName)
  assert.equal(items.get('third-party').eTag, '"third"')
  assert.equal(state.writes.length, 4)
  await fails(commit(prepared.jobId), 'write_uncertain', 502)
  assert.equal(state.writes.length, 4)
})
test('first rename fail conflict leaves the original and uploaded temp untouched', async t => {
  const { job, commit, state, items } = setup(t)
  const { prepared, value } = await job()
  state.beforePatch = () => { throw { response: { status: 409 } } }
  await fails(commit(prepared.jobId), 'conflict', 409)
  await fails(commit(prepared.jobId), 'conflict', 409)
  assert.equal(items.get(target.id).name, target.name)
  assert.equal(items.get('temp-id').name, value.tempName)
  assert.equal(state.writes.length, 2)
})
test('second rename lost response never rolls back a possibly completed replacement', async t => {
  const { job, commit, state, items } = setup(t)
  const { prepared, value } = await job()
  state.afterPatch = (response, attempt) => { if (attempt === 2) throw new Error('lost'); return response }
  await fails(commit(prepared.jobId), 'write_uncertain', 502)
  assert.equal(items.get(target.id).name, value.backupName)
  assert.equal(items.get('temp-id').name, target.name)
  await fails(commit(prepared.jobId), 'write_uncertain', 502)
  assert.equal(state.writes.length, 3)
})
test('malformed rename metadata is uncertain and does not proceed', async t => {
  for (const change of [
    { id: 'wrong' }, { name: 'wrong' }, { parentReference: { id: 'wrong' } }, { eTag: '*' },
    { size: -1 }, { remoteItem: {} }, { folder: {} }, { file: null },
  ]) {
    const { job, commit, state } = setup(t)
    const { prepared } = await job()
    state.afterPatch = response => ({ ...response, data: { ...response.data, ...change } })
    await fails(commit(prepared.jobId), 'write_uncertain', 502)
    assert.equal(state.writes.length, 2)
  }
})
test('failed committing persistence prevents all renames; failed done persistence forbids replay', async t => {
  for (const phase of ['committing', 'done']) {
    const { job, commit, state } = setup(t)
    const { prepared } = await job()
    state.saveFail = value => value.phase === phase
    await fails(commit(prepared.jobId), 'write_uncertain', 502)
    await fails(commit(prepared.jobId), 'write_uncertain', 502)
    assert.equal(state.writes.length, phase === 'committing' ? 1 : 3)
  }
})
test('existing committing phase and active lock deny reexecution; foreign lock is never released', async t => {
  const { job, commit, state } = setup(t)
  const { prepared, value, jobKey } = await job()
  state.store.set(jobKey + ':lock', 'foreign-lock')
  await fails(commit(prepared.jobId), 'write_uncertain', 502)
  assert.equal(state.store.get(jobKey + ':lock'), 'foreign-lock')
  assert.equal(JSON.parse(state.store.get(jobKey)).phase, 'pending')
  state.store.delete(jobKey + ':lock')
  state.store.set(jobKey, JSON.stringify({ ...value, phase: 'committing' }))
  await fails(commit(prepared.jobId), 'write_uncertain', 502)
  assert.equal(state.writes.length, 1)
})
test('lock expiry before first rename leaves a terminal uncertain job', async t => {
  const { job, commit, state, redis } = setup(t)
  const { prepared } = await job()
  const get = redis.get
  redis.get = async key => {
    if (key.endsWith(':lock')) { state.store.set(key, 'foreign-lock'); return 'foreign-lock' }
    return get(key)
  }
  await fails(commit(prepared.jobId), 'write_uncertain', 502)
  assert.equal(state.writes.length, 1)
})
test('request helper enforces auth, rates, object JSON and cookie hashing', async t => {
  const { lib, state } = setup(t)
  state.denied = { status: 401 }
  await fails(lib.readReplacementBody({}, 'upload-prepare'), 'unauthorized', 401)
  assert.equal(state.rates.length, 0)
  state.denied = undefined
  state.rateDenied = true
  await fails(lib.readReplacementBody({}, 'upload-commit'), 'rate_limited', 429)
  assert.deepEqual(state.rates, [['upload-commit', 120]])
  state.rateDenied = false
  state.body = []
  await fails(lib.readReplacementBody({}, 'upload-prepare'), 'invalid_request', 400)
  const request = { cookies: { get: () => ({ value: 'signed-admin-cookie' }) } }
  assert.match(lib.replacementOwner(request), /^[a-f0-9]{64}$/)
  assert.notEqual(lib.replacementOwner(request), 'signed-admin-cookie')
  assert.throws(() => lib.replacementOwner({ cookies: { get: () => undefined } }), { code: 'unauthorized' })
})
