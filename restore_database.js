const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

async function restoreDatabase(backupFile) {
  const prisma = new PrismaClient()
  
  try {
    console.log('🔄 Starting database restore...')
    
    if (!backupFile) {
      // Find the latest backup file
      const backupDir = path.join(__dirname, 'backups')
      const files = fs.readdirSync(backupDir)
        .filter(file => file.endsWith('.json'))
        .sort()
        .reverse()
      
      if (files.length === 0) {
        throw new Error('No backup files found in backups/ directory')
      }
      
      backupFile = path.join(backupDir, files[0])
    }
    
    console.log(`📁 Using backup file: ${backupFile}`)
    
    // Read backup data
    const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'))
    
    console.log(`📊 Restoring data from ${backupData.exportedAt}`)
    console.log(`   - Profiles: ${backupData.profiles.length}`)
    console.log(`   - Cards: ${backupData.cards.length}`)
    console.log(`   - Card Sources: ${backupData.cardSources.length}`)
    console.log(`   - Card Prices: ${backupData.cardPrices.length}`)
    console.log(`   - Price Histories: ${backupData.priceHistories.length}`)
    console.log(`   - User Cards: ${backupData.userCards.length}`)
    
    // Clear existing data (in reverse order of dependencies)
    console.log('🗑️  Clearing existing data...')
    await prisma.userCard.deleteMany()
    await prisma.cardPrice.deleteMany()
    await prisma.priceHistory.deleteMany()
    await prisma.cardSource.deleteMany()
    await prisma.card.deleteMany()
    await prisma.profile.deleteMany()
    
    // Restore data (in correct order)
    console.log('📥 Restoring profiles...')
    for (const profile of backupData.profiles) {
      await prisma.profile.create({ data: profile })
    }
    
    console.log('📥 Restoring cards...')
    for (const card of backupData.cards) {
      await prisma.card.create({ data: card })
    }
    
    console.log('📥 Restoring card sources...')
    for (const source of backupData.cardSources) {
      await prisma.cardSource.create({ data: source })
    }
    
    console.log('📥 Restoring card prices...')
    for (const price of backupData.cardPrices) {
      await prisma.cardPrice.create({ data: price })
    }
    
    console.log('📥 Restoring price histories...')
    for (const history of backupData.priceHistories) {
      await prisma.priceHistory.create({ data: history })
    }
    
    console.log('📥 Restoring user cards...')
    for (const userCard of backupData.userCards) {
      await prisma.userCard.create({ data: userCard })
    }
    
    console.log('✅ Database restore completed successfully!')
    
  } catch (error) {
    console.error('❌ Restore failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Get backup file from command line argument
const backupFile = process.argv[2]

// Run restore
restoreDatabase(backupFile)
  .then(() => {
    console.log('\n🎉 Database restored successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Restore failed:', error)
    process.exit(1)
  })
