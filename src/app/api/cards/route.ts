export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { scrapeWithPuppeteer, type ScrapedData } from '@/lib/puppeteer-scraping'
import { scrapeWithFallback } from '@/lib/scraping-fallback'
import { scrapePriceCharting, type PriceChartingData } from '@/lib/pricecharting-scraping'
import { findMatchingCards, mergeCardWithExisting } from '@/lib/card-merging'

const Profiles = ['Chen', 'Tiff', 'Pho', 'Ying', 'Son', 'Candice', 'Claude', 'Rachel', 'Roxanne'] as const
type Profile = typeof Profiles[number]

const AddCardSchema = z.object({
  url: z.string().url().max(2048, 'URL too long'), // Max 2KB URL length
  profile: z.enum(Profiles as unknown as [Profile, ...Profile[]]).optional(),
})

const UpdateCardSchema = z.object({
  setDisplay: z.string().optional(),
  jpNo: z.string().optional(),
  rarity: z.string().optional(),
})

// GET /api/cards - Get all cards
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const profile = (searchParams.get('profile') as Profile) || 'Chen'

    // Validate profile
    if (!Profiles.includes(profile)) {
      return NextResponse.json(
        { error: 'Invalid profile name' },
        { status: 400 }
      )
    }

    // Ensure profile exists
    let profileRow = await prisma.profile.findUnique({ where: { name: profile } })
    if (!profileRow) {
      profileRow = await prisma.profile.create({ data: { name: profile } })
    }

    const rows = await prisma.profileCard.findMany({
      where: { profileId: profileRow.id },
      orderBy: { createdAt: 'desc' },
      include: { card: true },
    })

    // Group cards by merge group and consolidate
    const cardGroups = new Map<string, typeof rows>()
    const singleCards: typeof rows = []

    // Group cards by mergeGroupId or keep singles separate
    for (const row of rows) {
      if (row.card.isMerged && row.card.mergeGroupId) {
        if (!cardGroups.has(row.card.mergeGroupId)) {
          cardGroups.set(row.card.mergeGroupId, [])
        }
        cardGroups.get(row.card.mergeGroupId)!.push(row)
      } else {
        singleCards.push(row)
      }
    }

    const result = []

    // Process single (non-merged) cards
    for (const r of singleCards) {
      result.push({
        id: r.id,
        url: r.card.url,
        productId: r.card.productId,
        name: r.card.name,
        setDisplay: r.setDisplay ?? r.card.setDisplay ?? undefined,
        jpNo: r.jpNo ?? r.card.jpNo ?? undefined,
        rarity: r.rarity ?? r.card.rarity ?? undefined,
        imageUrl: r.card.imageUrl ?? undefined,
        marketPrice: r.card.marketPrice ?? undefined,
        currency: r.card.currency,
        ungradedPrice: r.card.ungradedPrice ?? undefined,
        grade7Price: r.card.grade7Price ?? undefined,
        grade8Price: r.card.grade8Price ?? undefined,
        grade9Price: r.card.grade9Price ?? undefined,
        grade95Price: r.card.grade95Price ?? undefined,
        grade10Price: r.card.grade10Price ?? undefined,
        lastCheckedAt: r.card.lastCheckedAt,
        createdAt: r.createdAt,
        updatedAt: r.card.updatedAt,
        isMerged: false,
        mergedUrls: [r.card.url],
        mergedSources: [r.card.url.includes('tcgplayer.com') ? 'TCGplayer' : 'PriceCharting'],
      })
    }

    // Process merged card groups
    for (const [, groupRows] of cardGroups) {
      if (groupRows.length === 0) continue

      // Find the primary card (usually the first one or the one without mergedWith)
      const primaryRow = groupRows.find(r => !r.card.mergedWith) || groupRows[0]
      
      // Collect all URLs and sources from the group
      const mergedUrls: string[] = []
      const mergedSources: string[] = []
      
      // Consolidate pricing data from all cards in the group
      let marketPrice: number | null = null
      let ungradedPrice: number | null = null
      let grade7Price: number | null = null
      let grade8Price: number | null = null
      let grade9Price: number | null = null
      let grade95Price: number | null = null
      let grade10Price: number | null = null
      let imageUrl: string | null = null
      let lastCheckedAt: string | null = null

      for (const row of groupRows) {
        mergedUrls.push(row.card.url)
        mergedSources.push(row.card.url.includes('tcgplayer.com') ? 'TCGplayer' : 'PriceCharting')
        
        // Merge pricing data, prioritizing non-null values
        marketPrice = marketPrice ?? row.card.marketPrice
        ungradedPrice = ungradedPrice ?? row.card.ungradedPrice
        grade7Price = grade7Price ?? row.card.grade7Price
        grade8Price = grade8Price ?? row.card.grade8Price
        grade9Price = grade9Price ?? row.card.grade9Price
        grade95Price = grade95Price ?? row.card.grade95Price
        grade10Price = grade10Price ?? row.card.grade10Price
        imageUrl = imageUrl ?? row.card.imageUrl
        lastCheckedAt = lastCheckedAt ?? (row.card.lastCheckedAt ? row.card.lastCheckedAt.toISOString() : null)
      }

      result.push({
        id: primaryRow.id,
        url: primaryRow.card.url, // Use primary card's URL
        productId: primaryRow.card.productId,
        name: primaryRow.card.name,
        setDisplay: primaryRow.setDisplay ?? primaryRow.card.setDisplay ?? undefined,
        jpNo: primaryRow.jpNo ?? primaryRow.card.jpNo ?? undefined,
        rarity: primaryRow.rarity ?? primaryRow.card.rarity ?? undefined,
        imageUrl: imageUrl ?? undefined,
        marketPrice: marketPrice ?? undefined,
        currency: primaryRow.card.currency,
        ungradedPrice: ungradedPrice ?? undefined,
        grade7Price: grade7Price ?? undefined,
        grade8Price: grade8Price ?? undefined,
        grade9Price: grade9Price ?? undefined,
        grade95Price: grade95Price ?? undefined,
        grade10Price: grade10Price ?? undefined,
        lastCheckedAt: lastCheckedAt,
        createdAt: primaryRow.createdAt,
        updatedAt: primaryRow.card.updatedAt,
        isMerged: true,
        mergedUrls: mergedUrls,
        mergedSources: [...new Set(mergedSources)], // Remove duplicates
      })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching cards:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch cards',
        ...(process.env.NODE_ENV === 'development' && { details: error instanceof Error ? error.message : 'Unknown error' })
      },
      { status: 500 }
    )
  }
}

// POST /api/cards - Add a new card
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { url, profile: profileInput } = AddCardSchema.parse(body)
    const profile: Profile = profileInput || 'Chen'

    // Determine URL type and extract data accordingly
    let cardData: {
      url: string
      productId: string
      name: string
      setDisplay?: string
      jpNo?: string
      rarity?: string
      imageUrl?: string
      marketPrice?: number
      currency: string
      ungradedPrice?: number
      grade7Price?: number
      grade8Price?: number
      grade9Price?: number
      grade95Price?: number
      grade10Price?: number
      lastCheckedAt: Date
    }
    let productId: string

    if (url.includes('tcgplayer.com/product/')) {
      // TCGplayer URL
      const productIdMatch = url.match(/\/product\/(\d+)(?:\/|$|\?)/)
      if (!productIdMatch) {
        return NextResponse.json(
          { error: 'Invalid TCGplayer URL format' },
          { status: 400 }
        )
      }
      productId = productIdMatch[1]

      // Scrape the product data using Puppeteer with fallback
      let scrapedData: ScrapedData

      try {
        scrapedData = await scrapeWithPuppeteer(url, productId)
        console.log('Puppeteer scraping succeeded')
      } catch (puppeteerError) {
        console.warn('Puppeteer scraping failed, using fallback method:', puppeteerError)
        
        // Use fallback method for production
        try {
          scrapedData = await scrapeWithFallback(url, productId)
          console.log('Fallback scraping succeeded')
        } catch (fallbackError) {
          console.error('Both scraping methods failed:', { puppeteerError, fallbackError })
          return NextResponse.json(
            { 
              error: 'Failed to scrape product data', 
              details: {
                puppeteerError: puppeteerError instanceof Error ? puppeteerError.message : 'Unknown error',
                fallbackError: fallbackError instanceof Error ? fallbackError.message : 'Unknown error'
              }
            },
            { status: 500 }
          )
        }
      }

      cardData = {
        url,
        productId,
        name: scrapedData.name,
        setDisplay: scrapedData.setDisplay,
        jpNo: scrapedData.jpNo,
        rarity: scrapedData.rarity,
        imageUrl: scrapedData.imageUrl,
        marketPrice: scrapedData.marketPrice,
        currency: 'USD',
        lastCheckedAt: new Date(),
      }
    } else if (url.includes('pricecharting.com/game/')) {
      // PriceCharting URL
      const urlMatch = url.match(/pricecharting\.com\/game\/([^\/]+)\/([^\/]+)/)
      if (!urlMatch) {
        return NextResponse.json(
          { error: 'Invalid PriceCharting URL format' },
          { status: 400 }
        )
      }
      productId = urlMatch[2] // Use the card name as productId

      // Scrape PriceCharting data
      let scrapedData: PriceChartingData
      try {
        scrapedData = await scrapePriceCharting(url)
        console.log('PriceCharting scraping succeeded')
      } catch (pricechartingError) {
        console.error('PriceCharting scraping failed:', pricechartingError)
        return NextResponse.json(
          { 
            error: 'Failed to scrape PriceCharting data', 
            details: pricechartingError instanceof Error ? pricechartingError.message : 'Unknown error'
          },
          { status: 500 }
        )
      }

      cardData = {
        url,
        productId,
        name: scrapedData.name,
        setDisplay: scrapedData.setDisplay,
        jpNo: scrapedData.cardNumber,
        rarity: undefined, // PriceCharting doesn't provide rarity
        imageUrl: scrapedData.imageUrl,
        marketPrice: undefined, // No TCGplayer market price
        currency: 'USD',
        // PriceCharting specific prices
        ungradedPrice: scrapedData.ungradedPrice,
        grade7Price: scrapedData.grade7Price,
        grade8Price: scrapedData.grade8Price,
        grade9Price: scrapedData.grade9Price,
        grade95Price: scrapedData.grade95Price,
        grade10Price: scrapedData.grade10Price,
        lastCheckedAt: new Date(),
      }
    } else {
      return NextResponse.json(
        { error: 'Unsupported URL format. Only TCGplayer and PriceCharting URLs are supported.' },
        { status: 400 }
      )
    }

    // Check if card already exists by URL
    const existingCard = await prisma.card.findUnique({
      where: { url },
    })

    if (existingCard) {
      // Card already exists, just update the profile link and refresh data
      let profileRow = await prisma.profile.findUnique({ where: { name: profile } })
      if (!profileRow) profileRow = await prisma.profile.create({ data: { name: profile } })

      await prisma.profileCard.upsert({
        where: { profileId_cardId: { profileId: profileRow.id, cardId: existingCard.id } },
        update: {},
        create: { profileId: profileRow.id, cardId: existingCard.id },
      })

      // Update the card data with latest information
      const updatedCard = await prisma.card.update({
        where: { id: existingCard.id },
        data: {
          ...cardData,
          lastCheckedAt: new Date(),
        },
      })

      // Check if this updated card should be merged with other cards
      const matchingCards = await findMatchingCards(cardData.name, url)
      if (matchingCards.length > 0) {
        // Merge with existing cards
        const { mergedCard, wasMerged } = await mergeCardWithExisting(cardData, matchingCards)
        
        // Update profile link to point to merged card
        await prisma.profileCard.upsert({
          where: { profileId_cardId: { profileId: profileRow.id, cardId: mergedCard.id } },
          update: {},
          create: { profileId: profileRow.id, cardId: mergedCard.id },
        })

        return NextResponse.json({ 
          ...mergedCard, 
          wasMerged,
          mergedWithCount: matchingCards.length,
          message: wasMerged ? 'Card merged with existing cards' : 'Card already exists, data updated'
        })
      }

      return NextResponse.json({ 
        ...updatedCard, 
        wasMerged: existingCard.isMerged,
        mergedWithCount: 0,
        message: 'Card already exists, data updated'
      })
    }

    // Find matching cards for merging
    const matchingCards = await findMatchingCards(cardData.name, url)
    
    // Merge with existing cards or create new one
    const { mergedCard, wasMerged } = await mergeCardWithExisting(cardData, matchingCards)

    // Ensure profile row exists
    let profileRow = await prisma.profile.findUnique({ where: { name: profile } })
    if (!profileRow) profileRow = await prisma.profile.create({ data: { name: profile } })

    // Upsert profile-card link
    await prisma.profileCard.upsert({
      where: { profileId_cardId: { profileId: profileRow.id, cardId: mergedCard.id } },
      update: {},
      create: { profileId: profileRow.id, cardId: mergedCard.id },
    })

    return NextResponse.json({ 
      ...mergedCard, 
      wasMerged,
      mergedWithCount: matchingCards.length 
    })
  } catch (error) {
    console.error('Error adding card:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to add card' },
      { status: 500 }
    )
  }
}

// PATCH /api/cards - Update card fields
export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { error: 'Card ID is required' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const updateData = UpdateCardSchema.parse(body)

    // Update overrides on ProfileCard
    const row = await prisma.profileCard.update({
      where: { id },
      data: updateData,
      include: { card: true },
    })
    const merged = {
      id: row.id,
      url: row.card.url,
      productId: row.card.productId,
      name: row.card.name,
      setDisplay: row.setDisplay ?? row.card.setDisplay ?? undefined,
      jpNo: row.jpNo ?? row.card.jpNo ?? undefined,
      rarity: row.rarity ?? row.card.rarity ?? undefined,
      imageUrl: row.card.imageUrl ?? undefined,
      marketPrice: row.card.marketPrice ?? undefined,
      currency: row.card.currency,
      lastCheckedAt: row.card.lastCheckedAt,
      createdAt: row.createdAt,
      updatedAt: row.card.updatedAt,
    }

    return NextResponse.json(merged)
  } catch (error) {
    console.error('Error updating card:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update card' },
      { status: 500 }
    )
  }
}

// DELETE /api/cards - Delete a card
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { error: 'Card ID is required' },
        { status: 400 }
      )
    }

    // Delete the link only
    await prisma.profileCard.delete({ where: { id } })
    return NextResponse.json({ success: true, action: 'deleted' })
  } catch (error) {
    console.error('Error deleting card:', error)
    return NextResponse.json(
      { error: 'Failed to delete card' },
      { status: 500 }
    )
  }
}
