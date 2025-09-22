// Fallback scraping method for production when Playwright isn't available
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

export async function scrapeWithFallback(url: string, productId: string): Promise<ScrapedData> {
  // For production, we'll use a more basic approach
  // Extract what we can from the URL and provide reasonable defaults
  
  // Extract card name from URL
  let name = 'Unknown Card'
  const urlMatch = url.match(/pokemon-[^/]+-([^/]+)/)
  if (urlMatch) {
    name = urlMatch[1]
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
  } else {
    name = `Card ${productId}`
  }

  // Try to extract set information from URL
  let setDisplay: string | undefined
  const setMatch = url.match(/pokemon-[^/]+-([^/]+)-([^/]+)/)
  if (setMatch) {
    setDisplay = setMatch[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  // Try to extract card number from URL
  let jpNo: string | undefined
  const numberMatch = url.match(/(\d{3})-(\d{3})/)
  if (numberMatch) {
    jpNo = `${numberMatch[1]}/${numberMatch[2]}`
  }

  return {
    url,
    productId,
    name,
    setDisplay,
    jpNo,
    rarity: undefined, // Can't extract without JS
    imageUrl: `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`,
    marketPrice: undefined, // Can't extract without JS
  }
}
