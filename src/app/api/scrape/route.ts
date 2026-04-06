export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { scrapeWithPuppeteer } from '@/lib/puppeteer-scraping'
import redis from '@/lib/redis'

const BodySchema = z.object({
  url: z.string().url(),
})

async function checkRateLimit(ip: string): Promise<boolean> {
  if (!redis || !redis.isOpen) return true
  const windowSecs = 60
  const limit = 10
  const key = `ratelimit:scrape:${ip}:${Math.floor(Date.now() / (windowSecs * 1000))}`
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, windowSecs)
  return count <= limit
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
      || req.headers.get('x-real-ip')
      || 'unknown'
    if (!(await checkRateLimit(ip))) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    const body = await req.json()
    const { url } = BodySchema.parse(body)

    // Validate TCGplayer URL
    if (!url.includes('tcgplayer.com/product/')) {
      return NextResponse.json(
        { error: 'Invalid TCGplayer URL format' },
        { status: 400 }
      )
    }

    // Extract productId from URL
    const productIdMatch = url.match(/\/product\/(\d+)\//)
    if (!productIdMatch) {
      return NextResponse.json(
        { error: 'Invalid TCGplayer URL format' },
        { status: 400 }
      )
    }
    const productId = productIdMatch[1]

    // Use Puppeteer scraping
    try {
      const result = await scrapeWithPuppeteer(url, productId)
      return NextResponse.json(result)
    } catch (puppeteerError) {
      console.error(`Puppeteer failed for product ${productId}:`, {
        error: puppeteerError instanceof Error ? puppeteerError.message : 'Unknown error',
        stack: puppeteerError instanceof Error ? puppeteerError.stack : undefined
      })
      return NextResponse.json(
        { 
          error: 'Failed to scrape product data',
          details: puppeteerError instanceof Error ? puppeteerError.message : 'Unknown error'
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Scraping error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to scrape product data' },
      { status: 500 }
    )
  }
}
