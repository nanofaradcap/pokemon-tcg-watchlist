export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { scrapeWithPuppeteer } from '@/lib/puppeteer-scraping'
import { checkRateLimit } from '@/lib/rate-limit'
import { cardUrlSchema, parseCardUrl } from '@/lib/card-url'
import { checkApiSecret } from '@/lib/api-auth'

const BodySchema = z.object({
  url: cardUrlSchema,
})

export async function POST(req: NextRequest) {
  const authError = checkApiSecret(req)
  if (authError) return authError

  try {
    // Rate limiting
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
      || req.headers.get('x-real-ip')
      || 'unknown'
    if (!(await checkRateLimit('scrape', ip, 10))) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    const body = await req.json()
    const { url } = BodySchema.parse(body)

    const source = parseCardUrl(url)
    if (source.sourceType !== 'tcgplayer') {
      return NextResponse.json({ error: 'Invalid TCGplayer URL format' }, { status: 400 })
    }
    const productId = source.productId

    // Use Puppeteer scraping
    try {
      const result = await scrapeWithPuppeteer(source.url, productId)
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
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    
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
