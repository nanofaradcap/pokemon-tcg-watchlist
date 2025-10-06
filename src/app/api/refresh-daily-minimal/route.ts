import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_request: NextRequest) {
  const startTime = Date.now()
  
  try {
    console.log('🔄 Starting minimal daily refresh...')
    
    // Just update the updatedAt timestamp without actually scraping
    const updatedCards = await prisma.card.updateMany({
      data: {
        updatedAt: new Date()
      }
    })
    
    const duration = Date.now() - startTime
    console.log(`✅ Minimal daily refresh completed in ${duration}ms: ${updatedCards.count} cards updated`)
    
    return NextResponse.json({
      success: true,
      message: 'Minimal daily refresh completed',
      updatedCards: updatedCards.count,
      duration: `${duration}ms`,
      note: 'This is a minimal refresh that only updates timestamps. Full scraping should be done manually.',
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
