const DEFAULT_TCGPLAYER_AFFILIATE_BASE_URL =
  'https://partner.tcgplayer.com/c/7229328/1780961/21018'

const TCGPLAYER_HOSTS = new Set(['tcgplayer.com', 'www.tcgplayer.com'])

export const TCGPLAYER_AFFILIATE_DISCLOSURE =
  'Some TCGplayer links are paid links. We may earn a commission.'

const isHttpUrl = (url: URL) => url.protocol === 'https:' || url.protocol === 'http:'

export const isTcgplayerDestinationUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url)
    return isHttpUrl(parsedUrl) && TCGPLAYER_HOSTS.has(parsedUrl.hostname.toLowerCase())
  } catch {
    return false
  }
}

export const buildTcgplayerAffiliateUrl = (destinationUrl?: string | null): string | undefined => {
  if (!destinationUrl) return undefined

  let normalizedDestinationUrl: string
  try {
    const parsedDestinationUrl = new URL(destinationUrl)
    if (!isHttpUrl(parsedDestinationUrl) || !TCGPLAYER_HOSTS.has(parsedDestinationUrl.hostname.toLowerCase())) {
      return destinationUrl
    }
    normalizedDestinationUrl = parsedDestinationUrl.toString()
  } catch {
    return destinationUrl
  }

  const configuredBaseUrl = process.env.NEXT_PUBLIC_TCGPLAYER_AFFILIATE_BASE_URL?.trim()
  const baseUrl = configuredBaseUrl || DEFAULT_TCGPLAYER_AFFILIATE_BASE_URL

  try {
    const affiliateUrl = new URL(baseUrl)
    if (!isHttpUrl(affiliateUrl)) {
      return normalizedDestinationUrl
    }

    affiliateUrl.searchParams.set('u', normalizedDestinationUrl)
    return affiliateUrl.toString()
  } catch {
    return normalizedDestinationUrl
  }
}
