import { withRedis } from './redis'

export async function checkRateLimit(scope: string, ip: string, limit: number): Promise<boolean> {
  const windowSecs = 60
  const key = `ratelimit:${scope}:${ip}:${Math.floor(Date.now() / (windowSecs * 1000))}`
  return withRedis(async (client) => {
    // Count and expiry are atomic, so interrupted requests cannot leave permanent keys.
    const results = await client.multi().incr(key).expire(key, windowSecs).exec()
    return Number(results[0]) <= limit
  }, true)
}
