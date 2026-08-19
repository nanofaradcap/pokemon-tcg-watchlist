#!/usr/bin/env node

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('@prisma/client')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path')

// Import scraping functions from compiled dist
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scrapeWithPuppeteer } = require('../dist/lib/puppeteer-scraping')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scrapePriceCharting } = require('../dist/lib/pricecharting-scraping')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scrapeWithFallback } = require('../dist/lib/scraping-fallback')

const prisma = new PrismaClient()

function parseOptionalPositiveInt(value) {
  const parsed = parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parseBoolean(value) {
  return /^(1|true|yes)$/i.test(value || '')
}

function isValidPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

class SmartBatcher {
  constructor() {
    this.batchSize = parseInt(process.env.BATCH_SIZE || '10')
    this.delayMinutes = parseInt(process.env.DELAY_MINUTES || '2')
    this.delayMs = this.delayMinutes * 60 * 1000
    // Pacing applied between individual source refreshes for the same card
    // (e.g. a TCGplayer source and a PriceCharting source merged onto one
    // card), so a multi-source card doesn't fire back-to-back requests at
    // either site with no gap.
    this.sourceDelayMs = parseInt(process.env.SOURCE_DELAY_MS || '3000')
    this.maxCards = parseOptionalPositiveInt(process.env.MAX_CARDS)
    this.dryRun = parseBoolean(process.env.DRY_RUN)
    this.logDir = path.join(process.cwd(), 'logs')
    this.ensureLogDir()
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] [${level}] ${message}`
    console.log(logMessage)
    
    // Also write to log file
    const logFile = path.join(this.logDir, `refresh-${new Date().toISOString().split('T')[0]}.log`)
    fs.appendFileSync(logFile, logMessage + '\n')
  }

  async getAllCards() {
    this.log('Fetching all cards for refresh...')
    
    const cards = await prisma.card.findMany({
      select: {
        id: true,
        name: true,
        sources: {
          select: {
            id: true,
            url: true,
            productId: true
          }
        }
      }
    })

    this.log(`Found ${cards.length} cards to refresh`)
    if (!this.maxCards) {
      return cards
    }

    const limitedCards = cards.slice(0, this.maxCards)
    this.log(`Limiting refresh to ${limitedCards.length} cards because MAX_CARDS=${this.maxCards}`)
    return limitedCards
  }

  createBatches(items, batchSize) {
    const batches = []
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }
    return batches
  }

  async processBatch(cards, batchNumber, totalBatches) {
    this.log(`Processing batch ${batchNumber}/${totalBatches} (${cards.length} cards)`)
    
    const results = {
      successful: 0,
      failed: 0,
      errors: []
    }

    // Process cards in parallel within the batch
    const promises = cards.map(card => this.processCard(card))
    const cardResults = await Promise.allSettled(promises)

    cardResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.successful++
        this.log(`✅ Card ${cards[index].name} refreshed successfully`)
      } else {
        results.failed++
        const error = result.reason
        results.errors.push({
          cardId: cards[index].id,
          cardName: cards[index].name,
          error: error.message || 'Unknown error'
        })
        this.log(`❌ Card ${cards[index].name} failed: ${error.message}`, 'ERROR')
      }
    })

    return results
  }

  async processCard(card) {
    const sources = card.sources || []
    if (sources.length === 0) {
      const error = new Error('No sources found for card')
      this.log(`Error processing card ${card.name}: ${error.message}`, 'ERROR')
      throw error
    }

    // Refresh every source attached to the card, not just the first one.
    // A card can have multiple sources (e.g. a TCGplayer source and a
    // PriceCharting source merged onto it by the fuzzy-matching logic in
    // card-service.ts), and each one needs its own scrape + lastCheckedAt
    // update or its prices silently go stale while the UI's freshness
    // label ("updated Xm ago") keeps reporting whichever source WAS
    // refreshed.
    //
    // Sources are refreshed sequentially (with a delay between them,
    // sourceDelayMs) rather than in parallel, so a multi-source card
    // doesn't multiply the number of simultaneous requests hitting
    // TCGplayer/PriceCharting within a batch - this preserves the same
    // per-request pacing the batch-level delay was designed around.
    const sourceErrors = []
    let refreshedCount = 0

    for (let i = 0; i < sources.length; i++) {
      const source = sources[i]
      try {
        await this.refreshSource(card, source)
        refreshedCount++
      } catch (error) {
        this.log(`Error refreshing source ${source.id} (${source.url}) for card ${card.name}: ${error.message}`, 'ERROR')
        sourceErrors.push(`${source.url}: ${error.message}`)
      }

      if (i < sources.length - 1) {
        await this.delay(this.sourceDelayMs)
      }
    }

    if (refreshedCount === 0) {
      throw new Error(sourceErrors.join('; ') || 'Failed to refresh any source for card')
    }

    if (sourceErrors.length > 0) {
      this.log(`Card ${card.name} refreshed with partial errors (${refreshedCount}/${sources.length} sources succeeded): ${sourceErrors.join('; ')}`, 'WARN')
    }

    return { success: true, cardId: card.id, cardName: card.name, sourcesRefreshed: refreshedCount, sourcesTotal: sources.length }
  }

  async refreshSource(card, source) {
    this.log(`Refreshing card: ${card.name} source ${source.id} (${source.url})`)

    // Scrape the card data
    let scrapedData
    if (source.url.includes('tcgplayer.com')) {
      scrapedData = await scrapeWithPuppeteer(source.url, source.productId || '')
    } else if (source.url.includes('pricecharting.com')) {
      scrapedData = await scrapePriceCharting(source.url)
    } else {
      scrapedData = await scrapeWithFallback(source.url)
    }

    if (this.dryRun) {
      this.log(`DRY_RUN enabled; skipped database update for ${card.name} (${source.url})`)
      return
    }

    // Update the card with new pricing data
    await this.updateCardPricing(card, scrapedData, source.id)
  }

  async updateCardPricing(card, scrapedData, sourceId) {
    const prices = []
    if (isValidPrice(scrapedData.marketPrice)) prices.push({ sourceId, priceType: 'market', price: scrapedData.marketPrice })
    if (isValidPrice(scrapedData.ungradedPrice)) prices.push({ sourceId, priceType: 'ungraded', price: scrapedData.ungradedPrice })
    if (isValidPrice(scrapedData.grade7Price)) prices.push({ sourceId, priceType: 'grade7', price: scrapedData.grade7Price })
    if (isValidPrice(scrapedData.grade8Price)) prices.push({ sourceId, priceType: 'grade8', price: scrapedData.grade8Price })
    if (isValidPrice(scrapedData.grade9Price)) prices.push({ sourceId, priceType: 'grade9', price: scrapedData.grade9Price })
    if (isValidPrice(scrapedData.grade95Price)) prices.push({ sourceId, priceType: 'grade95', price: scrapedData.grade95Price })
    if (isValidPrice(scrapedData.grade10Price)) prices.push({ sourceId, priceType: 'grade10', price: scrapedData.grade10Price })

    if (prices.length === 0) {
      await prisma.cardSource.update({
        where: { id: sourceId },
        data: { lastCheckedAt: new Date() }
      })
      this.log(`No prices scraped for ${card.name}; preserved existing prices`)
      return
    }

    // Upsert each price in parallel (avoids full wipe when prices haven't changed)
    await Promise.all(prices.map(priceData =>
      prisma.cardPrice.upsert({
        where: { sourceId_priceType: { sourceId: priceData.sourceId, priceType: priceData.priceType } },
        update: { price: priceData.price },
        create: priceData
      })
    ))

    // Update source lastCheckedAt
    await prisma.cardSource.update({
      where: { id: sourceId },
      data: { lastCheckedAt: new Date() }
    })

    this.log(`Updated ${prices.length} prices for card ${card.name}`)
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async processAllCards() {
    const startTime = Date.now()
    this.log('🚀 Starting card refresh with smart batching')
    this.log(`Configuration: batchSize=${this.batchSize}, delay=${this.delayMinutes}min, sourceDelayMs=${this.sourceDelayMs}, dryRun=${this.dryRun}, maxCards=${this.maxCards || 'all'}`)

    try {
      const cards = await this.getAllCards()
      
      if (cards.length === 0) {
        this.log('No cards found to refresh')
        return
      }

      const batches = this.createBatches(cards, this.batchSize)
      this.log(`Created ${batches.length} batches`)

      const totalResults = {
        successful: 0,
        failed: 0,
        errors: []
      }

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]
        const batchNumber = i + 1
        
        this.log(`\n--- Processing Batch ${batchNumber}/${batches.length} ---`)
        
        const batchResults = await this.processBatch(batch, batchNumber, batches.length)
        
        totalResults.successful += batchResults.successful
        totalResults.failed += batchResults.failed
        totalResults.errors.push(...batchResults.errors)

        // Add delay between batches (except for the last one)
        if (i < batches.length - 1) {
          this.log(`⏳ Waiting ${this.delayMinutes} minutes before next batch...`)
          await this.delay(this.delayMs)
        }
      }

      const duration = Date.now() - startTime
      this.log(`\n🎉 Card refresh completed!`)
      this.log(`✅ Successful: ${totalResults.successful}`)
      this.log(`❌ Failed: ${totalResults.failed}`)
      this.log(`⏱️  Duration: ${Math.round(duration / 1000 / 60)} minutes`)

      if (totalResults.errors.length > 0) {
        this.log(`\n❌ Errors encountered:`)
        totalResults.errors.forEach(error => {
          this.log(`  - ${error.cardName}: ${error.error}`, 'ERROR')
        })
      }

    } catch (error) {
      this.log(`💥 Fatal error during refresh: ${error.message}`, 'ERROR')
      throw error
    } finally {
      await prisma.$disconnect()
    }
  }
}

// Run the batcher
if (require.main === module) {
  const batcher = new SmartBatcher()
  batcher.processAllCards()
    .then(() => {
      console.log('✅ Card refresh completed successfully')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Card refresh failed:', error)
      process.exit(1)
    })
}

module.exports = { SmartBatcher }
