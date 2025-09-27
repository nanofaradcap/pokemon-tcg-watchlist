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

export interface PriceChartingData {
  url: string
  name: string
  setDisplay?: string
  cardNumber?: string
  imageUrl?: string
  ungradedPrice?: number
  grade9Price?: number
  grade10Price?: number
  grade7Price?: number
  grade8Price?: number
  grade95Price?: number
}

export async function scrapePriceCharting(url: string): Promise<PriceChartingData> {
  let browser: Browser | null = null
  const timeout = 25000 // 25 seconds (leaving 5s buffer for Vercel's 30s limit)

  try {
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

    const result = await Promise.race([
      (async () => {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 })

        // Wait for price table to appear
        try {
          await page.waitForSelector('#price_data', { timeout: 12000 })
        } catch {
          await page.waitForSelector('.price', { timeout: 8000 })
        }

        // Wait for product name
        try {
          await page.waitForSelector('#product_name', { timeout: 10000 })
        } catch {
          // Continue even if product name doesn't appear
        }

        const data = await page.evaluate(() => {
          // Extract product name
          const nameElement = document.querySelector('#product_name')
          let name = ''
          let setDisplay = ''
          let cardNumber = ''

          if (nameElement) {
            const nameText = nameElement.textContent?.trim() || ''
            // Extract card number from name (e.g., "Mew ex #232")
            const numberMatch = nameText.match(/#(\d+)/)
            cardNumber = numberMatch?.[1] || ''
            
            // Extract set name from the link
            const setLink = nameElement.querySelector('a')
            setDisplay = setLink?.textContent?.trim() || ''
            
            // Clean up the name - remove card number and set name, keep only the card name
            // The structure is typically "Card Name #Number Set Name"
            let cleanName = nameText.replace(/\s*#\d+\s*/, '').trim()
            
            // Remove the set name from the end if it's there
            if (setDisplay && cleanName.endsWith(setDisplay)) {
              cleanName = cleanName.replace(new RegExp(`\\s*${setDisplay.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '').trim()
            }
            
            // Add dash between card name and set name
            name = setDisplay ? `${cleanName} - ${setDisplay}` : cleanName
          }

          // Extract prices from the price table
          const priceTable = document.querySelector('#price_data')
          let ungradedPrice: number | undefined
          let grade7Price: number | undefined
          let grade8Price: number | undefined
          let grade9Price: number | undefined
          let grade95Price: number | undefined
          let grade10Price: number | undefined

          if (priceTable) {
            // Ungraded price (used_price)
            const ungradedElement = priceTable.querySelector('#used_price .price')
            if (ungradedElement) {
              const priceText = ungradedElement.textContent?.replace(/[^0-9.]/g, '') || ''
              ungradedPrice = priceText ? Number(priceText) : undefined
            }

            // Grade 7 price (complete_price)
            const grade7Element = priceTable.querySelector('#complete_price .price')
            if (grade7Element) {
              const priceText = grade7Element.textContent?.replace(/[^0-9.]/g, '') || ''
              grade7Price = priceText ? Number(priceText) : undefined
            }

            // Grade 8 price (new_price)
            const grade8Element = priceTable.querySelector('#new_price .price')
            if (grade8Element) {
              const priceText = grade8Element.textContent?.replace(/[^0-9.]/g, '') || ''
              grade8Price = priceText ? Number(priceText) : undefined
            }

            // Grade 9 price (graded_price)
            const grade9Element = priceTable.querySelector('#graded_price .price')
            if (grade9Element) {
              const priceText = grade9Element.textContent?.replace(/[^0-9.]/g, '') || ''
              grade9Price = priceText ? Number(priceText) : undefined
            }

            // Grade 9.5 price (box_only_price)
            const grade95Element = priceTable.querySelector('#box_only_price .price')
            if (grade95Element) {
              const priceText = grade95Element.textContent?.replace(/[^0-9.]/g, '') || ''
              grade95Price = priceText ? Number(priceText) : undefined
            }

            // Grade 10 price (manual_only_price)
            const grade10Element = priceTable.querySelector('#manual_only_price .price')
            if (grade10Element) {
              const priceText = grade10Element.textContent?.replace(/[^0-9.]/g, '') || ''
              grade10Price = priceText ? Number(priceText) : undefined
            }
          }

          // Extract image URL
          let imageUrl = ''
          const imageElement = document.querySelector('#extra-images img') as HTMLImageElement
          if (imageElement?.src) {
            // Convert from 240px to 1600px version
            imageUrl = imageElement.src.replace('/240.jpg', '/1600.jpg')
          }

          return {
            name,
            setDisplay,
            cardNumber,
            imageUrl,
            ungradedPrice,
            grade7Price,
            grade8Price,
            grade9Price,
            grade95Price,
            grade10Price
          }
        })

        return {
          url,
          name: data.name || 'Unknown Card',
          setDisplay: data.setDisplay || undefined,
          cardNumber: data.cardNumber || undefined,
          imageUrl: data.imageUrl || undefined,
          ungradedPrice: data.ungradedPrice,
          grade7Price: data.grade7Price,
          grade8Price: data.grade8Price,
          grade9Price: data.grade9Price,
          grade95Price: data.grade95Price,
          grade10Price: data.grade10Price
        }
      })(),
      new Promise<PriceChartingData>((_, reject) => 
        setTimeout(() => reject(new Error('PriceCharting scraping timed out')), timeout)
      )
    ])

    return result as PriceChartingData
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
