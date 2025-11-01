import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const startTime = Date.now()
  
  try {
    console.log('🔄 Starting minimal daily refresh...')
    
    // Count total cards (minimal refresh doesn't actually update anything)
    // Note: updatedAt is @updatedAt in Prisma schema and auto-updates on any field change
    // Since this is a minimal refresh, we don't perform any updates
    const cardCount = await prisma.card.count()
    
    const duration = Date.now() - startTime
    console.log(`✅ Minimal daily refresh completed in ${duration}ms: ${cardCount} cards found`)
    
    return NextResponse.json({
      success: true,
      message: 'Minimal daily refresh completed',
      cardCount: cardCount,
      duration: `${duration}ms`,
      note: 'This is a minimal refresh that does not update any data. Full scraping should be done manually.',
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('❌ Minimal daily refresh failed:', error)
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
