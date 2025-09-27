export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cardService } from '@/lib/card-service'

const RefreshSchema = z.object({
  cardIds: z.array(z.string()).optional(),
  profile: z.string(),
})

// POST /api/cards/refresh - Refresh card data
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { cardIds, profile } = RefreshSchema.parse(body)

    if (cardIds && cardIds.length > 0) {
      // Refresh specific cards
      const results = []
      for (const cardId of cardIds) {
        try {
          const refreshedCard = await cardService.refreshCard(cardId)
          results.push({ success: true, card: refreshedCard })
        } catch (error) {
          console.error(`Error refreshing card ${cardId}:`, error)
          results.push({ 
            success: false, 
            cardId, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          })
        }
      }

      const successCount = results.filter(r => r.success).length
      const failureCount = results.filter(r => !r.success).length

      return NextResponse.json({
        success: true,
        results,
        summary: {
          total: results.length,
          successful: successCount,
          failed: failureCount
        }
      })
    } else {
      // Refresh all cards for profile
      const cards = await cardService.getCardsForProfile(profile)
      const results = []

      for (const card of cards) {
        try {
          const refreshedCard = await cardService.refreshCard(card.id)
          results.push({ success: true, card: refreshedCard })
        } catch (error) {
          console.error(`Error refreshing card ${card.id}:`, error)
          results.push({ 
            success: false, 
            cardId: card.id, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          })
        }
      }

      const successCount = results.filter(r => r.success).length
      const failureCount = results.filter(r => !r.success).length

      return NextResponse.json({
        success: true,
        results,
        summary: {
          total: results.length,
          successful: successCount,
          failed: failureCount
        }
      })
    }
  } catch (error) {
    console.error('Error refreshing cards:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to refresh cards' },
      { status: 500 }
    )
  }
}
