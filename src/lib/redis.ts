import { createClient } from 'redis'

const globalForRedis = globalThis as unknown as {
  redis: ReturnType<typeof createClient> | undefined
}

// Create Redis client with fallback
let redis: ReturnType<typeof createClient> | null = null

try {
  redis = globalForRedis.redis ?? createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  })

  if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis

  // Connect to Redis
  if (!redis.isOpen) {
    redis.connect().catch((error) => {
      console.warn('Redis connection failed, caching disabled:', error.message)
      redis = null
    })
  }
} catch (error) {
  console.warn('Redis initialization failed, caching disabled:', error)
  redis = null
}

export { redis }
export default redis
