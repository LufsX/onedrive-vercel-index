import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authorizeTokenWrite } from './oauthSetup.ts'

const body = { obfuscatedAccessToken: 'access', obfuscatedRefreshToken: 'refresh', accessTokenExpiry: 3600 }

function fixture() {
  let writes = 0
  let reads = 0
  let identities = 0
  const deps = {
    owner: 'owner@example.com',
    readBody: async () => { reads++; return body },
    reveal: (value) => value,
    getIdentity: async () => { identities++; return 'owner@example.com' },
    store: async () => { writes++; return true },
  }
  return { deps, counts: () => ({ writes, reads, identities }) }
}

test('payload and Microsoft account validation are required', async () => {
  for (const [change, status] of [
    [(f) => { f.deps.readBody = async () => null }, 400],
    [(f) => { f.deps.getIdentity = async () => null }, 403],
    [(f) => { f.deps.getIdentity = async () => 'other@example.com' }, 403],
    [(f) => { f.deps.owner = '' }, 403],
    [(f) => { f.deps.getIdentity = async () => { throw new Error('Graph unavailable') } }, 502],
  ]) {
    const f = fixture()
    change(f)
    assert.equal((await authorizeTokenWrite(f.deps)).status, status)
    assert.equal(f.counts().writes, 0)
  }
})

test('invalid payload or decryption rejects before Graph and storage', async () => {
  for (const change of [
    (f) => { f.deps.readBody = async () => ({ ...body, accessTokenExpiry: 0 }) },
    (f) => { f.deps.reveal = () => { throw new Error('bad token') } },
    (f) => { f.deps.reveal = () => '' },
  ]) {
    const f = fixture()
    change(f)
    assert.equal((await authorizeTokenWrite(f.deps)).status, 400)
    assert.equal(f.counts().writes, 0)
    assert.equal(f.counts().identities, 0)
  }
})

test('Graph failure, missing identity, and wrong owner do not write', async () => {
  for (const [identity, status] of [[null, 403], ['other@example.com', 403], ['failure', 502]]) {
    const f = fixture()
    f.deps.getIdentity = async () => {
      if (identity === 'failure') throw new Error('Graph unavailable')
      return identity
    }
    assert.equal((await authorizeTokenWrite(f.deps)).status, status)
    assert.equal(f.counts().writes, 0)
  }
})

test('matching identity stores once and storage failures are reported', async () => {
  const f = fixture()
  assert.equal((await authorizeTokenWrite(f.deps)).status, 200)
  assert.equal(f.counts().writes, 1)
  f.deps.store = async () => { throw new Error('storage failed') }
  assert.equal((await authorizeTokenWrite(f.deps)).status, 500)
})
