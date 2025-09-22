import puppeteer, { Browser } from 'puppeteer-core'

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

export async function scrapeWithPuppeteer(url: string, productId: string): Promise<ScrapedData> {
  let browser: Browser | null = null
  
  try {
    // Use Chromium from the system or Vercel's built-in browser
    browser = await puppeteer.launch({
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
        '--disable-features=VizDisplayCompositor',
        '--single-process'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    })

    const page = await browser.newPage()
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')
    
    // Set viewport
    await page.setViewport({ width: 1280, height: 720 })
    
    // Navigate to the page with timeout
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 15000 
    })

    // Wait for content to load
    try {
      await page.waitForSelector('h1', { timeout: 10000 })
    } catch {
      // Continue even if h1 doesn't appear
    }

    // Extract data
    const data = await page.evaluate(() => {
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

      // Image URL extraction
      const imgSelectors = [
        'img[data-testid="product-detail__image"]',
        'img[alt*="product"]',
        'img[src*="product-images.tcgplayer.com"]',
        'img[src*="tcgplayer-cdn.tcgplayer.com/product/"]'
      ]
      
      let imageUrl = ''
      for (const selector of imgSelectors) {
        const img = document.querySelector(selector) as HTMLImageElement | null
        if (img?.src) {
          imageUrl = img.src
          break
        }
      }

      return {
        marketPriceText,
        name,
        setDisplay,
        jpNo,
        rarity,
        imageUrl
      }
    })

    // Normalize price
    const marketPrice = data.marketPriceText 
      ? Number(data.marketPriceText.replace(/[^0-9.]/g, '')) 
      : null

    // Construct or normalize image URL
    let imageUrl = data.imageUrl || `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`
    const cdnMatch = imageUrl.match(/^(https:\/\/tcgplayer-cdn\.tcgplayer\.com\/product\/)\d+_in_\d+x\d+(\.jpg)$/)
    if (cdnMatch) {
      imageUrl = `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`
    }

    return {
      url,
      productId,
      name: data.name || '',
      setDisplay: data.setDisplay || undefined,
      jpNo: data.jpNo || undefined,
      rarity: data.rarity || undefined,
      imageUrl,
      marketPrice: marketPrice || undefined,
    }

  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
