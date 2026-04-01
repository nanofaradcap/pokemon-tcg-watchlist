import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function isAllowedPriceChartingUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    const isAllowedHost =
      parsed.hostname === 'www.pricecharting.com' || parsed.hostname === 'pricecharting.com'
    const isAllowedPath = parsed.pathname.startsWith('/game/')
    return parsed.protocol === 'https:' && isAllowedHost && isAllowedPath
  } catch {
    return false
  }
}

function extractPriceChartingImageUrl(html: string): string | null {
  const primaryMatch = html.match(
    /<div id="extra-images"[\s\S]*?<a href="(https:\/\/storage\.googleapis\.com\/images\.pricecharting\.com\/[^"]+\/1600\.jpg)"/i,
  )
  if (primaryMatch?.[1]) {
    return primaryMatch[1]
  }

  const fallbackMatch = html.match(
    /https:\/\/storage\.googleapis\.com\/images\.pricecharting\.com\/[^"'\s]+\/(1600|240)\.jpg/i,
  )
  if (fallbackMatch?.[0]) {
    return fallbackMatch[0].replace(/\/240\.jpg(?:\?.*)?$/i, '/1600.jpg')
  }

  return null
}

export async function GET(req: NextRequest) {
  try {
    const sourceUrl = req.nextUrl.searchParams.get('sourceUrl')
    if (!sourceUrl || !isAllowedPriceChartingUrl(sourceUrl)) {
      return NextResponse.json({ error: 'Invalid source URL' }, { status: 400 })
    }

    const response = await fetch(sourceUrl, {
      cache: 'no-store',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch source page' }, { status: 502 })
    }

    const html = await response.text()
    const imageUrl = extractPriceChartingImageUrl(html)
    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL not found' }, { status: 404 })
    }

    return NextResponse.json(
      { imageUrl },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  } catch (error) {
    console.error('Failed to resolve PriceCharting image URL:', error)
    return NextResponse.json({ error: 'Failed to resolve image URL' }, { status: 500 })
  }
}
