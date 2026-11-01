import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import RedisClient from 'ioredis'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const code = ts.transpileModule(readFileSync(new URL('./redisClient.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText

function fixture(url, implementation) {
  const env = url === undefined ? {} : { REDIS_URL: url }
  const constructed = []
  const logs = []
  class RedisClientMock {
    constructor(url, options) {
      this.url = url
      this.options = options
      this.events = []
      this.quits = 0
      constructed.push(this)
    }
    on(event, listener) {
      this.events.push([event, listener])
    }
    async quit() {
      this.quits++
    }
  }
  const exports = {}
  vm.runInNewContext(code, {
    exports,
    URL,
    process: { env },
    require: name => {
      assert.equal(name, 'ioredis')
      return implementation ?? RedisClientMock
    },
    console: { error: (...args) => logs.push(args), log: (...args) => logs.push(args) },
  })
  return { api: exports, env, constructed, logs }
}

test('missing or blank REDIS_URL fails explicitly without constructing a client', async () => {
  for (const url of [undefined, '', ' ', '\t\n\r ']) {
    const f = fixture(url)
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.throws(() => f.api.getRedisClient(), {
        code: 'redis_not_configured',
        message: 'Redis is not configured.',
      })
    }
    await f.api.closeRedisClient()
    assert.equal(f.constructed.length, 0)
    assert.deepEqual(f.logs, [])
  }
})

test('invalid URLs, schemes, hosts and credentials never reach the Redis constructor or leak secrets', () => {
  for (const url of [
    'http://private-user:private-secret@private-host.example',
    'https://private-host.example',
    'private-host.example:6379',
    '//private-host.example:6379',
    '/tmp/redis.sock',
    '6379',
    'redis:',
    'redis://',
    'redis:///0',
    'redis://:6379',
    'redis://?host=private-host.example',
    'rediss://private-user:private-secret@',
    'rediss://private-user:private-secret@[invalid',
    'redis://private-user:private-secret@private-host.example:99999',
    'redis://private-user:private-secret%ZZ@private-host.example',
    'redis://private-user%FF:private-secret@private-host.example',
  ]) {
    const f = fixture(url)
    assert.throws(
      () => f.api.getRedisClient(),
      error => {
        assert.equal(error.code, 'redis_invalid_url')
        assert.equal(error.message, 'Redis URL configuration is invalid.')
        assert.equal(error.cause, undefined)
        assert.doesNotMatch(
          String(error) + error.stack + JSON.stringify(error),
          /private-user|private-secret|private-host/,
        )
        return true
      },
    )
    assert.equal(f.constructed.length, 0, url)
    assert.deepEqual(f.logs, [])
  }
})

test('valid URLs preserve client settings, singleton behavior and graceful shutdown', async () => {
  for (const url of [
    'redis://redis.example:6380/2',
    'rediss://user:password@redis.example:6380/0',
    'redis://[::1]:6379',
  ]) {
    const f = fixture(url)
    const client = f.api.getRedisClient()
    assert.equal(client.url, url)
    assert.equal(f.api.getRedisClient(), client)
    assert.equal(f.constructed.length, 1)
    const { retryStrategy, ...options } = client.options
    assert.deepEqual(JSON.parse(JSON.stringify(options)), {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      disableClientInfo: true,
      enableOfflineQueue: true,
      connectTimeout: 10000,
      keepAlive: 30000,
      lazyConnect: true,
      commandTimeout: 5000,
    })
    assert.equal(retryStrategy(1), 50)
    assert.equal(retryStrategy(100), 2000)
    assert.deepEqual(
      client.events.map(([event]) => event),
      ['error', 'connect'],
    )
    await f.api.closeRedisClient()
    assert.equal(client.quits, 1)
    assert.notEqual(f.api.getRedisClient(), client)
    assert.equal(f.constructed.length, 2)
    await f.api.closeRedisClient()
  }
})

test('Redis error logging never includes command arguments or credentials', () => {
  const f = fixture('redis://redis.example:6379')
  const client = f.api.getRedisClient()
  const [, onError] = client.events.find(([event]) => event === 'error')
  onError({ message: 'private-secret', command: { name: 'AUTH', args: ['private-user', 'private-secret'] } })
  assert.equal(JSON.stringify(f.logs).includes('private-secret'), false)
  assert.equal(JSON.stringify(f.logs).includes('private-user'), false)
  assert.equal(f.logs.length, 1)
})

test('real client connects lazily without INFO or SETINFO and propagates command failures', { timeout: 10000 }, async () => {
  const commands = []
  const sockets = new Set()
  let unavailable = false
  const server = createServer(socket => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    let pending = Buffer.alloc(0)
    socket.on('data', chunk => {
      pending = Buffer.concat([pending, chunk])
      while (pending.length) {
        const lines = pending.toString().split('\r\n')
        const count = Number(lines[0].slice(1))
        if (lines.length < 2 * count + 2) return
        const args = Array.from({ length: count }, (_, index) => lines[2 * index + 2])
        const length = Buffer.byteLength(lines.slice(0, 2 * count + 1).join('\r\n') + '\r\n')
        pending = pending.subarray(length)
        commands.push(args[0].toUpperCase())
        if (args[0].toUpperCase() === 'HELLO') socket.write('%0\r\n')
        else if (args[0].toUpperCase() === 'QUIT') socket.end('+OK\r\n')
        else socket.write(unavailable ? '-ERR mock unavailable\r\n' : ':1\r\n')
      }
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const f = fixture(`redis://127.0.0.1:${server.address().port}`, RedisClient)
  const client = f.api.getRedisClient()
  try {
    assert.equal(client.status, 'wait')
    assert.equal(sockets.size, 0)
    assert.equal(await client.exists('test:session'), 1)
    assert.deepEqual(commands, ['HELLO', 'EXISTS'])
    unavailable = true
    await assert.rejects(client.exists('test:session'), /mock unavailable/)
    await f.api.closeRedisClient()
    assert.deepEqual(commands, ['HELLO', 'EXISTS', 'EXISTS', 'QUIT'])
  } finally {
    client.disconnect()
    for (const socket of sockets) socket.destroy()
    await new Promise(resolve => server.close(resolve))
  }
})

test('configuration can be corrected after failure and rediss is normalized before construction', () => {
  const f = fixture()
  assert.throws(() => f.api.getRedisClient(), { code: 'redis_not_configured' })
  f.env.REDIS_URL = '  REDISS://redis.example:6380/1  '
  const client = f.api.getRedisClient()
  assert.equal(client.url, 'rediss://redis.example:6380/1')
  assert.equal(f.constructed.length, 1)
})
