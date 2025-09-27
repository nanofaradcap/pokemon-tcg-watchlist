/**
 * Utility functions for matching cards from different sources
 */

export interface CardMatch {
  name: string
  number: string
}

/**
 * Extract card name and number from TCGplayer card name
 * Example: "Gardevoir ex - 348/190 - SV4a: Shiny Treasure ex (SV4a)"
 * Returns: { name: "Gardevoir ex", number: "348" }
 */
export function extractTCGplayerMatch(cardName: string): CardMatch | null {
  // Pattern: "Card Name - Number/Total - Set Name"
  const match = cardName.match(/^(.+?)\s*-\s*(\d+)\/\d+\s*-/)
  if (!match) return null
  
  return {
    name: match[1].trim(),
    number: match[2]
  }
}

/**
 * Normalize card name for comparison (remove extra spaces, convert to lowercase)
 */
export function normalizeCardName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Check if two cards are the same based on normalized name and number
 */
export function areCardsSame(card1: CardMatch, card2: CardMatch): boolean {
  return normalizeCardName(card1.name) === normalizeCardName(card2.name) && 
         card1.number === card2.number
}

/**
 * Extract card name and number from PriceCharting card name
 * Example: "Gardevoir ex #348 Pokemon Japanese Shiny Treasure ex"
 * Returns: { name: "Gardevoir ex", number: "348" }
 */
export function extractPriceChartingMatch(cardName: string): CardMatch | null {
  // Pattern: "Card Name #Number Set Name"
  const match = cardName.match(/^(.+?)\s*#(\d+)\s/)
  if (!match) return null
  
  return {
    name: match[1].trim(),
    number: match[2]
  }
}

/**
 * Check if two cards match based on name and number
 */
export function cardsMatch(card1: CardMatch, card2: CardMatch): boolean {
  return card1.name === card2.name && card1.number === card2.number
}

/**
 * Extract match data from any card name (auto-detect source)
 */
export function extractCardMatch(cardName: string, url: string): CardMatch | null {
  if (url.includes('tcgplayer.com')) {
    return extractTCGplayerMatch(cardName)
  } else if (url.includes('pricecharting.com')) {
    return extractPriceChartingMatch(cardName)
  }
  return null
}
