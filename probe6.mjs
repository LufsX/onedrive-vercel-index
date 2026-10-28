import fs from 'node:fs'
import Redis from 'ioredis'

const url = fs.readFileSync('/tmp/redis-url.txt', 'utf8').trim()
const db1Url = url.replace(/\/\d+$/, '') + '/1'
console.log('db1 url ok:', db1Url.startsWith('redis'))
const r = new Redis(db1Url)
await r.flushdb()
if (process.argv[2] === 'bogus') {
  await r.set('refresh_token', 'M.C_bogus_refresh_token_that_microsoft_will_reject')
  console.log('seeded bogus refresh_token in db1')
}
console.log('db1 keys:', await r.keys('*'))
await r.quit()
