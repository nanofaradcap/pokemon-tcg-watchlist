import { NextResponse } from 'next/server'
import { redis, withRedis } from '@/lib/redis'

export async function GET() {
  try {
    if (!redis?.isReady) {
      return NextResponse.json({
        status: 'error',
        message: 'Redis client not initialized',
        redisUrl: process.env.REDIS_URL ? 'Set' : 'Not set'
      })
    }

    // Test Redis connection
    const testKey = 'test:connection'
    const testValue = `test-${Date.now()}`
    
    const retrievedValue = await withRedis(async (client) => {
      await client.setEx(testKey, 60, testValue)
      const value = await client.get(testKey)
      await client.del(testKey)
      return value
    }, null)

    if (retrievedValue === null) {
      return NextResponse.json({ status: 'error', message: 'Redis connection failed' }, { status: 503 })
    }

    return NextResponse.json({
      status: 'success',
      message: 'Redis is working!',
      testValue,
      retrievedValue,
      match: testValue === retrievedValue,
      redisUrl: process.env.REDIS_URL ? 'Set' : 'Not set'
    })
    
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: 'Redis connection failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      redisUrl: process.env.REDIS_URL ? 'Set' : 'Not set'
    })
  }
}
