import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { scrapeWithPlaywright } from '@/lib/scraping'

const BodySchema = z.object({
  url: z.string().url(),
})

// Simple in-memory rate limiting (for production, use Redis or similar)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10 // 10 requests per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const userLimit = rateLimitMap.get(ip)
  
  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return true
  }
  
  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false
  }
  
  userLimit.count++
  return true
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    if (!checkRateLimit(ip)) {
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

    // Use Playwright scraping
    try {
      console.log(`Starting Playwright scraping for product ${productId}`)
      const result = await scrapeWithPlaywright(url, productId)
      console.log(`Playwright scraping succeeded for product ${productId}`)
      return NextResponse.json(result)
    } catch (playwrightError) {
      console.error(`Playwright failed for product ${productId}:`, {
        error: playwrightError instanceof Error ? playwrightError.message : 'Unknown error',
        stack: playwrightError instanceof Error ? playwrightError.stack : undefined
      })
      return NextResponse.json(
        { 
          error: 'Failed to scrape product data',
          details: playwrightError instanceof Error ? playwrightError.message : 'Unknown error'
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