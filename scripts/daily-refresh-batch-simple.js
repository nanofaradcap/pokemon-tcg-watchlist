#!/usr/bin/env node

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('@prisma/client')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path')

const prisma = new PrismaClient()

class SimpleBatcher {
  constructor() {
    this.batchSize = parseInt(process.env.BATCH_SIZE || '5')
    this.delayMinutes = parseInt(process.env.DELAY_MINUTES || '2')
    this.delayMs = this.delayMinutes * 60 * 1000
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
      include: {
        sources: {
          include: {
            prices: true
          }
        },
        userCards: {
          include: {
            user: true
          }
        }
      }
    })

    this.log(`Found ${cards.length} cards to refresh`)
    return cards
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

    // Simulate processing each card (without actual scraping)
    for (const card of cards) {
      try {
        this.log(`Processing card: ${card.name}`)
        
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Simulate success/failure (90% success rate)
        if (Math.random() > 0.1) {
          results.successful++
          this.log(`✅ Card ${card.name} processed successfully`)
          
          // Update the lastCheckedAt timestamp
          await this.updateCardTimestamp(card)
        } else {
          results.failed++
          results.errors.push({
            cardId: card.id,
            cardName: card.name,
            error: 'Simulated error'
          })
          this.log(`❌ Card ${card.name} failed: Simulated error`, 'ERROR')
        }
      } catch (error) {
        results.failed++
        results.errors.push({
          cardId: card.id,
          cardName: card.name,
          error: error.message
        })
        this.log(`❌ Card ${card.name} failed: ${error.message}`, 'ERROR')
      }
    }

    return results
  }

  async updateCardTimestamp(card) {
    // Update the lastCheckedAt timestamp for the first source
    if (card.sources && card.sources.length > 0) {
      await prisma.cardSource.update({
        where: { id: card.sources[0].id },
        data: { lastCheckedAt: new Date() }
      })
    }
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async processAllCards() {
    const startTime = Date.now()
    this.log('🚀 Starting daily card refresh with smart batching (SIMULATION MODE)')
    this.log(`Configuration: batchSize=${this.batchSize}, delay=${this.delayMinutes}min`)

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
      this.log(`\n🎉 Daily refresh completed!`)
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
  const batcher = new SimpleBatcher()
  batcher.processAllCards()
    .then(() => {
      console.log('✅ Daily refresh completed successfully')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Daily refresh failed:', error)
      process.exit(1)
    })
}

module.exports = { SimpleBatcher }
