export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cardService } from '@/lib/card-service'

const Profiles = ['Chen', 'Tiff', 'Pho', 'Ying', 'Son', 'Candice', 'Claude', 'Rachel', 'Roxanne', 'Connor'] as const
type Profile = typeof Profiles[number]

const AddCardSchema = z.object({
  url: z.string().url().max(2048, 'URL too long'),
  profile: z.enum(Profiles),
})

// GET /api/cards - Get all cards for a profile
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const profile = searchParams.get('profile') as Profile

    if (!profile || !Profiles.includes(profile)) {
      return NextResponse.json(
        { error: 'Invalid or missing profile' },
        { status: 400 }
      )
    }

    const cards = await cardService.getCardsForProfile(profile)
    return NextResponse.json(cards)
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
    const { url, profile } = AddCardSchema.parse(body)

    const card = await cardService.addCard(url, profile)
    return NextResponse.json(card)
  } catch (error) {
    console.error('Error adding card:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { 
        error: 'Failed to add card',
        ...(process.env.NODE_ENV === 'development' && { 
          details: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        })
      },
      { status: 500 }
    )
  }
}


// DELETE /api/cards - Delete a card
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const cardId = searchParams.get('id')
    const profile = searchParams.get('profile') as Profile

    if (!cardId || !profile) {
      return NextResponse.json(
        { error: 'Missing card ID or profile' },
        { status: 400 }
      )
    }

    await cardService.deleteCard(cardId, profile)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting card:', error)
    return NextResponse.json(
      { error: 'Failed to delete card' },
      { status: 500 }
    )
  }
}
