import { NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

export async function GET() {
  try {
    if (!redis) {
      return NextResponse.json({
        status: 'error',
        message: 'Redis client not initialized',
        redisUrl: process.env.REDIS_URL ? 'Set' : 'Not set'
      })
    }

    // Test Redis connection
    const testKey = 'test:connection'
    const testValue = `test-${Date.now()}`
    
    // Set a test value
    await redis.setEx(testKey, 60, testValue)
    
    // Get the test value
    const retrievedValue = await redis.get(testKey)
    
    // Clean up
    await redis.del(testKey)
    
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
