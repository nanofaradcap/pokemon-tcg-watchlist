import { NextRequest, NextResponse } from 'next/server'
import { chromium } from '@playwright/test'
import { z } from 'zod'

const BodySchema = z.object({
  url: z.string().url(),
})

const ScrapeResultSchema = z.object({
  url: z.string(),
  productId: z.string(),
  name: z.string(),
  setDisplay: z.string().optional(),
  jpNo: z.string().optional(),
  rarity: z.string().optional(),
  imageUrl: z.string().optional(),
  marketPrice: z.number().optional(),
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

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'] as string[]
    })

    let result: Record<string, unknown> = {}
    
    try {
      const page = await browser.newPage({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      })

      const timeout = Number(process.env.SCRAPE_TIMEOUT_MS ?? 15000)
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout 
      })

      // Wait for Market Price to appear
      try {
        await page.waitForSelector('span.price-points__upper__price', { 
          timeout: 12000 
        })
      } catch {
        // Fallback: wait for any price element
        await page.waitForSelector('[class*="price"]', { 
          timeout: 8000 
        })
      }

      // Extract data with multiple fallbacks
      const data = await page.evaluate((pid) => {
        // Market Price extraction
        const priceElements = Array.from(document.querySelectorAll('span.price-points__upper__price'))
        const marketPriceText = priceElements[0]?.textContent?.trim() || ''

        // Card name extraction
        const titleSelectors = [
          'h1',
          '[data-testid="product-title"]',
          '[data-component*="ProductTitle"]',
          '.product-title',
          '.product-name'
        ]
        
        let name = ''
        for (const selector of titleSelectors) {
          const element = document.querySelector(selector)
          if (element?.textContent?.trim()) {
            name = element.textContent.trim()
            break
          }
        }
        
        if (!name) {
          name = document.title.replace(' - TCGplayer', '').trim()
        }

        // Set display extraction
        const setSelectors = [
          '[data-testid="set-name"]',
          '.product-details__set',
          '.subtle',
          '.breadcrumb a:last-child',
          '.set-name',
          '.product-set'
        ]
        
        let setDisplay = ''
        for (const selector of setSelectors) {
          const element = document.querySelector(selector)
          if (element?.textContent?.trim()) {
            setDisplay = element.textContent.trim()
            break
          }
        }

        // JP No extraction
        const textContent = document.body.innerText || ''
        const jpNoMatch = textContent.match(/\b\d{3}\/\d{3}\b/)
        const jpNo = jpNoMatch?.[0] || null

        // Rarity extraction
        const rarityMatch = textContent.match(/Rarity\s*[:|-]\s*([A-Za-z ]+)/i)
        const rarity = rarityMatch?.[1]?.trim() || null

        // Image extraction
        const imgSelectors = [
          'img[alt*="Pokemon"]',
          'img[alt*="Pokémon"]',
          '.product-image img',
          '.card-image img',
          'img[src*="product-images.tcgplayer.com"]',
          'img[src*="tcgplayer-cdn.tcgplayer.com/product/"]'
        ]
        
        // Collect candidate images
        const candidates: string[] = []
        for (const selector of imgSelectors) {
          const img = document.querySelector(selector) as HTMLImageElement | null
          if (img?.src) candidates.push(img.src)
        }

        // Prefer product images that include the productId
        const preferred = candidates.find(src =>
          /tcgplayer-cdn\.tcgplayer\.com\/product\//.test(src) && src.includes(`${pid}`)
        ) || candidates.find(src =>
          /product-images\.tcgplayer\.com\/.*\/(?:fit-in\/\d+x\d+\/)?\d+\.jpg/.test(src) && src.includes(`${pid}`)
        ) || ''

        const imageUrl = preferred

        return {
          marketPriceText,
          name,
          setDisplay,
          jpNo,
          rarity,
          imageUrl
        }
      }, productId)

      // Normalize price
      const marketPrice = data.marketPriceText 
        ? Number(data.marketPriceText.replace(/[^0-9.]/g, '')) 
        : null

      // Construct or normalize image URL to 1000x1000 product image
      let imageUrl = data.imageUrl || `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`
      const cdnMatch = imageUrl.match(/^(https:\/\/tcgplayer-cdn\.tcgplayer\.com\/product\/)\d+_in_\d+x\d+(\.jpg)$/)
      if (cdnMatch) {
        // Force 1000x1000 variant
        imageUrl = `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`
      }

      result = {
        url,
        productId,
        name: data.name || '',
        setDisplay: data.setDisplay || undefined,
        jpNo: data.jpNo ?? undefined,
        rarity: data.rarity ?? undefined,
        imageUrl,
        marketPrice: marketPrice ?? undefined,
      }

    } finally {
      await browser.close()
    }

    // Validate the result
    const validatedResult = ScrapeResultSchema.parse(result)
    
    return NextResponse.json(validatedResult)

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
