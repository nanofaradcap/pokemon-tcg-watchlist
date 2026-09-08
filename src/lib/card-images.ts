import { parseCardUrl } from './card-url'

export interface CardImageData {
  id: string
  name: string
  url: string
  imageUrl?: string
  productId?: string
  mergedUrls?: string[]
}

const TCGPLAYER_PRODUCT_ID_REGEX = /\/product\/(\d+)(?:\/|$|\?)/

const extractProductIdFromUrl = (url?: string): string | undefined => {
  if (!url || typeof url !== 'string') return undefined
  const match = url.match(TCGPLAYER_PRODUCT_ID_REGEX)
  return match?.[1]
}

const decodeNextImageProxyUrl = (url?: string): string | undefined => {
  if (!url || typeof url !== 'string') return undefined

  try {
    const parsedUrl = new URL(url)
    if (!parsedUrl.pathname.includes('/_next/image')) return undefined
    const innerUrl = parsedUrl.searchParams.get('url')
    if (!innerUrl) return undefined
    const decoded = decodeURIComponent(innerUrl)
    if (/^https?:\/\//i.test(decoded)) {
      return decoded
    }
  } catch {
    return undefined
  }

  return undefined
}

export const buildImageCandidates = (card: CardImageData): string[] => {
  const candidates = new Set<string>()

  const addCandidate = (url?: string) => {
    if (!url || typeof url !== 'string') return
    const trimmed = url.trim()
    if (!trimmed || !/^https?:\/\//i.test(trimmed)) return
    candidates.add(trimmed)

    // PriceCharting can serve either thumbnail or full-size; keep both as fallbacks.
    if (trimmed.includes('images.pricecharting.com/')) {
      const fullSize = trimmed.replace(/\/240\.jpg(?:\?.*)?$/, '/1600.jpg')
      const thumbnail = trimmed.replace(/\/1600\.jpg(?:\?.*)?$/, '/240.jpg')
      candidates.add(fullSize)
      candidates.add(thumbnail)
    }
  }

  // If a source accidentally stores a Next image proxy URL, prefer the decoded direct image first.
  addCandidate(decodeNextImageProxyUrl(card.imageUrl))
  addCandidate(card.imageUrl)

  const mergedProductId =
    extractProductIdFromUrl(card.url) ??
    card.mergedUrls?.map(extractProductIdFromUrl).find((id) => Boolean(id))

  const productId = (() => {
    const trimmedProductId = card.productId?.trim()
    if (trimmedProductId && /^\d+$/.test(trimmedProductId)) {
      return trimmedProductId
    }
    return mergedProductId
  })()

  if (productId) {
    addCandidate(`https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`)
    addCandidate(`https://product-images.tcgplayer.com/fit-in/1044x1044/${productId}.jpg`)
    addCandidate(`https://product-images.tcgplayer.com/${productId}.jpg`)
  }

  return Array.from(candidates)
}

export const getPriceChartingSourceUrl = (card: CardImageData): string | undefined => {
  for (const url of [card.url, ...(card.mergedUrls ?? [])]) {
    try {
      const source = parseCardUrl(url)
      if (source.sourceType === 'pricecharting') return source.url
    } catch {
      // Invalid legacy sources cannot be used for image recovery.
    }
  }
}

export function refreshedCardImage(current: string | null | undefined, candidate: unknown): string | undefined {
  if (typeof candidate !== 'string' || !candidate.startsWith('https://') || current === candidate) return undefined
  if (!current) return candidate
  // Replace rotated PriceCharting assets while preserving preferred TCGplayer images.
  const priceChartingImage = 'https://storage.googleapis.com/images.pricecharting.com/'
  if (current.startsWith(priceChartingImage) && candidate.startsWith(priceChartingImage)) return candidate
  return undefined
}
