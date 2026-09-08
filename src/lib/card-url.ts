export type CardSourceType = 'tcgplayer' | 'pricecharting'

// PriceCharting renamed this listing; the old URL redirects to ambiguous search
// results. Keep the verified replacement exact so other languages/variants are untouched.
const PRICECHARTING_PATH_ALIASES: Record<string, string> = {
  '/game/pokemon-chinese-scarlet-&-violet-151/pikachu-171':
    '/game/pokemon-chinese-151-collect/pikachu-171',
}

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
  if (isPriceCharting) {
    parsed.pathname = PRICECHARTING_PATH_ALIASES[parsed.pathname] ?? parsed.pathname
  }
  return {
    url: parsed.toString(),
    sourceType: isTcgplayer ? 'tcgplayer' : 'pricecharting',
    productId: isTcgplayer ? tcgMatch![1] : '',
  }
}
