import { NextRequest, NextResponse } from 'next/server'
import { CardService } from '@/lib/card-service'

const cardService = new CardService()

export async function GET(_request: NextRequest) {
  const startTime = Date.now()
  const BATCH_SIZE = 5 // Process cards in smaller batches to avoid timeouts
  const MAX_CARDS_PER_PROFILE = 20 // Limit cards per profile to prevent timeout
  
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
    
    // Process profiles in batches to avoid timeout
    const profileEntries = Object.entries(cardsByProfile)
    const refreshResults = []
    let totalRefreshed = 0
    let successfulProfiles = 0
    let failedProfiles = 0
    
    for (let i = 0; i < profileEntries.length; i += BATCH_SIZE) {
      const batch = profileEntries.slice(i, i + BATCH_SIZE)
      console.log(`🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(profileEntries.length / BATCH_SIZE)}`)
      
      // Process each profile in the batch
      for (const [profileId, cardIds] of batch) {
        try {
          // Limit cards per profile to prevent timeout
          const limitedCardIds = cardIds.slice(0, MAX_CARDS_PER_PROFILE)
          console.log(`🔄 Refreshing ${limitedCardIds.length} cards for profile ${profileId} (${cardIds.length} total)`)
          
          const result = await cardService.refreshCards(limitedCardIds, profileId)
          refreshResults.push({
            profileId,
            cardCount: limitedCardIds.length,
            totalCards: cardIds.length,
            success: true,
            result
          })
          totalRefreshed += result.refreshed
          successfulProfiles++
          
          // Add a small delay between profiles to prevent overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 100))
          
        } catch (error) {
          console.error(`❌ Failed to refresh cards for profile ${profileId}:`, error)
          refreshResults.push({
            profileId,
            cardCount: cardIds.length,
            totalCards: cardIds.length,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
          failedProfiles++
        }
      }
      
      // Add delay between batches to prevent timeout
      if (i + BATCH_SIZE < profileEntries.length) {
        console.log('⏳ Waiting before next batch...')
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    const duration = Date.now() - startTime
    console.log(`✅ Daily refresh completed in ${duration}ms: ${totalRefreshed} cards refreshed across ${successfulProfiles} profiles`)
    
    return NextResponse.json({
      success: true,
      message: 'Daily refresh completed',
      refreshed: totalRefreshed,
      profiles: {
        total: Object.keys(cardsByProfile).length,
        successful: successfulProfiles,
        failed: failedProfiles
      },
      duration: `${duration}ms`,
      results: refreshResults,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('❌ Daily refresh service failed:', error)
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
