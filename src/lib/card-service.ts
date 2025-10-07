import { PrismaClient } from '@prisma/client'
import { extractCardMatch, areCardsSame, type CardMatch } from './card-matching'
import { scrapeWithPuppeteer } from './puppeteer-scraping'
import { scrapePriceCharting } from './pricecharting-scraping'
import { scrapeWithFallback } from './scraping-fallback'
import { redis } from './redis'

const prisma = new PrismaClient()

export interface CardWithSources {
  id: string
  name: string
  setDisplay: string | null
  No: string | null
  rarity: string | null
  imageUrl: string | null
  createdAt: Date
  updatedAt: Date
  sources: CardSource[]
}

export interface CardSource {
  id: string
  cardId: string
  sourceType: string
  url: string
  productId: string | null
  currency: string
  lastCheckedAt: Date | null
  createdAt: Date
  updatedAt: Date
  prices: CardPrice[]
}

export interface CardPrice {
  id: string
  sourceId: string
  priceType: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  price: any // Prisma Decimal type
  createdAt: Date
  updatedAt: Date
}

export interface CardDisplayData {
  id: string
  name: string
  url: string
  isMerged: boolean
  sourceCount: number
  sources: Array<{
    type: string
    url: string
    displayName: string
  }>
  pricing: {
    marketPrice?: number
    ungradedPrice?: number
    grade7Price?: number
    grade8Price?: number
    grade9Price?: number
    grade95Price?: number
    grade10Price?: number
  }
  // Flattened pricing fields for frontend compatibility
  marketPrice?: number
  ungradedPrice?: number
  grade7Price?: number
  grade8Price?: number
  grade9Price?: number
  grade95Price?: number
  grade10Price?: number
  setDisplay?: string
  No?: string
  rarity?: string
  imageUrl?: string
  lastCheckedAt?: Date
  createdAt: Date
  updatedAt: Date
  // Merged card fields
  mergedUrls?: string[]
  mergedSources?: string[]
}

type PrismaTransaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

export class CardService {
  private cache = new Map<string, { data: CardWithSources; timestamp: number }>()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes
  private readonly REDIS_TTL = 2 * 60 // 2 minutes in seconds

  private async getCachedCards(profileName: string): Promise<CardDisplayData[] | null> {
    if (!redis) return null
    
    try {
      const cacheKey = `cards:${profileName}`
      const cached = await redis.get(cacheKey)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      console.warn('Redis cache miss or error:', error)
      return null
    }
  }

  private async setCachedCards(profileName: string, cards: CardDisplayData[]): Promise<void> {
    if (!redis) return
    
    try {
      const cacheKey = `cards:${profileName}`
      await redis.setEx(cacheKey, this.REDIS_TTL, JSON.stringify(cards))
    } catch (error) {
      console.warn('Failed to cache cards:', error)
    }
  }

  private async invalidateProfileCache(profileName: string): Promise<void> {
    if (!redis) return
    
    try {
      const cacheKey = `cards:${profileName}`
      await redis.del(cacheKey)
    } catch (error) {
      console.warn('Failed to invalidate cache:', error)
    }
  }

  async addCard(url: string, profileName: string): Promise<CardDisplayData> {
    console.log('🔍 CardService.addCard called with:', { url, profileName })
    
    try {
      // 1. Extract card metadata and scrape data OUTSIDE transaction
      console.log('🔍 Extracting card metadata...')
      let cardName = ''
      let cardNumber = ''
      
      if (url.includes('tcgplayer.com')) {
        // Remove query parameters before parsing
        const cleanUrl = url.split('?')[0]
        // More flexible regex to handle different TCGplayer URL formats
        const urlMatch = cleanUrl.match(/\/product\/\d+\/([^\/\?]+)/)
        if (urlMatch) {
          const urlSegment = urlMatch[1]
          cardName = decodeURIComponent(urlSegment.replace(/-/g, ' '))
          
          // Try to extract card number from URL segment
          // Look for patterns like "tatsugiri-112", "tatsugiri-112101", or "magikarp-080-073"
          const numberMatch = urlSegment.match(/-(\d+)$/)
          if (numberMatch) {
            const fullNumber = numberMatch[1]
            // If the number is 6 digits (like 112101), extract the first 3 digits (112)
            if (fullNumber.length === 6) {
              cardNumber = fullNumber.substring(0, 3)
            } else {
              cardNumber = fullNumber
            }
          }
          
          // Also try to match patterns like "magikarp-080-073" where we want the first number
          const multiNumberMatch = urlSegment.match(/-(\d+)-(\d+)$/)
          if (multiNumberMatch) {
            const firstNumber = multiNumberMatch[1]
            const secondNumber = multiNumberMatch[2]
            // Use the first number as the card number
            cardNumber = firstNumber
            console.log(`🔍 Found multi-number pattern: ${firstNumber}-${secondNumber}, using ${firstNumber}`)
          }
        } else {
          // Fallback: try to extract from the end of the URL
          const fallbackMatch = cleanUrl.match(/\/([^\/\?]+)$/)
          if (fallbackMatch) {
            const urlSegment = fallbackMatch[1]
            cardName = decodeURIComponent(urlSegment.replace(/-/g, ' '))
            
            // Try to extract card number from URL segment
            const numberMatch = urlSegment.match(/-(\d+)$/)
            if (numberMatch) {
              const fullNumber = numberMatch[1]
              // If the number is 6 digits (like 112101), extract the first 3 digits (112)
              if (fullNumber.length === 6) {
                cardNumber = fullNumber.substring(0, 3)
              } else {
                cardNumber = fullNumber
              }
            }
            
            // Also try to match patterns like "magikarp-080-073" where we want the first number
            const multiNumberMatch = urlSegment.match(/-(\d+)-(\d+)$/)
            if (multiNumberMatch) {
              const firstNumber = multiNumberMatch[1]
              const secondNumber = multiNumberMatch[2]
              // Use the first number as the card number
              cardNumber = firstNumber
              console.log(`🔍 Found multi-number pattern: ${firstNumber}-${secondNumber}, using ${firstNumber}`)
            }
          }
        }
      } else if (url.includes('pricecharting.com')) {
        // Remove query parameters before parsing
        const cleanUrl = url.split('?')[0]
        // More flexible regex to handle different PriceCharting URL formats
        const urlMatch = cleanUrl.match(/\/game\/[^\/]+\/([^\/\?]+)/)
        if (urlMatch) {
          const urlSegment = urlMatch[1]
          cardName = decodeURIComponent(urlSegment.replace(/-/g, ' '))
          
          // Try to extract card number from URL segment
          const numberMatch = urlSegment.match(/-(\d+)$/)
          if (numberMatch) {
            cardNumber = numberMatch[1]
          }
        } else {
          // Fallback: try to extract from the end of the URL
          const fallbackMatch = cleanUrl.match(/\/([^\/\?]+)$/)
          if (fallbackMatch) {
            const urlSegment = fallbackMatch[1]
            cardName = decodeURIComponent(urlSegment.replace(/-/g, ' '))
            
            // Try to extract card number from URL segment
            const numberMatch = urlSegment.match(/-(\d+)$/)
            if (numberMatch) {
              const fullNumber = numberMatch[1]
              // If the number is 6 digits (like 112101), extract the first 3 digits (112)
              if (fullNumber.length === 6) {
                cardNumber = fullNumber.substring(0, 3)
              } else {
                cardNumber = fullNumber
              }
            }
            
            // Also try to match patterns like "magikarp-080-073" where we want the first number
            const multiNumberMatch = urlSegment.match(/-(\d+)-(\d+)$/)
            if (multiNumberMatch) {
              const firstNumber = multiNumberMatch[1]
              const secondNumber = multiNumberMatch[2]
              // Use the first number as the card number
              cardNumber = firstNumber
              console.log(`🔍 Found multi-number pattern: ${firstNumber}-${secondNumber}, using ${firstNumber}`)
            }
          }
        }
      }
      
      // 2. Scrape card data OUTSIDE transaction
      console.log('🔍 Scraping card data...')
      const sourceData = await this.scrapeCardData(url)
      console.log('🔍 Scraped data:', sourceData)
      
      // 3. Use scraped card name if available, otherwise use URL-extracted name
      let finalCardName = cardName
      if (sourceData && sourceData.name && typeof sourceData.name === 'string') {
        finalCardName = sourceData.name
        console.log('🔍 Using card name from scraped data:', finalCardName)
      } else {
        console.log('🔍 Using card name from URL:', finalCardName)
      }
      
      // 4. Extract card number from scraped data if available
      if (sourceData && sourceData.cardNumber && typeof sourceData.cardNumber === 'string') {
        // Use the card number extracted from H1 element
        cardNumber = sourceData.cardNumber
        console.log('🔍 Using card number from H1 element:', cardNumber)
      } else if (sourceData && sourceData.No && typeof sourceData.No === 'string') {
        // Fallback: Extract number from No (e.g., "112/101" -> "112")
        const jpNoMatch = sourceData.No.match(/^(\d+)\/\d+$/)
        if (jpNoMatch) {
          cardNumber = jpNoMatch[1]
          console.log('🔍 Using card number from No:', cardNumber)
        }
      }
      
      // 5. Extract card match with final card name and updated card number
      const cardMatch = extractCardMatch(finalCardName, url, cardNumber)
      console.log('🔍 Card match result:', cardMatch)
      
      if (!cardMatch) {
        throw new Error('Could not extract card information from URL')
      }
      
      // Validate scraped data
      if (!sourceData || typeof sourceData !== 'object') {
        throw new Error('Failed to scrape card data - no data returned')
      }
      
      if (!sourceData.sourceType) {
        throw new Error('Failed to scrape card data - missing sourceType')
      }

      // 6. Now do database operations in transaction
      return await prisma.$transaction(async (tx) => {
        try {
          console.log('🔍 Starting transaction')
          // 0. Ensure profile exists
          let profile = await tx.profile.findUnique({ where: { name: profileName } })
          if (!profile) {
            console.log('🔍 Creating new profile:', profileName)
            profile = await tx.profile.create({ data: { name: profileName } })
          }
          console.log('🔍 Profile found/created:', profile.id)
          
          // 4. Find existing cards with same name and number
          console.log('🔍 Looking for existing cards...')
          const existingCards = await this.findMatchingCards(tx, cardMatch)
          console.log('🔍 Found existing cards:', existingCards.length)
          
          if (existingCards.length > 0) {
            // 5. Merge with existing card
            const mergedCard = await this.mergeWithExisting(tx, existingCards[0], url, profile.id, sourceData)
            return this.getCardDisplayData(mergedCard)
          } else {
            // 6. Create new card
            console.log('🔍 Creating new card...')
            const newCard = await this.createNewCard(tx, cardMatch, url, profile.id, sourceData)
            console.log('🔍 New card created:', newCard.id)
            const result = this.getCardDisplayData(newCard)
            
            // Invalidate cache for this profile
            await this.invalidateProfileCache(profileName)
            
            return result
          }
        } catch (error) {
          console.error('❌ Error in transaction:', error)
          throw error
        }
      })
    } catch (error) {
      console.error('❌ Error adding card:', error)
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack')
      throw error
    }
  }

  async getCardsForProfile(profileName: string): Promise<CardDisplayData[]> {
    // Try cache first
    const cached = await this.getCachedCards(profileName)
    if (cached) {
      console.log(`📦 Cache hit for profile: ${profileName}`)
      return cached
    }

    console.log(`🔍 Cache miss, fetching from database for profile: ${profileName}`)

    // Ensure profile exists
    let profile = await prisma.profile.findUnique({ where: { name: profileName } })
    if (!profile) {
      profile = await prisma.profile.create({ data: { name: profileName } })
    }

    // Optimized query: Get user cards with basic card info first
    const userCards = await prisma.userCard.findMany({
      where: { userId: profile.id },
      include: {
        card: {
          select: {
            id: true,
            name: true,
            setDisplay: true,
            No: true,
            rarity: true,
            imageUrl: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    })

    if (userCards.length === 0) {
      await this.setCachedCards(profileName, [])
      return []
    }

    // Get sources separately for better performance
    const cardIds = userCards.map(uc => uc.card.id)
    const sources = await prisma.cardSource.findMany({
      where: { cardId: { in: cardIds } },
      include: { prices: true }
    })

    // Group sources by cardId for efficient lookup
    const sourcesByCard = sources.reduce((acc, source) => {
      if (!acc[source.cardId]) acc[source.cardId] = []
      acc[source.cardId].push(source)
      return acc
    }, {} as Record<string, CardSource[]>)

    // Combine data efficiently
    const cardsWithSources = userCards.map(uc => ({
      ...uc.card,
      sources: sourcesByCard[uc.card.id] || []
    }))

    const result = cardsWithSources.map(card => this.getCardDisplayData(card as CardWithSources))
    
    // Cache the result
    await this.setCachedCards(profileName, result)
    
    return result
  }

  async refreshCard(cardId: string): Promise<CardDisplayData> {
    // First, get the card to find its sources
    const card = await this.getCardWithSources(prisma, cardId)
    if (!card) {
      throw new Error('Card not found')
    }

    // Scrape all sources OUTSIDE transaction to avoid timeout
    const refreshPromises = card.sources.map(async (source) => {
      try {
        console.log(`🔍 Refreshing source: ${source.sourceType} - ${source.url}`)
        const newData = await this.scrapeCardData(source.url)
        console.log(`✅ Scraped data for ${source.sourceType}:`, newData)
        return { source, newData }
      } catch (error) {
        console.error(`❌ Failed to refresh source ${source.id}:`, error)
        return { source, newData: null, error }
      }
    })

    const refreshResults = await Promise.all(refreshPromises)

    // Now update the database in a transaction
    return await prisma.$transaction(async (tx) => {
      for (const result of refreshResults) {
        if (result.newData) {
          await this.refreshCardSource(tx, result.source.id, result.newData)
        }
        // If scraping failed, we just skip updating that source
      }
      
      // Return updated card
      const updatedCard = await this.getCardWithSources(tx, cardId)
      const result = this.getCardDisplayData(updatedCard!)
      
      // Invalidate cache for all profiles that have this card
      const profiles = await prisma.profile.findMany({
        where: {
          userCards: {
            some: { cardId: cardId }
          }
        }
      })
      
      await Promise.all(profiles.map(p => this.invalidateProfileCache(p.name)))
      
      return result
    })
  }

  async deleteCard(cardId: string, profileName: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Get profile ID
      const profile = await tx.profile.findUnique({ where: { name: profileName } })
      if (!profile) {
        throw new Error('Profile not found')
      }

      // Remove user relationship
      await tx.userCard.deleteMany({
        where: {
          userId: profile.id,
          cardId: cardId
        }
      })

      // Check if other users have this card
      const hasOtherUsers = await tx.userCard.findFirst({
        where: { cardId: cardId }
      })

      if (!hasOtherUsers) {
        // No other users, delete everything
        await tx.cardPrice.deleteMany({
          where: {
            source: {
              cardId: cardId
            }
          }
        })
        
        await tx.cardSource.deleteMany({
          where: { cardId: cardId }
        })
        
        await tx.card.delete({
          where: { id: cardId }
        })
      }
      
      // Invalidate cache for this profile
      await this.invalidateProfileCache(profileName)
    })
  }

  private async findMatchingCards(tx: PrismaTransaction, cardMatch: CardMatch): Promise<CardWithSources[]> {
    // Get all cards and use the improved matching logic
    const allCards = await tx.card.findMany({
      include: {
        sources: {
          include: {
            prices: true
          }
        }
      }
    })

    // Filter cards using the improved matching logic
    const matchingCards = allCards.filter(card => {
      // Use the improved card matching logic
      const existingCardMatch = {
        name: card.name,
        number: card.No || ''
      }
      
      return areCardsSame(existingCardMatch, cardMatch)
    })

    return matchingCards
  }

  private async mergeWithExisting(
    tx: PrismaTransaction, 
    existingCard: CardWithSources, 
    newUrl: string, 
    profileId: string,
    newSourceData: Record<string, unknown>
  ): Promise<CardWithSources> {
    // 1. Use pre-scraped data (no need to scrape again)
    
    // 2. Check if source already exists
    const sourceType = typeof newSourceData.sourceType === 'string' ? newSourceData.sourceType : 'unknown'
    const existingSource = await tx.cardSource.findUnique({
      where: {
        cardId_sourceType: {
          cardId: existingCard.id,
          sourceType: sourceType
        }
      }
    })
    
    if (existingSource) {
      // Update existing source
      await this.updateCardSource(tx, existingSource.id, newSourceData)
    } else {
      // Create new source
      await this.createCardSource(tx, existingCard.id, newSourceData)
    }
    
    // 3. Update card metadata with best available data
    // Prefer PriceCharting data for better metadata, but only update if current data is missing or empty
    const updateData: any = {}
    
    // Update setDisplay if new data is available and current is empty
    if (typeof newSourceData.setDisplay === 'string' && newSourceData.setDisplay.trim() && 
        (!existingCard.setDisplay || existingCard.setDisplay.trim() === '')) {
      updateData.setDisplay = newSourceData.setDisplay
    }
    
    // Update rarity if new data is available and current is empty
    if (typeof newSourceData.rarity === 'string' && newSourceData.rarity.trim() && 
        (!existingCard.rarity || existingCard.rarity.trim() === '')) {
      updateData.rarity = newSourceData.rarity
    }
    
    // Update imageUrl if new data is available and current is empty
    if (typeof newSourceData.imageUrl === 'string' && newSourceData.imageUrl.trim() && 
        (!existingCard.imageUrl || existingCard.imageUrl.trim() === '')) {
      updateData.imageUrl = newSourceData.imageUrl
    }
    
    // Update No (card number) if new data is available and current is empty
    if (typeof newSourceData.cardNumber === 'string' && newSourceData.cardNumber.trim() && 
        (!existingCard.No || existingCard.No.trim() === '')) {
      updateData.No = newSourceData.cardNumber
    }
    
    // Only update if we have data to update
    if (Object.keys(updateData).length > 0) {
      await tx.card.update({
        where: { id: existingCard.id },
        data: updateData
      })
    }
    
    // 4. Ensure user relationship exists
    await tx.userCard.upsert({
      where: {
        userId_cardId: {
          userId: profileId,
          cardId: existingCard.id
        }
      },
      update: {},
      create: {
        userId: profileId,
        cardId: existingCard.id
      }
    })
    
    // 5. Return updated card
    const updatedCard = await this.getCardWithSources(tx, existingCard.id)
    if (!updatedCard) {
      throw new Error('Failed to retrieve updated card')
    }
    
    // 6. Invalidate cache for this profile (we need to get the profile name)
    const profile = await tx.profile.findUnique({ where: { id: profileId } })
    if (profile) {
      await this.invalidateProfileCache(profile.name)
    }
    
    return updatedCard
  }

  private async createNewCard(
    tx: PrismaTransaction, 
    cardMatch: CardMatch, 
    url: string, 
    profileId: string,
    sourceData: Record<string, unknown>
  ): Promise<CardWithSources> {
    console.log('🔍 createNewCard called with:', { cardMatch, url, profileId })
    // 1. Use pre-scraped data (no need to scrape again)
    console.log('🔍 Using pre-scraped data:', sourceData)
    
    // 2. Create card record
    console.log('🔍 Creating card record...')
    const card = await tx.card.create({
      data: {
        name: cardMatch.name, // Use the card match name, not the scraped data name
        setDisplay: typeof sourceData.setDisplay === 'string' ? sourceData.setDisplay : undefined,
        No: cardMatch.number,
        rarity: typeof sourceData.rarity === 'string' ? sourceData.rarity : undefined,
        imageUrl: typeof sourceData.imageUrl === 'string' ? sourceData.imageUrl : undefined
      }
    })
    console.log('🔍 Card created with ID:', card.id)
    
    // 3. Add source data
    await this.createCardSource(tx, card.id, sourceData)
    
    // 4. Add user relationship
    await tx.userCard.create({
      data: {
        userId: profileId,
        cardId: card.id
      }
    })
    
    // 5. Return complete card
    const newCard = await this.getCardWithSources(tx, card.id)
    if (!newCard) {
      throw new Error('Failed to retrieve created card')
    }
    return newCard
  }

  private async createCardSource(tx: PrismaTransaction, cardId: string, sourceData: Record<string, unknown>): Promise<void> {
    // Validate sourceData
    if (!sourceData || typeof sourceData !== 'object') {
      throw new Error('Invalid sourceData provided to createCardSource')
    }
    
    const source = await tx.cardSource.create({
      data: {
        cardId: cardId,
        sourceType: typeof sourceData.sourceType === 'string' ? sourceData.sourceType : 'unknown',
        url: typeof sourceData.url === 'string' ? sourceData.url : '',
        productId: typeof sourceData.productId === 'string' ? sourceData.productId : '',
        currency: typeof sourceData.currency === 'string' ? sourceData.currency : 'USD',
        lastCheckedAt: new Date()
      }
    })

    // Create prices
    const prices = this.extractPrices(sourceData)
    for (const price of prices) {
      await tx.cardPrice.create({
        data: {
          sourceId: source.id,
          priceType: price.priceType,
          price: price.price
        }
      })
    }
  }

  private async updateCardSource(tx: PrismaTransaction, sourceId: string, sourceData: Record<string, unknown>): Promise<void> {
    // Validate sourceData
    if (!sourceData || typeof sourceData !== 'object') {
      throw new Error('Invalid sourceData provided to updateCardSource')
    }
    
    // Update source metadata
    await tx.cardSource.update({
      where: { id: sourceId },
      data: {
        url: typeof sourceData.url === 'string' ? sourceData.url : '',
        productId: typeof sourceData.productId === 'string' ? sourceData.productId : '',
        currency: typeof sourceData.currency === 'string' ? sourceData.currency : 'USD',
        lastCheckedAt: new Date()
      }
    })

    // Update prices
    const prices = this.extractPrices(sourceData)
    for (const price of prices) {
      await tx.cardPrice.upsert({
        where: {
          sourceId_priceType: {
            sourceId: sourceId,
            priceType: price.priceType
          }
        },
        update: {
          price: price.price
        },
        create: {
          sourceId: sourceId,
          priceType: price.priceType,
          price: price.price
        }
      })
    }
  }

  private async refreshCardSource(tx: PrismaTransaction, sourceId: string, sourceData: Record<string, unknown>): Promise<void> {
    // Validate sourceData
    if (!sourceData || typeof sourceData !== 'object') {
      throw new Error('Invalid sourceData provided to refreshCardSource')
    }
    
    // Only update lastCheckedAt timestamp for refresh
    await tx.cardSource.update({
      where: { id: sourceId },
      data: {
        lastCheckedAt: new Date()
      }
    })

    // Update prices only
    const prices = this.extractPrices(sourceData)
    for (const price of prices) {
      await tx.cardPrice.upsert({
        where: {
          sourceId_priceType: {
            sourceId: sourceId,
            priceType: price.priceType
          }
        },
        update: {
          price: price.price
        },
        create: {
          sourceId: sourceId,
          priceType: price.priceType,
          price: price.price
        }
      })
    }
  }

  private async getCardWithSources(tx: PrismaTransaction, cardId: string): Promise<CardWithSources | null> {
    const card = await tx.card.findUnique({
      where: { id: cardId },
      include: {
        sources: {
          include: {
            prices: true
          }
        }
      }
    })

    return card
  }

  private async scrapeCardData(url: string): Promise<Record<string, unknown>> {
    // Validate URL
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL provided to scrapeCardData')
    }
    
    if (url.includes('tcgplayer.com')) {
      // Strip query parameters for consistent storage
      const cleanUrl = url.split('?')[0]
      
      try {
        const productIdMatch = url.match(/\/product\/(\d+)(?:\/|$|\?)/)
        if (!productIdMatch) {
          throw new Error('Invalid TCGplayer URL format')
        }
        
        const scrapedData = await scrapeWithPuppeteer(url, productIdMatch[1])
        return {
          ...scrapedData,
          sourceType: 'tcgplayer',
          productId: productIdMatch[1],
          currency: 'USD',
          url: cleanUrl
        }
      } catch (error) {
        console.warn('Puppeteer scraping failed, using fallback:', error)
        const fallbackData = await scrapeWithFallback(url, '')
        return {
          ...fallbackData,
          sourceType: 'tcgplayer',
          productId: '',
          currency: 'USD',
          url: cleanUrl
        }
      }
    } else if (url.includes('pricecharting.com')) {
      // Strip query parameters for consistent storage
      const cleanUrl = url.split('?')[0]
      
      const scrapedData = await scrapePriceCharting(url)
      return {
        ...scrapedData,
        sourceType: 'pricecharting',
        productId: '',
        currency: 'USD',
        url: cleanUrl
      }
    } else {
      throw new Error('Unsupported URL format')
    }
  }

  private extractPrices(sourceData: Record<string, unknown>): Array<{ priceType: string; price: number }> {
    // Validate sourceData
    if (!sourceData || typeof sourceData !== 'object') {
      console.warn('Invalid sourceData provided to extractPrices:', sourceData)
      return []
    }
    
    const prices: Array<{ priceType: string; price: number }> = []
    
    if (typeof sourceData.marketPrice === 'number') {
      prices.push({ priceType: 'market', price: sourceData.marketPrice })
    }
    if (typeof sourceData.ungradedPrice === 'number') {
      prices.push({ priceType: 'ungraded', price: sourceData.ungradedPrice })
    }
    if (typeof sourceData.grade7Price === 'number') {
      prices.push({ priceType: 'grade7', price: sourceData.grade7Price })
    }
    if (typeof sourceData.grade8Price === 'number') {
      prices.push({ priceType: 'grade8', price: sourceData.grade8Price })
    }
    if (typeof sourceData.grade9Price === 'number') {
      prices.push({ priceType: 'grade9', price: sourceData.grade9Price })
    }
    if (typeof sourceData.grade95Price === 'number') {
      prices.push({ priceType: 'grade95', price: sourceData.grade95Price })
    }
    if (typeof sourceData.grade10Price === 'number') {
      prices.push({ priceType: 'grade10', price: sourceData.grade10Price })
    }
    
    return prices
  }

  private getCardDisplayData(card: CardWithSources): CardDisplayData {
    const consolidatedPricing = this.consolidatePricing(card.sources)
    
    // For merged cards, prefer PriceCharting for better metadata (setDisplay, No, rarity, imageUrl)
    // but fall back to TCGplayer if PriceCharting data is not available
    const pricechartingSource = card.sources.find(s => s.sourceType === 'pricecharting')
    const tcgplayerSource = card.sources.find(s => s.sourceType === 'tcgplayer')
    
    // Use PriceCharting metadata if available, otherwise use TCGplayer, otherwise use card defaults
    const preferredSource = pricechartingSource || tcgplayerSource || card.sources[0]
    
    return {
      id: card.id,
      name: card.name,
      url: card.sources[0]?.url || '',
      isMerged: card.sources.length > 1,
      sourceCount: card.sources.length,
      sources: card.sources.map(s => ({
        type: s.sourceType,
        url: s.url,
        displayName: s.sourceType === 'tcgplayer' ? 'TCGplayer' : 'PriceCharting'
      })),
      pricing: consolidatedPricing,
      // Flatten pricing data for frontend compatibility
      marketPrice: consolidatedPricing.marketPrice,
      ungradedPrice: consolidatedPricing.ungradedPrice,
      grade7Price: consolidatedPricing.grade7Price,
      grade8Price: consolidatedPricing.grade8Price,
      grade9Price: consolidatedPricing.grade9Price,
      grade95Price: consolidatedPricing.grade95Price,
      grade10Price: consolidatedPricing.grade10Price,
      setDisplay: card.setDisplay ?? undefined,
      No: card.No ?? undefined,
      rarity: card.rarity ?? undefined,
      imageUrl: card.imageUrl ?? undefined,
      lastCheckedAt: card.sources.reduce((latest, source) => {
        if (!source.lastCheckedAt) return latest
        if (!latest) return source.lastCheckedAt
        return source.lastCheckedAt > latest ? source.lastCheckedAt : latest
      }, null as Date | null) || undefined,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
      // Merged card fields
      mergedUrls: card.sources.map(s => s.url),
      mergedSources: card.sources.map(s => s.sourceType)
    }
  }

  private consolidatePricing(sources: CardSource[]): CardDisplayData['pricing'] {
    const pricing: CardDisplayData['pricing'] = {}
    
    // Sort sources to prioritize PriceCharting for graded prices and TCGplayer for market price
    const sortedSources = [...sources].sort((a, b) => {
      // PriceCharting first for graded prices, TCGplayer first for market price
      if (a.sourceType === 'pricecharting' && b.sourceType === 'tcgplayer') return -1
      if (a.sourceType === 'tcgplayer' && b.sourceType === 'pricecharting') return 1
      return 0
    })
    
    for (const source of sortedSources) {
      for (const price of source.prices) {
        // Map price types to the expected keys
        let key: keyof typeof pricing
        switch (price.priceType) {
          case 'market':
            key = 'marketPrice'
            break
          case 'ungraded':
            key = 'ungradedPrice'
            break
          case 'grade7':
            key = 'grade7Price'
            break
          case 'grade8':
            key = 'grade8Price'
            break
          case 'grade9':
            key = 'grade9Price'
            break
          case 'grade95':
            key = 'grade95Price'
            break
          case 'grade10':
            key = 'grade10Price'
            break
          default:
            continue
        }
        
        // Only set if not already set, or if this is a better source for this price type
        if (pricing[key] === undefined) {
          pricing[key] = Number(price.price)
        } else {
          // For graded prices, prefer PriceCharting data
          if (['ungradedPrice', 'grade7Price', 'grade8Price', 'grade9Price', 'grade95Price', 'grade10Price'].includes(key) && source.sourceType === 'pricecharting') {
            pricing[key] = Number(price.price)
          }
          // For market price, prefer TCGplayer data
          else if (key === 'marketPrice' && source.sourceType === 'tcgplayer') {
            pricing[key] = Number(price.price)
          }
        }
      }
    }
    
    return pricing
  }

  /**
   * Refresh multiple cards for a specific profile
   */
  async refreshCards(cardIds: string[], profileId: string): Promise<{ refreshed: number; errors: string[] }> {
    console.log(`🔄 Refreshing ${cardIds.length} cards for profile ${profileId}`)
    
    const errors: string[] = []
    let refreshed = 0
    
    for (const cardId of cardIds) {
      try {
        await this.refreshCard(cardId)
        refreshed++
        console.log(`✅ Refreshed card ${cardId}`)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        errors.push(`Card ${cardId}: ${errorMessage}`)
        console.error(`❌ Failed to refresh card ${cardId}:`, error)
      }
    }
    
    console.log(`🔄 Refresh completed: ${refreshed}/${cardIds.length} cards refreshed`)
    return { refreshed, errors }
  }

  /**
   * Get all cards for daily refresh (with profile information)
   */
  async getAllCardsForRefresh(): Promise<Array<{ id: string; profileId: string; name: string; No: string | null }>> {
    console.log('🔍 Fetching all cards for daily refresh...')
    
    const cards = await prisma.card.findMany({
      select: {
        id: true,
        name: true,
        No: true,
        userCards: {
          select: {
            userId: true
          }
        }
      }
    })
    
    // Flatten the userCards relationship to get profile IDs
    const cardsWithProfiles = cards.flatMap(card => 
      card.userCards.map(userCard => ({
        id: card.id,
        profileId: userCard.userId,
        name: card.name,
        No: card.No
      }))
    )
    
    console.log(`🔍 Found ${cardsWithProfiles.length} cards across all profiles`)
    return cardsWithProfiles
  }
}

export const cardService = new CardService()
