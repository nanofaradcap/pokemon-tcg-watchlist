const { PrismaClient } = require('@prisma/client')

async function applyNewSchema() {
  console.log('Applying new database schema...')
  
  const prisma = new PrismaClient()
  
  try {
    // 1. Create new tables
    console.log('Creating new tables...')
    
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "cards" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "setDisplay" TEXT,
        "jpNo" TEXT,
        "rarity" TEXT,
        "imageUrl" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      );
    `
    
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "card_sources" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "cardId" TEXT NOT NULL,
        "sourceType" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "productId" TEXT,
        "currency" TEXT NOT NULL DEFAULT 'USD',
        "lastCheckedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "card_sources_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "card_sources_cardId_sourceType_key" UNIQUE ("cardId", "sourceType")
      );
    `
    
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "card_prices" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "sourceId" TEXT NOT NULL,
        "priceType" TEXT NOT NULL,
        "price" DECIMAL(10,2) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "card_prices_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "card_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "card_prices_sourceId_priceType_key" UNIQUE ("sourceId", "priceType")
      );
    `
    
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "price_history" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "sourceId" TEXT NOT NULL,
        "priceType" TEXT NOT NULL,
        "oldPrice" DECIMAL(10,2),
        "newPrice" DECIMAL(10,2),
        "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "price_history_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "card_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `
    
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "user_cards" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "cardId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "user_cards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "user_cards_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "user_cards_userId_cardId_key" UNIQUE ("userId", "cardId")
      );
    `
    
    // 2. Create indexes
    console.log('Creating indexes...')
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "idx_cards_name" ON "cards"("name");`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "idx_cards_jpNo" ON "cards"("jpNo");`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "idx_cards_name_jpNo" ON "cards"("name", "jpNo");`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "idx_sources_cardId" ON "card_sources"("cardId");`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "idx_sources_type" ON "card_sources"("sourceType");`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "idx_prices_sourceId" ON "card_prices"("sourceId");`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "idx_prices_type" ON "card_prices"("priceType");`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "idx_history_sourceId" ON "price_history"("sourceId");`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "idx_history_changedAt" ON "price_history"("changedAt");`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "idx_user_cards_userId" ON "user_cards"("userId");`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "idx_user_cards_cardId" ON "user_cards"("cardId");`
    
    console.log('New schema applied successfully!')
    
  } catch (error) {
    console.error('Error applying schema:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run if called directly
if (require.main === module) {
  applyNewSchema().catch(console.error)
}

module.exports = { applyNewSchema }
