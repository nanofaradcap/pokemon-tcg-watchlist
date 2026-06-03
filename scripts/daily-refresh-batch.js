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
    try {
      // Get the first source URL for refreshing
      const source = card.sources[0]
      if (!source) {
        throw new Error('No sources found for card')
      }

      this.log(`Refreshing card: ${card.name} (${source.url})`)

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
        this.log(`DRY_RUN enabled; skipped database update for ${card.name}`)
      } else {
        // Update the card with new pricing data
        await this.updateCardPricing(card, scrapedData, source.id)
      }

      return { success: true, cardId: card.id, cardName: card.name }
    } catch (error) {
      this.log(`Error processing card ${card.name}: ${error.message}`, 'ERROR')
      throw error
    }
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
    this.log(`Configuration: batchSize=${this.batchSize}, delay=${this.delayMinutes}min, dryRun=${this.dryRun}, maxCards=${this.maxCards || 'all'}`)

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
