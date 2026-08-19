/**
 * Utility functions for matching cards from different sources
 */

export interface CardMatch {
  name: string
  number: string
  // Optional set/edition display name (e.g. "SV4a: Shiny Treasure ex (SV4a)").
  // When present on both sides of a comparison, areCardsSame() uses it to guard
  // against the numerator-only `number` field colliding across unrelated sets.
  setDisplay?: string
}

/**
 * Extract card name and number from TCGplayer card name
 * Example: "Gardevoir ex - 348/190 - SV4a: Shiny Treasure ex (SV4a)"
 * Returns: { name: "Gardevoir ex", number: "348" }
 */
export function extractTCGplayerMatch(cardName: string): CardMatch | null {
  // Pattern: "Card Name - Number/Total - Set Name"
  const match = cardName.match(/^(.+?)\s*-\s*(\d+)\/\d+\s*-/)
  if (match) {
    return {
      name: match[1].trim(),
      number: match[2]
    }
  }
  
  // Pattern: "Card Name - Number/Total" (without set name)
  const match2 = cardName.match(/^(.+?)\s*-\s*(\d+)\/\d+$/)
  if (match2) {
    return {
      name: match2[1].trim(),
      number: match2[2]
    }
  }
  
  // Pattern: "Card Name #Number" (PriceCharting style)
  const match3 = cardName.match(/^(.+?)\s*#(\d+)/)
  if (match3) {
    return {
      name: match3[1].trim(),
      number: match3[2]
    }
  }
  
  // Fallback: Try to extract number from URL-style names like "pokemon sv01 scarlet and violet base set gardevoir ex 245 198"
  const numberMatch = cardName.match(/(\d+)\s+(\d+)$/)
  if (numberMatch) {
    const cardNumber = numberMatch[1]
    const nameWithoutNumber = cardName.replace(/\s+\d+\s+\d+$/, '').trim()
    return {
      name: nameWithoutNumber,
      number: cardNumber
    }
  }
  
  // Last resort: try to find any number in the name
  const anyNumberMatch = cardName.match(/(\d+)/)
  if (anyNumberMatch) {
    return {
      name: cardName,
      number: anyNumberMatch[1]
    }
  }
  
  return null
}

/**
 * Normalize card name for comparison (remove extra spaces, convert to lowercase)
 */
export function normalizeCardName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Check if two cards are the same based on normalized name and number.
 *
 * NOTE ON REMAINING RISK: `number` is only the numerator portion of a card's
 * set number (e.g. "025"), which is not unique across sets — many different
 * sets contain a card numbered "025". When both cards carry `setDisplay`
 * (populated once a source has been scraped), we additionally require the
 * set names to overlap, which rules out most cross-set collisions. But
 * `setDisplay` is not always available (e.g. before a URL has been scraped,
 * or if a scrape only partially succeeds), and even when present, TCGplayer
 * and PriceCharting format set names differently, so containment may not
 * catch every case. In those situations this function still falls back to
 * name+number matching alone, which can produce false-positive matches
 * across unrelated sets that happen to share a card name and a numerator.
 * Callers that merge data based on a match (see CardService.mergeWithExisting)
 * should avoid letting a match blindly overwrite fields that a false positive
 * could corrupt (e.g. productId - see updateCardSource).
 */
export function areCardsSame(card1: CardMatch, card2: CardMatch): boolean {
  // Normalize numbers by removing leading zeros
  const normalizeNumber = (num: string) => num.replace(/^0+/, '') || '0'
  const normalizedNumber1 = normalizeNumber(card1.number)
  const normalizedNumber2 = normalizeNumber(card2.number)

  if (!doNamesAndNumberMatch(card1, card2, normalizedNumber1, normalizedNumber2)) {
    return false
  }

  // Additional guard: when both sides have set/display info, require it to
  // overlap too. See the NOTE ON REMAINING RISK above for what this does and
  // does not protect against.
  if (card1.setDisplay && card2.setDisplay) {
    const set1 = normalizeCardName(card1.setDisplay)
    const set2 = normalizeCardName(card2.setDisplay)
    if (set1 !== set2 && !set1.includes(set2) && !set2.includes(set1)) {
      return false
    }
  }

  return true
}

/**
 * Name+number matching logic extracted from areCardsSame(). See the
 * "NOTE ON REMAINING RISK" comment on areCardsSame for the known limitation
 * of matching on name + numerator alone.
 */
function doNamesAndNumberMatch(
  card1: CardMatch,
  card2: CardMatch,
  normalizedNumber1: string,
  normalizedNumber2: string
): boolean {
  // Exact match first
  if (normalizeCardName(card1.name) === normalizeCardName(card2.name) &&
      normalizedNumber1 === normalizedNumber2) {
    return true
  }

  // Fuzzy matching for similar card names
  const name1 = normalizeCardName(card1.name)
  const name2 = normalizeCardName(card2.name)

  // Extract the core card name (remove set names, etc.)
  const coreName1 = extractCoreCardName(name1)
  const coreName2 = extractCoreCardName(name2)

  // Check if core names match and numbers are the same
  if (coreName1 === coreName2 && normalizedNumber1 === normalizedNumber2) {
    return true
  }

  // Check if one name contains the other and numbers match
  if ((name1.includes(coreName2) || name2.includes(coreName1)) && normalizedNumber1 === normalizedNumber2) {
    return true
  }

  // Check if the core names are similar (one contains the other) and numbers match
  if ((coreName1.includes(coreName2) || coreName2.includes(coreName1)) && normalizedNumber1 === normalizedNumber2) {
    return true
  }

  // Check if one name contains the other (without core extraction) and numbers match
  if ((name1.includes(name2) || name2.includes(name1)) && normalizedNumber1 === normalizedNumber2) {
    return true
  }

  // Check if the core names match when removing numbers from the second name
  const coreName2WithoutNumber = coreName2.replace(/\s*\d+\s*/, ' ').trim()
  if ((coreName1.includes(coreName2WithoutNumber) || coreName2WithoutNumber.includes(coreName1)) && normalizedNumber1 === normalizedNumber2) {
    return true
  }

  return false
}

/**
 * Extract the core card name by removing set names and common suffixes
 */
function extractCoreCardName(name: string): string {
  return name
    .replace(/\s*(pokemon|japanese|mask|of|change|transformation|sv6|sv4a|sv1a|shiny|treasure|ex|triplet|beat)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Extract card name and number from PriceCharting card name
 * Example: "Gardevoir ex #348 Pokemon Japanese Shiny Treasure ex"
 * Returns: { name: "Gardevoir ex", number: "348" }
 */
export function extractPriceChartingMatch(cardName: string): CardMatch | null {
  // Pattern: "Card Name #Number Set Name"
  const match = cardName.match(/^(.+?)\s*#(\d+)\s/)
  if (match) {
    return {
      name: match[1].trim(),
      number: match[2]
    }
  }
  
  // Pattern: "Card Name #Number" (without set name)
  const match2 = cardName.match(/^(.+?)\s*#(\d+)$/)
  if (match2) {
    return {
      name: match2[1].trim(),
      number: match2[2]
    }
  }
  
  // Pattern: "Card Name - Number/Total" (TCGplayer style)
  const match3 = cardName.match(/^(.+?)\s*-\s*(\d+)\/\d+/)
  if (match3) {
    return {
      name: match3[1].trim(),
      number: match3[2]
    }
  }
  
  // Last resort: try to find any number in the name
  const anyNumberMatch = cardName.match(/(\d+)/)
  if (anyNumberMatch) {
    return {
      name: cardName,
      number: anyNumberMatch[1]
    }
  }
  
  return null
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
export function extractCardMatch(cardName: string, url: string, cardNumber?: string): CardMatch | null {
  // Validate inputs
  if (!url || typeof url !== 'string') {
    console.warn('Invalid URL provided to extractCardMatch:', url)
    return null
  }
  
  if (!cardName || typeof cardName !== 'string') {
    console.warn('Invalid cardName provided to extractCardMatch:', cardName)
    return null
  }
  
  if (url.includes('tcgplayer.com')) {
    const match = extractTCGplayerMatch(cardName)
    // If we have a card number from URL, use it instead
    if (match && cardNumber) {
      return {
        name: match.name,
        number: cardNumber
      }
    }
    return match
  } else if (url.includes('pricecharting.com')) {
    // For PriceCharting URLs, if we have cardNumber from URL parsing, use it directly
    // The cardName should already be cleaned by URL parsing (number removed)
    if (cardNumber && cardName) {
      return {
        name: cardName.trim(),
        number: cardNumber
      }
    }
    
    // Fallback: try to extract from cardName using patterns
    const match = extractPriceChartingMatch(cardName)
    return match
  }
  return null
}
