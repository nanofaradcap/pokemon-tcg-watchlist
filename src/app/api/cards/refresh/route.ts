export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { scrapeWithPuppeteer } from '@/lib/puppeteer-scraping'
import { scrapePriceCharting } from '@/lib/pricecharting-scraping'

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

    // For merged cards, we need to refresh all cards in the merge group
    const allCardsToRefresh = new Set<string>()
    
    for (const link of links) {
      if (link.card.isMerged && link.card.mergeGroupId) {
        // Find all cards in the merge group
        const mergeGroupCards = await prisma.card.findMany({
          where: { mergeGroupId: link.card.mergeGroupId },
        })
        mergeGroupCards.forEach(card => allCardsToRefresh.add(card.id))
      } else {
        // Single card, just refresh this one
        allCardsToRefresh.add(link.card.id)
      }
    }

    // Get all cards that need refreshing
    const cardsToRefresh = await prisma.card.findMany({
      where: { id: { in: Array.from(allCardsToRefresh) } },
    })

    const results = []
    const concurrency = Number(process.env.SCRAPE_CONCURRENCY ?? 2)
    
    // Process cards in batches with concurrency limit
    for (let i = 0; i < cardsToRefresh.length; i += concurrency) {
      const batch = cardsToRefresh.slice(i, i + concurrency)
      
      const batchPromises = batch.map(async (card) => {
        try {
          // Add small random delay to be respectful
          const delay = Math.random() * 500 + 300 // 300-800ms
          await new Promise(resolve => setTimeout(resolve, delay))

          let cardData: {
            url: string
            name: string
            setDisplay?: string
            jpNo?: string
            rarity?: string
            imageUrl?: string
            marketPrice?: number
            ungradedPrice?: number
            grade7Price?: number
            grade8Price?: number
            grade9Price?: number
            grade95Price?: number
            grade10Price?: number
            lastCheckedAt: Date
          }

          if (card.url.includes('tcgplayer.com/product/')) {
            // TCGplayer URL
            const productIdMatch = card.url.match(/\/product\/(\d+)(?:\/|$|\?)/)
            if (!productIdMatch) {
              throw new Error('Invalid TCGplayer URL format')
            }
            const productId = productIdMatch[1]

            // Scrape the product data using Puppeteer
            const scrapedData = await scrapeWithPuppeteer(card.url, productId)
            cardData = {
              ...scrapedData,
              lastCheckedAt: new Date(),
            }
          } else if (card.url.includes('pricecharting.com/game/')) {
            // PriceCharting URL
            const scrapedData = await scrapePriceCharting(card.url)
            cardData = {
              url: scrapedData.url,
              name: scrapedData.name,
              setDisplay: scrapedData.setDisplay,
              jpNo: scrapedData.cardNumber,
              rarity: undefined, // PriceCharting doesn't provide rarity
              imageUrl: scrapedData.imageUrl,
              marketPrice: undefined, // No TCGplayer market price
              // PriceCharting specific prices
              ungradedPrice: scrapedData.ungradedPrice,
              grade7Price: scrapedData.grade7Price,
              grade8Price: scrapedData.grade8Price,
              grade9Price: scrapedData.grade9Price,
              grade95Price: scrapedData.grade95Price,
              grade10Price: scrapedData.grade10Price,
              lastCheckedAt: new Date(),
            }
          } else {
            throw new Error('Unsupported URL format')
          }

          // Update the card
          const updatedCard = await prisma.card.update({
            where: { id: card.id },
            data: cardData,
          })

          return { success: true, card: updatedCard }
        } catch (error) {
          console.error(`Error refreshing card ${card.id}:`, error)
          
          // Update lastCheckedAt even on failure
          await prisma.card.update({
            where: { id: card.id },
            data: { lastCheckedAt: new Date() }
          })

          return { 
            success: false, 
            cardId: card.id, 
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
