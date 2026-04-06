import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function checkApiSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.API_SECRET
  if (!secret) {
    console.warn('API_SECRET is not set — endpoint is unprotected')
    return null
  }

  const provided = req.headers.get('x-api-secret') || req.nextUrl.searchParams.get('secret')
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
