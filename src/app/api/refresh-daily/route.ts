import { NextRequest, NextResponse } from 'next/server'
import { CardService } from '@/lib/card-service'

const cardService = new CardService()

export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Starting daily refresh service...')
    
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
    
    // Group cards by profile for efficient processing
    const cardsByProfile = allCards.reduce((acc, card) => {
      if (!acc[card.profileId]) {
        acc[card.profileId] = []
      }
      acc[card.profileId].push(card.id)
      return acc
    }, {} as Record<string, string[]>)
    
    console.log(`🔄 Refreshing cards for ${Object.keys(cardsByProfile).length} profiles`)
    
    // Refresh cards for each profile
    const refreshResults = []
    for (const [profileId, cardIds] of Object.entries(cardsByProfile)) {
      try {
        console.log(`🔄 Refreshing ${cardIds.length} cards for profile ${profileId}`)
        const result = await cardService.refreshCards(cardIds, profileId)
        refreshResults.push({
          profileId,
          cardCount: cardIds.length,
          success: true,
          result
        })
      } catch (error) {
        console.error(`❌ Failed to refresh cards for profile ${profileId}:`, error)
        refreshResults.push({
          profileId,
          cardCount: cardIds.length,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    const totalRefreshed = refreshResults.reduce((sum, result) => sum + result.cardCount, 0)
    const successfulProfiles = refreshResults.filter(r => r.success).length
    const failedProfiles = refreshResults.filter(r => !r.success).length
    
    console.log(`✅ Daily refresh completed: ${totalRefreshed} cards refreshed across ${successfulProfiles} profiles`)
    
    return NextResponse.json({
      success: true,
      message: 'Daily refresh completed',
      refreshed: totalRefreshed,
      profiles: {
        total: Object.keys(cardsByProfile).length,
        successful: successfulProfiles,
        failed: failedProfiles
      },
      results: refreshResults,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Daily refresh service failed:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
