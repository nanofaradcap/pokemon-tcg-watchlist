import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function checkApiSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.API_SECRET
  const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

  if (!secret) {
    if (isProduction) {
      // Fail CLOSED in production: an unset secret must never mean "allow everyone".
      console.error('API_SECRET is not set in production — rejecting request')
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }
    // Fail OPEN only outside production, as a local-dev convenience so the app
    // works without configuring a secret on every machine.
    console.warn('API_SECRET is not set — endpoint is unprotected (allowed only outside production)')
    return null
  }

  const provided = req.headers.get('x-api-secret') || req.nextUrl.searchParams.get('secret')
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
