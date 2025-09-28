import chromium from '@sparticuz/chromium-min'

const DEFAULT_CHROMIUM_VERSION = 'v138.0.2'

function resolveChromiumPackUrl(): string {
  if (process.env.CHROMIUM_PACK_URL) {
    return process.env.CHROMIUM_PACK_URL
  }

  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return `https://github.com/Sparticuz/chromium/releases/download/${DEFAULT_CHROMIUM_VERSION}/chromium-${DEFAULT_CHROMIUM_VERSION}-pack.${arch}.tar`
}

type Browser = import('puppeteer-core').Browser
type LaunchOptions = import('puppeteer-core').LaunchOptions

type PuppeteerLike = {
  launch(options?: LaunchOptions): Promise<Browser>
}

let cachedPuppeteer: PuppeteerLike | null = null

async function loadPuppeteer(): Promise<PuppeteerLike> {
  if (cachedPuppeteer) return cachedPuppeteer

  const importedModule = process.env.VERCEL
    ? await import('puppeteer-core')
    : await import('puppeteer')

  const puppeteer = (importedModule && 'default' in importedModule ? importedModule.default : importedModule) as PuppeteerLike

  cachedPuppeteer = puppeteer
  return puppeteer
}

export interface ScrapedData {
  url: string
  productId: string
  name: string
  setDisplay?: string
  jpNo?: string
  cardNumber?: string
  rarity?: string
  imageUrl?: string
  marketPrice?: number
}

export async function scrapeWithPuppeteer(url: string, productId: string): Promise<ScrapedData> {
  let browser: Browser | null = null
  
  try {
    // Configure Puppeteer for Vercel
    const puppeteer = await loadPuppeteer()

    const launchOptions: LaunchOptions = {
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
        '--single-process',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ],
    }

    if (process.env.VERCEL) {
      const chromiumPackUrl = resolveChromiumPackUrl()
      const executablePath = await chromium.executablePath(chromiumPackUrl)

      if (!executablePath) {
        throw new Error('Failed to resolve Chromium executable path in Vercel environment')
      }

      launchOptions.headless = 'shell'
      launchOptions.args = chromium.args || launchOptions.args
      launchOptions.defaultViewport = { width: 1280, height: 720 }
      launchOptions.executablePath = executablePath
    }

    browser = await puppeteer.launch(launchOptions)

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

    // Extract data with structured return shape that serializes cleanly
    const data = await page.evaluate(() => {
      const parseNextData = () => {
        const nextDataEl = document.querySelector('#__NEXT_DATA__') as HTMLScriptElement | null
        if (!nextDataEl?.textContent) return null
        try {
          return JSON.parse(nextDataEl.textContent) as Record<string, unknown>
        } catch (err) {
          console.warn('Failed to parse __NEXT_DATA__ JSON:', err)
          return null
        }
      }

      const nextData = parseNextData() as
        | {
            props?: {
              pageProps?: {
                product?: {
                  media?: {
                    images?: Array<{ url?: string }>
                    cardImages?: Array<{ url?: string }>
                  }
                  image?: { url?: string }
                  productImage?: { url?: string }
                  images?: Array<{ url?: string }>
                }
              }
            }
          }
        | null
      // Market Price extraction - try multiple selectors
      let marketPriceText = ''
      
      // Try different price selectors
      const priceSelectors = [
        'span.price-points__upper__price',
        '[data-testid="price-points__upper__price"]',
        '.price-points__upper__price',
        '.market-price',
        '.price-points .price',
        '[class*="price-points"] [class*="price"]',
        '.product-details__pricing .price',
        '.pricing .price'
      ]
      
      for (const selector of priceSelectors) {
        const elements = Array.from(document.querySelectorAll(selector))
        if (elements.length > 0) {
          marketPriceText = elements[0]?.textContent?.trim() || ''
          if (marketPriceText && marketPriceText.includes('$')) {
            break
          }
        }
      }

      // Card name extraction from H1 element
      const nameElement = document.querySelector('h1[data-testid="lblProductDetailsProductName"]') ||
                         document.querySelector('h1[data-testid="product-detail__name"]') || 
                         document.querySelector('h1') ||
                         document.querySelector('[class*="product-name"]') ||
                         document.querySelector('[class*="card-name"]')
      const name = nameElement?.textContent?.trim() || ''
      
      // Extract card number from H1 element (e.g., "Magikarp - 080/073 - SV1a: Triplet Beat (SV1a)")
      let cardNumber = ''
      if (name) {
        const numberMatch = name.match(/- (\d+)\/\d+ -/)
        if (numberMatch) {
          cardNumber = numberMatch[1]
        }
      }

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
      let imageUrl = ''

      if (nextData?.props?.pageProps?.product) {
        const product = nextData.props.pageProps.product as {
          media?: {
            images?: Array<{ url?: string }>
            cardImages?: Array<{ url?: string }>
          }
          image?: { url?: string }
          productImage?: { url?: string }
          images?: Array<{ url?: string }>
        }

        const candidateUrls = [
          product.media?.images?.[0]?.url,
          product.media?.cardImages?.[0]?.url,
          product.image?.url,
          product.productImage?.url,
          product.images?.[0]?.url,
        ]

        imageUrl = candidateUrls.find((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0) || ''
      }

      if (!imageUrl) {
        const imgSelectors = [
          'img[data-testid="product-detail__image"]',
          'img[alt*="product"]',
          'img[src*="product-images.tcgplayer.com"]',
          'img[src*="tcgplayer-cdn.tcgplayer.com/product/"]'
        ]

        for (const selector of imgSelectors) {
          const img = document.querySelector(selector) as HTMLImageElement | null
          if (img?.src) {
            imageUrl = img.src
            break
          }
        }
      }

      return {
        marketPriceText,
        name,
        setDisplay,
        jpNo,
        rarity,
        imageUrl,
      }
    })

    // Normalize price
    const marketPrice = data.marketPriceText 
      ? Number(data.marketPriceText.replace(/[^0-9.]/g, '')) 
      : null

    const canonicalImageUrl = `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`

    // Prefer canonical CDN image; fall back only if scraping produced a URL on a different host.
    const scrapedImage = data.imageUrl || undefined
    const imageUrl = scrapedImage && !scrapedImage.includes('tcgplayer-cdn.tcgplayer.com/')
      ? scrapedImage
      : canonicalImageUrl

    return {
      url,
      productId,
      name: data.name || '',
      setDisplay: data.setDisplay || undefined,
      jpNo: data.jpNo || undefined,
      cardNumber: data.cardNumber || undefined,
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
