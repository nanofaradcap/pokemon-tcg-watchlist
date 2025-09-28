const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

async function backupDatabase() {
  const prisma = new PrismaClient()
  
  try {
    console.log('🔄 Starting database backup...')
    
    // Create backup directory
    const backupDir = path.join(__dirname, 'backups')
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir)
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFile = path.join(backupDir, `backup-${timestamp}.json`)
    
    // Export all data
    const data = {
      profiles: await prisma.profile.findMany(),
      cards: await prisma.card.findMany(),
      cardSources: await prisma.cardSource.findMany(),
      cardPrices: await prisma.cardPrice.findMany(),
      priceHistories: await prisma.priceHistory.findMany(),
      userCards: await prisma.userCard.findMany(),
      exportedAt: new Date().toISOString(),
      schemaVersion: 'jpNo-to-No-migration'
    }
    
    // Write backup file
    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2))
    
    console.log('✅ Database backup completed!')
    console.log(`📁 Backup saved to: ${backupFile}`)
    console.log(`📊 Records backed up:`)
    console.log(`   - Profiles: ${data.profiles.length}`)
    console.log(`   - Cards: ${data.cards.length}`)
    console.log(`   - Card Sources: ${data.cardSources.length}`)
    console.log(`   - Card Prices: ${data.cardPrices.length}`)
    console.log(`   - Price Histories: ${data.priceHistories.length}`)
    console.log(`   - User Cards: ${data.userCards.length}`)
    
    return backupFile
    
  } catch (error) {
    console.error('❌ Backup failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run backup
backupDatabase()
  .then((backupFile) => {
    console.log(`\n🎉 Backup completed successfully: ${backupFile}`)
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Backup failed:', error)
    process.exit(1)
  })
