import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const Profiles = ['Chen', 'Tiff', 'Pho', 'Ying'] as const
type Profile = typeof Profiles[number]

const AddCardSchema = z.object({
  url: z.string().url(),
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

    const result = rows.map(r => ({
      // flatten for UI compatibility
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
      lastCheckedAt: r.card.lastCheckedAt,
      createdAt: r.createdAt,
      updatedAt: r.card.updatedAt,
    }))

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

    // First, try to scrape the product data with fallback strategy
    let scrapedData: any
    let scrapeError: string | null = null

    try {
      // Try Playwright scraping first (works in development, may fail in production)
      const scrapeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      })

      if (scrapeResponse.ok) {
        scrapedData = await scrapeResponse.json()
      } else {
        const errorData = await scrapeResponse.json()
        scrapeError = errorData.error || 'Playwright scraping failed'
        throw new Error(scrapeError)
      }
    } catch (playwrightError) {
      console.warn('Playwright scraping failed, trying simple fallback:', playwrightError)
      
      // Fallback to simple scraping
      try {
        const simpleResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/scrape-simple`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url }),
        })

        if (!simpleResponse.ok) {
          const errorData = await simpleResponse.json()
          throw new Error(errorData.error || 'Simple scraping failed')
        }

        scrapedData = await simpleResponse.json()
        console.log('Simple scraping succeeded as fallback')
      } catch (simpleError) {
        console.error('Both scraping methods failed:', { playwrightError, simpleError })
        return NextResponse.json(
          { 
            error: 'Failed to scrape product data', 
            details: {
              playwrightError: playwrightError instanceof Error ? playwrightError.message : 'Unknown error',
              simpleError: simpleError instanceof Error ? simpleError.message : 'Unknown error'
            }
          },
          { status: 500 }
        )
      }
    }

    // Ensure profile row exists
    let profileRow = await prisma.profile.findUnique({ where: { name: profile } })
    if (!profileRow) profileRow = await prisma.profile.create({ data: { name: profile } })

    // Upsert global card by url
    const card = await prisma.card.upsert({
      where: { url },
      update: {
        ...scrapedData,
        lastCheckedAt: new Date(),
      },
      create: {
        ...scrapedData,
        lastCheckedAt: new Date(),
      },
    })

    // Upsert profile-card link
    await prisma.profileCard.upsert({
      where: { profileId_cardId: { profileId: profileRow.id, cardId: card.id } },
      update: {},
      create: { profileId: profileRow.id, cardId: card.id },
    })

    return NextResponse.json({ ...card })
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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting card:', error)
    return NextResponse.json(
      { error: 'Failed to delete card' },
      { status: 500 }
    )
  }
}
