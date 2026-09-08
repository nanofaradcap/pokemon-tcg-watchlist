import { afterEach, describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import * as cache from '../redis'
import { checkRateLimit } from '../rate-limit'

const originalRedis = cache.redis
function useClient(client: unknown) {
  Object.defineProperty(cache, 'redis', { value: client, configurable: true })
}
afterEach(() => {
  mock.restoreAll()
  useClient(originalRedis)
})

describe('optional Redis', () => {
  it('does not connect or execute commands without configuration', async () => {
    assert.equal(cache.redis, null)
    const operation = mock.fn(async () => 'cached')
    assert.equal(await cache.withRedis(operation, 'fallback'), 'fallback')
    assert.equal(operation.mock.callCount(), 0)
  })

  it('skips commands while a client is connecting', async () => {
    useClient({ isOpen: true, isReady: false })
    const operation = mock.fn(async () => 'cached')
    assert.equal(await cache.withRedis(operation, 'fallback'), 'fallback')
    assert.equal(operation.mock.callCount(), 0)
  })

  it('falls back after command errors and allows subsequent successful commands', async () => {
    useClient({ isOpen: true, isReady: true })
    assert.equal(await cache.withRedis(async () => { throw new Error('Disconnected') }, 'fallback'), 'fallback')
    assert.equal(await cache.withRedis(async () => 'cached', 'fallback'), 'cached')
  })

  it('bounds stalled operations and closes the stalled connection', async () => {
    const destroy = mock.fn()
    useClient({ isOpen: true, isReady: true, destroy })
    const started = Date.now()
    assert.equal(await cache.withRedis(() => new Promise<string>(() => {}), 'fallback'), 'fallback')
    assert.equal(destroy.mock.callCount(), 1)
    assert.ok(Date.now() - started < 2000)
  })
})

describe('rate limiting', () => {
  it('allows the limit, rejects the next request and atomically expires the counter', async () => {
    let count = 0
    let incrementKey = ''
    const transaction = {
      incr(key: string) { incrementKey = key; return this },
      expire(key: string, seconds: number) {
        assert.equal(key, incrementKey)
        assert.equal(seconds, 60)
        return this
      },
      async exec() { return [++count, 1] },
    }
    useClient({ isOpen: true, isReady: true, multi: () => transaction })
    assert.equal(await checkRateLimit('scrape', '127.0.0.1', 2), true)
    assert.equal(await checkRateLimit('scrape', '127.0.0.1', 2), true)
    assert.equal(await checkRateLimit('scrape', '127.0.0.1', 2), false)
    assert.match(incrementKey, /^ratelimit:scrape:127\.0\.0\.1:\d+$/)
  })

  it('keeps the endpoint available when Redis fails', async () => {
    useClient({ isOpen: true, isReady: true, multi: () => { throw new Error('Disconnected') } })
    assert.equal(await checkRateLimit('scrape', '127.0.0.1', 10), true)
  })
})
