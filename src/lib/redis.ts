import { createClient } from 'redis'

const globalForRedis = globalThis as unknown as {
  redis: ReturnType<typeof createClient> | undefined
}

function initializeRedis(): ReturnType<typeof createClient> | null {
  if (!process.env.REDIS_URL) return null
  if (globalForRedis.redis) return globalForRedis.redis

  try {
    const client = createClient({
      url: process.env.REDIS_URL,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: 1000,
        reconnectStrategy: (retries) => retries < 3 ? 250 : false,
      },
    })
    // Redis emits errors separately from the connect() promise.
    client.on('error', () => console.warn('Redis unavailable; caching disabled'))
    globalForRedis.redis = client
    void client.connect().catch(() => console.warn('Redis connection failed; caching disabled'))
    return client
  } catch {
    console.warn('Redis initialization failed; caching disabled')
    return null
  }
}

export const redis = initializeRedis()
export default redis

export async function withRedis<T>(
  operation: (client: NonNullable<typeof redis>) => Promise<T>,
  fallback: T,
): Promise<T> {
  if (!redis?.isReady) return fallback
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation(redis),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          // Close stalled connections so queued work cannot linger after the fallback.
          if (redis.isOpen) redis.destroy()
          resolve(fallback)
        }, 500)
      }),
    ])
  } catch {
    return fallback
  } finally {
    clearTimeout(timer)
  }
}
