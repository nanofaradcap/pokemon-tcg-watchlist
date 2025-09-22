import { chromium } from '@playwright/test'

export interface ScrapedData {
  url: string
  productId: string
  name: string
  setDisplay?: string
  jpNo?: string
  rarity?: string
  imageUrl?: string
  marketPrice?: number
}

export async function scrapeWithPlaywright(url: string, productId: string): Promise<ScrapedData> {
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
        
        return result
      })(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Playwright operation timed out')), timeout)
      )
    ])

    return result as ScrapedData
  } finally {
    await browser.close()
  }
}

