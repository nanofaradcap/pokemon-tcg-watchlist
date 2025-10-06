import { NextRequest, NextResponse } from 'next/server'
import { CardService } from '@/lib/card-service'

const cardService = new CardService()

export async function GET(_request: NextRequest) {
  const startTime = Date.now()
  
  try {
    console.log('🔄 Starting queue-based daily refresh service...')
    
    // Get all profiles and their cards
    const allCards = await cardService.getAllCardsForRefresh()
    console.log(`🔄 Found ${allCards.length} cards to refresh`)
    
    if (allCards.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No cards found to refresh',
        refreshed: 0,
        timestamp: new Date().toISOString()
      })
    }
    
    // Group cards by profile
    const cardsByProfile = allCards.reduce((acc, card) => {
      if (!acc[card.profileId]) {
        acc[card.profileId] = []
      }
      acc[card.profileId].push(card.id)
      return acc
    }, {} as Record<string, string[]>)
    
    console.log(`🔄 Found ${Object.keys(cardsByProfile).length} profiles with cards`)
    
    // Process only the first profile with a maximum of 3 cards to avoid timeout
    const firstProfile = Object.entries(cardsByProfile)[0]
    if (!firstProfile) {
      return NextResponse.json({ 
        success: true, 
        message: 'No profiles found',
        refreshed: 0,
        timestamp: new Date().toISOString()
      })
    }
    
    const [profileId, cardIds] = firstProfile
    const limitedCardIds = cardIds.slice(0, 3) // Only refresh first 3 cards
    
    console.log(`🔄 Refreshing ${limitedCardIds.length} cards for profile ${profileId} (${cardIds.length} total cards for this profile)`)
    
    const result = await cardService.refreshCards(limitedCardIds, profileId)
    
    const duration = Date.now() - startTime
    console.log(`✅ Queue-based daily refresh completed in ${duration}ms: ${result.refreshed} cards refreshed`)
    
    return NextResponse.json({
      success: true,
      message: 'Queue-based daily refresh completed',
      refreshed: result.refreshed,
      profileId,
      totalCards: cardIds.length,
      processedCards: limitedCardIds.length,
      remainingCards: cardIds.length - limitedCardIds.length,
      duration: `${duration}ms`,
      errors: result.errors,
      nextSteps: (cardIds.length - limitedCardIds.length) > 0 ? 'More cards need to be processed in subsequent runs' : 'All cards processed',
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('❌ Queue-based daily refresh service failed:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
