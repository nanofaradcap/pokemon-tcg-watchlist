import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Test refresh endpoint',
    timestamp: new Date().toISOString()
  })
}

