export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { scrapeWithPuppeteer } from '@/lib/puppeteer-scraping'

const RefreshSchema = z.object({
  id: z.string().optional(),
  ids: z.array(z.string()).optional(),
})

// POST /api/cards/refresh - Refresh card(s) data
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ids } = RefreshSchema.parse(body)

    if (!id && !ids) {
      return NextResponse.json(
        { error: 'Either id or ids is required' },
        { status: 400 }
      )
    }

    const linkIds = id ? [id] : ids!
    
    // Load ProfileCard links including cards
    const links = await prisma.profileCard.findMany({
      where: { id: { in: linkIds } },
      include: { card: true },
    })

    if (links.length === 0) {
      return NextResponse.json(
        { error: 'No cards found' },
        { status: 404 }
      )
    }

    const results = []
    const concurrency = Number(process.env.SCRAPE_CONCURRENCY ?? 2)
    
    // Process cards in batches with concurrency limit
    for (let i = 0; i < links.length; i += concurrency) {
      const batch = links.slice(i, i + concurrency)
      
      const batchPromises = batch.map(async (link) => {
        try {
          // Add small random delay to be respectful
          const delay = Math.random() * 500 + 300 // 300-800ms
          await new Promise(resolve => setTimeout(resolve, delay))

          // Extract productId from URL
          const productIdMatch = link.card.url.match(/\/product\/(\d+)\//)
          if (!productIdMatch) {
            throw new Error('Invalid TCGplayer URL format')
          }
          const productId = productIdMatch[1]

          // Scrape the product data using Puppeteer
          const scrapedData = await scrapeWithPuppeteer(link.card.url, productId)

          // Update the card
          const updatedCard = await prisma.card.update({
            where: { id: link.card.id },
            data: {
              ...scrapedData,
              lastCheckedAt: new Date(),
            },
          })

          return { success: true, card: updatedCard }
        } catch (error) {
          console.error(`Error refreshing link ${link.id}:`, error)
          
          // Update lastCheckedAt even on failure
          await prisma.card.update({
            where: { id: link.card.id },
            data: { lastCheckedAt: new Date() }
          })

          return { 
            success: false, 
            cardId: link.card.id, 
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
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
