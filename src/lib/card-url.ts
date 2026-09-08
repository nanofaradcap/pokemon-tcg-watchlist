import { z } from 'zod'

export type CardSourceType = 'tcgplayer' | 'pricecharting'

export function parseCardUrl(rawUrl: string): {
  url: string
  sourceType: CardSourceType
  productId: string
} {
  const parsed = new URL(rawUrl.trim())
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    throw new Error('Use an HTTPS card URL without credentials or a custom port')
  }

  const host = parsed.hostname
  const tcgMatch = parsed.pathname.match(/^\/product\/(\d+)(?:\/[^/]*)?\/?$/)
  const isPriceCharting = (host === 'pricecharting.com' || host === 'www.pricecharting.com')
    && /^\/game\/[^/]+\/[^/]+\/?$/.test(parsed.pathname)
  const isTcgplayer = (host === 'tcgplayer.com' || host === 'www.tcgplayer.com') && tcgMatch

  if (!isTcgplayer && !isPriceCharting) {
    throw new Error('Use a TCGplayer product or PriceCharting card URL')
  }

  parsed.search = ''
  parsed.hash = ''
  parsed.pathname = parsed.pathname.replace(/\/$/, '')
  return {
    url: parsed.toString(),
    sourceType: isTcgplayer ? 'tcgplayer' : 'pricecharting',
    productId: isTcgplayer ? tcgMatch![1] : '',
  }
}

export const cardUrlSchema = z.string().trim().max(2048).refine((url) => {
  try {
    parseCardUrl(url)
    return true
  } catch {
    return false
  }
}, 'Use an HTTPS TCGplayer product or PriceCharting card URL')
