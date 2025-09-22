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
  // Enhanced fallback that extracts better data from URL patterns
  
  // Extract card name from URL - handle different patterns
  let name = 'Unknown Card'
  const namePatterns = [
    /pokemon-[^/]+-([^/]+)-(\d{3}-\d{3})/,  // pokemon-japan-sv11b-black-bolt-emolga-116-086
    /pokemon-[^/]+-([^/]+)/,                // pokemon-japan-sv2a-pokemon-card-151-bulbasaur-166-165
    /product\/\d+\/([^/]+)/                 // fallback pattern
  ]
  
  for (const pattern of namePatterns) {
    const match = url.match(pattern)
    if (match) {
      name = match[1]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .replace(/\bPokemon\b/g, 'Pokémon')
        .replace(/\bCard\b/g, '')
        .trim()
      break
    }
  }

  // Extract set information from URL
  let setDisplay: string | undefined
  const setPatterns = [
    /pokemon-japan-([^/]+)-/,  // pokemon-japan-sv11b-black-bolt-emolga
    /pokemon-([^/]+)-/         // pokemon-sv2a-pokemon-card-151
  ]
  
  for (const pattern of setPatterns) {
    const match = url.match(pattern)
    if (match) {
      setDisplay = match[1]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .replace(/\bSv/g, 'SV')
      break
    }
  }

  // Extract card number from URL
  let jpNo: string | undefined
  const numberMatch = url.match(/(\d{3})-(\d{3})/)
  if (numberMatch) {
    jpNo = `${numberMatch[1]}/${numberMatch[2]}`
  }

  // Try to extract rarity from URL patterns
  let rarity: string | undefined
  const rarityPatterns = [
    /-([a-z]+)-rarity/i,
    /-([a-z]+)-(\d{3}-\d{3})/i
  ]
  
  for (const pattern of rarityPatterns) {
    const match = url.match(pattern)
    if (match && !match[1].match(/\d/)) {
      rarity = match[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      break
    }
  }

  return {
    url,
    productId,
    name,
    setDisplay,
    jpNo,
    rarity,
    imageUrl: `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`,
    marketPrice: undefined, // Can't extract without JS
  }
}
