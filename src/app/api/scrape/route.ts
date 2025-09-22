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

    // Try Playwright first, fallback to basic scraping if it fails
    try {
      console.log(`Starting Playwright scraping for product ${productId}`)
      const result = await scrapeWithPlaywright(url, productId)
      console.log(`Playwright scraping succeeded for product ${productId}`)
      return result
    } catch (playwrightError) {
      console.warn(`Playwright failed for product ${productId}, trying fallback method:`, {
        error: playwrightError instanceof Error ? playwrightError.message : 'Unknown error',
        stack: playwrightError instanceof Error ? playwrightError.stack : undefined
      })
      try {
        const result = await scrapeWithFallback(url, productId)
        console.log(`Fallback scraping succeeded for product ${productId}`)
        return result
      } catch (fallbackError) {
        console.error(`Both scraping methods failed for product ${productId}:`, {
          playwrightError: playwrightError instanceof Error ? playwrightError.message : 'Unknown error',
          fallbackError: fallbackError instanceof Error ? fallbackError.message : 'Unknown error'
        })
        throw fallbackError
      }
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

async function scrapeWithPlaywright(url: string, productId: string) {
  // Set a timeout for the entire Playwright operation
  const timeout = 25000 // 25 seconds (leaving 5s buffer for Vercel's 30s limit)
  
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  })

  try {
    // Wrap the entire Playwright operation in a timeout
    const result = await Promise.race([
      (async () => {
        const page = await browser.newPage({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        })

        const pageTimeout = Number(process.env.SCRAPE_TIMEOUT_MS ?? 15000)
        await page.goto(url, { waitUntil: 'networkidle', timeout: pageTimeout })

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
          const nameElement = document.querySelector('h1[data-testid="product-detail__name"]') || 
                             document.querySelector('h1') ||
                             document.querySelector('[class*="product-name"]') ||
                             document.querySelector('[class*="card-name"]')
          const name = nameElement?.textContent?.trim() || ''

          // Set display extraction
          const setElement = document.querySelector('[data-testid="product-detail__set"]') ||
                            document.querySelector('[class*="set-name"]') ||
                            document.querySelector('[class*="product-set"]')
          const setDisplay = setElement?.textContent?.trim() || ''

          // JP Number extraction
          const jpNoMatch = document.body.textContent?.match(/\b\d{3}\/\d{3}\b/)
          const jpNo = jpNoMatch?.[0] || ''

          // Rarity extraction
          const rarityMatch = document.body.textContent?.match(/Rarity\s*[:|-]\s*([A-Za-z ]+)/i)
          const rarity = rarityMatch?.[1]?.trim() || ''

          // Image URL extraction with multiple selectors
          const imgSelectors = [
            'img[data-testid="product-detail__image"]',
            'img[alt*="product"]',
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

        const result = {
          url,
          productId,
          name: data.name || '',
          setDisplay: data.setDisplay || undefined,
          jpNo: data.jpNo ?? undefined,
          rarity: data.rarity ?? undefined,
          imageUrl,
          marketPrice: marketPrice ?? undefined,
        }
        
        // Validate the result
        const validatedResult = ScrapeResultSchema.parse(result)
        return validatedResult
      })(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Playwright operation timed out')), timeout)
      )
    ])

    return NextResponse.json(result)
  } finally {
    await browser.close()
  }
}

async function scrapeWithFallback(url: string, productId: string) {
  // Fallback method using basic HTTP request
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const html = await response.text()
    
    // Basic regex extraction (less reliable than Playwright but works in serverless)
    const nameMatch = html.match(/<title[^>]*>([^<]+)/i)
    const priceMatch = html.match(/\$(\d+\.?\d*)/)
    const imageMatch = html.match(/https:\/\/tcgplayer-cdn\.tcgplayer\.com\/product\/\d+_in_\d+x\d+\.jpg/)
    
    const result = {
      url,
      productId,
      name: nameMatch?.[1]?.replace(' - TCGplayer', '') || 'Unknown Card',
      setDisplay: undefined,
      jpNo: undefined,
      rarity: undefined,
      imageUrl: imageMatch?.[0] || `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`,
      marketPrice: priceMatch ? Number(priceMatch[1]) : undefined
    }
    
    return NextResponse.json(result)
  } catch (error) {
    console.error('Fallback scraping failed:', error)
    throw error
  }
}