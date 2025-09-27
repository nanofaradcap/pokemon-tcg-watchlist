const { PrismaClient } = require('@prisma/client')

const oldPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
})

const newPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
})

async function migrateData() {
  console.log('Starting data migration...')
  
  try {
    // 1. Get all existing data
    const existingProfiles = await oldPrisma.profile.findMany()
    const existingCards = await oldPrisma.card.findMany()
    const existingProfileCards = await oldPrisma.profileCard.findMany()
    
    console.log(`Found ${existingProfiles.length} profiles`)
    console.log(`Found ${existingCards.length} cards`)
    console.log(`Found ${existingProfileCards.length} profile-card relationships`)
    
    // 2. Create new profiles
    console.log('Creating profiles...')
    for (const profile of existingProfiles) {
      await newPrisma.profile.upsert({
        where: { id: profile.id },
        update: {},
        create: {
          id: profile.id,
          name: profile.name,
          createdAt: profile.createdAt
        }
      })
    }
    
    // 3. Create new cards
    console.log('Creating cards...')
    for (const card of existingCards) {
      await newPrisma.card.upsert({
        where: { id: card.id },
        update: {},
        create: {
          id: card.id,
          name: card.name,
          setDisplay: card.setDisplay,
          jpNo: card.jpNo,
          rarity: card.rarity,
          imageUrl: card.imageUrl,
          createdAt: card.createdAt,
          updatedAt: card.updatedAt
        }
      })
    }
    
    // 4. Create card sources and prices
    console.log('Creating card sources and prices...')
    for (const card of existingCards) {
      const sourceType = card.url.includes('tcgplayer.com') ? 'tcgplayer' : 'pricecharting'
      
      // Create card source
      const cardSource = await newPrisma.cardSource.create({
        data: {
          cardId: card.id,
          sourceType: sourceType,
          url: card.url,
          productId: card.productId,
          currency: card.currency || 'USD',
          lastCheckedAt: card.lastCheckedAt
        }
      })
      
      // Create prices
      const prices = []
      if (card.marketPrice) prices.push({ priceType: 'market', price: card.marketPrice })
      if (card.ungradedPrice) prices.push({ priceType: 'ungraded', price: card.ungradedPrice })
      if (card.grade7Price) prices.push({ priceType: 'grade7', price: card.grade7Price })
      if (card.grade8Price) prices.push({ priceType: 'grade8', price: card.grade8Price })
      if (card.grade9Price) prices.push({ priceType: 'grade9', price: card.grade9Price })
      if (card.grade95Price) prices.push({ priceType: 'grade95', price: card.grade95Price })
      if (card.grade10Price) prices.push({ priceType: 'grade10', price: card.grade10Price })
      
      for (const price of prices) {
        await newPrisma.cardPrice.create({
          data: {
            sourceId: cardSource.id,
            priceType: price.priceType,
            price: price.price
          }
        })
      }
    }
    
    // 5. Create user-card relationships
    console.log('Creating user-card relationships...')
    for (const pc of existingProfileCards) {
      await newPrisma.userCard.upsert({
        where: {
          userId_cardId: {
            userId: pc.profileId,
            cardId: pc.cardId
          }
        },
        update: {},
        create: {
          userId: pc.profileId,
          cardId: pc.cardId,
          createdAt: pc.createdAt
        }
      })
    }
    
    console.log('Migration completed successfully!')
    
  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  } finally {
    await oldPrisma.$disconnect()
    await newPrisma.$disconnect()
  }
}

// Run migration
migrateData().catch(console.error)
