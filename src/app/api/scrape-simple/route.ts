import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const BodySchema = z.object({
  url: z.string().url(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { url } = BodySchema.parse(body)

    // Validate TCGplayer URL
    if (!url.includes('tcgplayer.com/product/')) {
      return NextResponse.json(
        { error: 'Invalid TCGplayer URL format' },
        { status: 400 }
      )
    }

    // Extract productId from URL
    const productIdMatch = url.match(/\/product\/(\d+)\//)
    if (!productIdMatch) {
      return NextResponse.json(
        { error: 'Invalid TCGplayer URL format' },
        { status: 400 }
      )
    }
    const productId = productIdMatch[1]

    // Simple HTTP request to get basic data
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const html = await response.text()
    
    // Basic regex extraction
    const nameMatch = html.match(/<title[^>]*>([^<]+)/i)
    const priceMatch = html.match(/\$(\d+\.?\d*)/)
    
    // Extract name from title
    let name = 'Unknown Card'
    if (nameMatch) {
      name = nameMatch[1]
        .replace(' - TCGplayer', '')
        .replace(' | TCGplayer', '')
        .trim()
    }
    
    // Extract price
    let marketPrice: number | undefined
    if (priceMatch) {
      marketPrice = Number(priceMatch[1])
    }
    
    const result = {
      url,
      productId,
      name,
      setDisplay: undefined,
      jpNo: undefined,
      rarity: undefined,
      imageUrl: `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`,
      marketPrice
    }
    
    return NextResponse.json(result)
  } catch (error) {
    console.error('Simple scraping error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to scrape product data' },
      { status: 500 }
    )
  }
}
