const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

async function createSQLBackup() {
  const prisma = new PrismaClient()
  
  try {
    console.log('🔄 Creating SQL backup...')
    
    // Create backup directory
    const backupDir = path.join(__dirname, 'backups')
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir)
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const sqlFile = path.join(backupDir, `backup-${timestamp}.sql`)
    
    // Get all data and create SQL INSERT statements
    const profiles = await prisma.profile.findMany()
    const cards = await prisma.card.findMany()
    const cardSources = await prisma.cardSource.findMany()
    const cardPrices = await prisma.cardPrice.findMany()
    const priceHistories = await prisma.priceHistory.findMany()
    const userCards = await prisma.userCard.findMany()
    
    let sql = `-- Database backup created at ${new Date().toISOString()}
-- Schema version: jpNo-to-No-migration

-- Profiles
`;
    
    // Profiles
    for (const profile of profiles) {
      sql += `INSERT INTO profiles (id, name, "createdAt") VALUES ('${profile.id}', '${profile.name}', '${profile.createdAt.toISOString()}');\n`
    }
    
    sql += `\n-- Cards\n`
    // Cards
    for (const card of cards) {
      sql += `INSERT INTO cards (id, name, "setDisplay", "No", rarity, "imageUrl", "createdAt", "updatedAt") VALUES ('${card.id}', '${card.name}', ${card.setDisplay ? `'${card.setDisplay}'` : 'NULL'}, ${card.No ? `'${card.No}'` : 'NULL'}, ${card.rarity ? `'${card.rarity}'` : 'NULL'}, ${card.imageUrl ? `'${card.imageUrl}'` : 'NULL'}, '${card.createdAt.toISOString()}', '${card.updatedAt.toISOString()}');\n`
    }
    
    sql += `\n-- Card Sources\n`
    // Card Sources
    for (const source of cardSources) {
      sql += `INSERT INTO "CardSource" (id, "cardId", "sourceType", url, "productId", currency, "lastCheckedAt", "createdAt") VALUES ('${source.id}', '${source.cardId}', '${source.sourceType}', '${source.url}', ${source.productId ? `'${source.productId}'` : 'NULL'}, '${source.currency}', ${source.lastCheckedAt ? `'${source.lastCheckedAt.toISOString()}'` : 'NULL'}, '${source.createdAt.toISOString()}');\n`
    }
    
    sql += `\n-- Card Prices\n`
    // Card Prices
    for (const price of cardPrices) {
      sql += `INSERT INTO "CardPrice" (id, "sourceId", "priceType", price, "createdAt", "updatedAt") VALUES ('${price.id}', '${price.sourceId}', '${price.priceType}', ${price.price}, '${price.createdAt.toISOString()}', '${price.updatedAt.toISOString()}');\n`
    }
    
    sql += `\n-- Price Histories\n`
    // Price Histories
    for (const history of priceHistories) {
      sql += `INSERT INTO "PriceHistory" (id, "sourceId", "priceType", price, "recordedAt", "createdAt") VALUES ('${history.id}', '${history.sourceId}', '${price.priceType}', ${history.price}, '${history.recordedAt.toISOString()}', '${history.createdAt.toISOString()}');\n`
    }
    
    sql += `\n-- User Cards\n`
    // User Cards
    for (const userCard of userCards) {
      sql += `INSERT INTO "UserCard" (id, "userId", "cardId", "createdAt") VALUES ('${userCard.id}', '${userCard.userId}', '${userCard.cardId}', '${userCard.createdAt.toISOString()}');\n`
    }
    
    // Write SQL file
    fs.writeFileSync(sqlFile, sql)
    
    console.log('✅ SQL backup completed!')
    console.log(`📁 SQL backup saved to: ${sqlFile}`)
    
    return sqlFile
    
  } catch (error) {
    console.error('❌ SQL backup failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run SQL backup
createSQLBackup()
  .then((sqlFile) => {
    console.log(`\n🎉 SQL backup completed successfully: ${sqlFile}`)
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 SQL backup failed:', error)
    process.exit(1)
  })
