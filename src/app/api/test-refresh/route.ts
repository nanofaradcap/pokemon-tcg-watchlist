import { NextRequest, NextResponse } from 'next/server'

export async function GET(_request: NextRequest) {
  try {
    console.log('🧪 Test refresh endpoint called')
    
    // Just return a simple response to test if the endpoint works
    return NextResponse.json({
      success: true,
      message: 'Test refresh endpoint is working',
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Test refresh failed:', error)
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
