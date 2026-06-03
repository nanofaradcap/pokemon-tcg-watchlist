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

interface MarketPriceCandidate {
  price: number
  source: string
  confidence: number
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
  No?: string
  cardNumber?: string
  rarity?: string
  imageUrl?: string
  marketPrice?: number
}

function parsePriceValue(value: unknown, requireCurrency = false): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return null
  }

  if (requireCurrency && !/[$]|usd/i.test(normalized)) {
    return null
  }

  const match = normalized.match(/\$?\s*([0-9][0-9,]*)(?:\.([0-9]{1,2}))?/)
  if (!match) {
    return null
  }

  const parsed = Number(`${match[1].replace(/,/g, '')}.${match[2] ?? '00'}`)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function pushPriceCandidate(
  candidates: MarketPriceCandidate[],
  price: number | null,
  source: string,
  confidence: number
) {
  if (price !== null) {
    candidates.push({ price, source, confidence })
  }
}

function collectMarketPriceCandidates(
  value: unknown,
  candidates: MarketPriceCandidate[],
  path: string[] = [],
  depth = 0
) {
  if (depth > 8 || value === null || value === undefined) {
    return
  }

  if (typeof value === 'string') {
    const directMatch = value.match(/market\s*price[^$]{0,120}(\$[0-9][0-9,.]*(?:\.[0-9]{2})?)/i)
    if (directMatch) {
      pushPriceCandidate(candidates, parsePriceValue(directMatch[1], true), `text:${path.join('.')}`, 70)
    }
    return
  }

  if (typeof value !== 'object') {
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectMarketPriceCandidates(item, candidates, [...path, String(index)], depth + 1)
    })
    return
  }

  const record = value as Record<string, unknown>
  const labelText = ['label', 'name', 'title', 'displayName', 'type', 'metric']
    .map((key) => (typeof record[key] === 'string' ? record[key] : ''))
    .join(' ')
  const objectLooksLikeMarketPrice = /market\s*price|marketprice/i.test(labelText)

  if (objectLooksLikeMarketPrice) {
    for (const key of ['price', 'value', 'amount', 'displayValue', 'formattedValue', 'text']) {
      pushPriceCandidate(
        candidates,
        parsePriceValue(record[key], false),
        `labeled-object:${[...path, key].join('.')}`,
        95
      )
    }
  }

  for (const [key, child] of Object.entries(record)) {
    const nextPath = [...path, key]
    const pathText = nextPath.join('.')
    const keyLooksLikeMarketPrice = /market/i.test(pathText) && /(price|value|amount)/i.test(pathText)

    if (keyLooksLikeMarketPrice) {
      pushPriceCandidate(
        candidates,
        parsePriceValue(child, false),
        `key:${pathText}`,
        100
      )

      if (child && typeof child === 'object') {
        const childRecord = child as Record<string, unknown>
        for (const childKey of ['price', 'value', 'amount', 'displayValue', 'formattedValue', 'text']) {
          pushPriceCandidate(
            candidates,
            parsePriceValue(childRecord[childKey], false),
            `key-object:${[...nextPath, childKey].join('.')}`,
            98
          )
        }
      }
    }

    collectMarketPriceCandidates(child, candidates, nextPath, depth + 1)
  }
}

function chooseBestPriceCandidate(candidates: MarketPriceCandidate[]): MarketPriceCandidate | null {
  const validCandidates = candidates.filter((candidate) => (
    Number.isFinite(candidate.price) &&
    candidate.price > 0 &&
    candidate.price < 100_000
  ))

  validCandidates.sort((a, b) => b.confidence - a.confidence || a.price - b.price)
  return validCandidates[0] ?? null
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
    const networkPriceCandidates: MarketPriceCandidate[] = []
    const networkCandidateReads: Promise<void>[] = []

    page.on('response', async (response) => {
      const readCandidate = async () => {
        const responseUrl = response.url()
        const contentType = response.headers()['content-type'] ?? ''
        if (!/json/i.test(contentType)) return
        if (!/price|pricing|catalog|product|listing|seller|inventory|search|graphql/i.test(responseUrl)) return

        try {
          const responseJson = await response.json()
          collectMarketPriceCandidates(responseJson, networkPriceCandidates, [responseUrl])
        } catch {
          // Some matching endpoints are not JSON despite headers, or stream bodies.
        }
      }

      const pendingRead = readCandidate()
      networkCandidateReads.push(pendingRead)
    })
    
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

    await Promise.allSettled(networkCandidateReads)

    // Extract data with structured return shape that serializes cleanly
    const data = await page.evaluate(() => {
      const parsePriceText = (value: string): number | null => {
        const match = value.replace(/\s+/g, ' ').match(/\$[0-9][0-9,.]*(?:\.[0-9]{2})?/)
        if (!match) return null
        const parsed = Number(match[0].replace(/[^0-9.]/g, ''))
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null
      }

      const cleanText = (value: string | null | undefined): string => (
        value?.replace(/\s+/g, ' ').trim() ?? ''
      )

      const findMarketPriceInObject = (value: unknown, depth = 0): number | null => {
        if (depth > 8 || value === null || value === undefined) return null

        if (typeof value === 'string') {
          const marketMatch = value.match(/market\s*price[^$]{0,120}(\$[0-9][0-9,.]*(?:\.[0-9]{2})?)/i)
          return marketMatch ? parsePriceText(marketMatch[1]) : null
        }

        if (typeof value !== 'object') return null

        if (Array.isArray(value)) {
          for (const item of value) {
            const price = findMarketPriceInObject(item, depth + 1)
            if (price !== null) return price
          }
          return null
        }

        const record = value as Record<string, unknown>
        const labelText = ['label', 'name', 'title', 'displayName', 'type', 'metric']
          .map((key) => (typeof record[key] === 'string' ? record[key] : ''))
          .join(' ')

        if (/market\s*price|marketprice/i.test(labelText)) {
          for (const key of ['price', 'value', 'amount', 'displayValue', 'formattedValue', 'text']) {
            const candidate = record[key]
            const price = typeof candidate === 'number'
              ? candidate
              : typeof candidate === 'string'
                ? parsePriceText(candidate) ?? Number(candidate.replace(/[^0-9.]/g, ''))
                : null

            if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
              return price
            }
          }
        }

        for (const [key, child] of Object.entries(record)) {
          if (/market/i.test(key) && /(price|value|amount)/i.test(key)) {
            if (typeof child === 'number' && Number.isFinite(child) && child > 0) return child
            if (typeof child === 'string') {
              const price = parsePriceText(child) ?? Number(child.replace(/[^0-9.]/g, ''))
              if (Number.isFinite(price) && price > 0) return price
            }
          }

          const nestedPrice = findMarketPriceInObject(child, depth + 1)
          if (nestedPrice !== null) return nestedPrice
        }

        return null
      }

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

      const scriptMarketPrice = Array.from(document.scripts)
        .map((script) => {
          if (!script.textContent || !/market\s*price|marketprice|pricing/i.test(script.textContent)) {
            return null
          }
          try {
            return findMarketPriceInObject(JSON.parse(script.textContent))
          } catch {
            const match = script.textContent.match(/market\s*price[^$]{0,120}(\$[0-9][0-9,.]*(?:\.[0-9]{2})?)/i)
            return match ? parsePriceText(match[1]) : null
          }
        })
        .find((price): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0)

      const nextDataMarketPrice = findMarketPriceInObject(nextData)

      // Market Price extraction - try selectors plus nearby label text.
      let marketPriceText = ''
      let marketPriceNumber = scriptMarketPrice ?? nextDataMarketPrice ?? null
      
      // Try different price selectors
      const priceSelectors = [
        'span.price-points__upper__price',
        '[data-testid="price-points__upper__price"]',
        '[data-testid*="market" i]',
        '[data-testid*="price" i]',
        '[aria-label*="market" i]',
        '[aria-label*="price" i]',
        '.price-points__upper__price',
        '.market-price',
        '[class*="market" i]',
        '.price-points .price',
        '[class*="price-points"] [class*="price"]',
        '[class*="price" i]',
        '.product-details__pricing .price',
        '.pricing .price'
      ]
      
      for (const selector of priceSelectors) {
        const elements = Array.from(document.querySelectorAll(selector))
        if (elements.length > 0) {
          const isKnownMarketSelector = selector.includes('price-points__upper__price')
          const pricedElement = elements.find((element) => {
            const ownText = cleanText(element.textContent)
            const context = cleanText(element.parentElement?.textContent)
            const price = parsePriceText(ownText) ?? parsePriceText(context)
            if (price === null) return false
            if (/market/i.test(context) || /market/i.test(ownText) || selector.includes('market') || isKnownMarketSelector) {
              marketPriceNumber = price
              marketPriceText = ownText || context
              return true
            }
            return false
          })

          if (pricedElement || marketPriceNumber !== null) {
            break
          }
        }
      }

      if (marketPriceNumber === null) {
        const marketLabels = Array.from(document.querySelectorAll('body *'))
          .filter((element) => /market\s*price/i.test(cleanText(element.textContent)))
          .sort((a, b) => cleanText(a.textContent).length - cleanText(b.textContent).length)

        for (const label of marketLabels) {
          const nearbyText = [
            cleanText(label.textContent),
            cleanText(label.parentElement?.textContent),
            cleanText(label.parentElement?.parentElement?.textContent),
            cleanText(label.nextElementSibling?.textContent),
            cleanText(label.previousElementSibling?.textContent),
          ].join(' ')

          const price = parsePriceText(nearbyText)
          if (price !== null) {
            marketPriceNumber = price
            marketPriceText = nearbyText
            break
          }
        }
      }

      if (marketPriceNumber === null) {
        const bodyMatch = cleanText(document.body.textContent).match(/market\s*price[^$]{0,120}(\$[0-9][0-9,.]*(?:\.[0-9]{2})?)/i)
        if (bodyMatch) {
          marketPriceNumber = parsePriceText(bodyMatch[1])
          marketPriceText = bodyMatch[0]
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
      const No = jpNoMatch?.[0] || ''

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
        marketPrice: marketPriceNumber,
        name,
        setDisplay,
        No,
        cardNumber,
        rarity,
        imageUrl,
      }
    })

    await Promise.allSettled(networkCandidateReads)

    // Normalize price
    const networkMarketPrice = chooseBestPriceCandidate(networkPriceCandidates)
    const marketPrice = networkMarketPrice?.price ??
      data.marketPrice ??
      parsePriceValue(data.marketPriceText, true)

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
      No: data.No || undefined,
      cardNumber: data.cardNumber || undefined,
      rarity: data.rarity || undefined,
      imageUrl,
      marketPrice: marketPrice ?? undefined,
    }

  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
