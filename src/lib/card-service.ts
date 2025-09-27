import { PrismaClient } from '@prisma/client'
import { extractCardMatch, type CardMatch } from './card-matching'
import { scrapeWithPuppeteer } from './puppeteer-scraping'
import { scrapePriceCharting } from './pricecharting-scraping'
import { scrapeWithFallback } from './scraping-fallback'

const prisma = new PrismaClient()

export interface CardWithSources {
  id: string
  name: string
  setDisplay: string | null
  jpNo: string | null
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
  setDisplay?: string
  jpNo?: string
  rarity?: string
  imageUrl?: string
  lastCheckedAt?: Date
  createdAt: Date
  updatedAt: Date
}

type PrismaTransaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

export class CardService {
  private cache = new Map<string, { data: CardWithSources; timestamp: number }>()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  async addCard(url: string, profile: string): Promise<CardDisplayData> {
    return await prisma.$transaction(async (tx) => {
      try {
        // 1. Extract card metadata
        // Extract the card name from the URL, ignoring query parameters
        let cardName = ''
        if (url.includes('tcgplayer.com')) {
          // Remove query parameters before parsing
          const cleanUrl = url.split('?')[0]
          const urlMatch = cleanUrl.match(/\/product\/\d+\/([^\/]+)/)
          cardName = urlMatch ? decodeURIComponent(urlMatch[1].replace(/-/g, ' ')) : ''
        } else if (url.includes('pricecharting.com')) {
          // Remove query parameters before parsing
          const cleanUrl = url.split('?')[0]
          const urlMatch = cleanUrl.match(/\/game\/[^\/]+\/([^\/]+)/)
          cardName = urlMatch ? decodeURIComponent(urlMatch[1].replace(/-/g, ' ')) : ''
        }
        
        const cardMatch = extractCardMatch(cardName, url)
        
        if (!cardMatch) {
          throw new Error('Could not extract card information from URL')
        }
        
        // 2. Find existing cards with same name and number
        const existingCards = await this.findMatchingCards(tx, cardMatch)
        
        if (existingCards.length > 0) {
          // 3. Merge with existing card
          const mergedCard = await this.mergeWithExisting(tx, existingCards[0], url, profile)
          return this.getCardDisplayData(mergedCard)
        } else {
          // 4. Create new card
          const newCard = await this.createNewCard(tx, cardMatch, url, profile)
          return this.getCardDisplayData(newCard)
        }
      } catch (error) {
        console.error('Error adding card:', error)
        throw error
      }
    })
  }

  async getCardsForProfile(profile: string): Promise<CardDisplayData[]> {
    const userCards = await prisma.userCard.findMany({
      where: { userId: profile },
      include: {
        card: {
          include: {
            sources: {
              include: {
                prices: true
              }
            }
          }
        }
      }
    })

    return userCards.map(uc => this.getCardDisplayData(uc.card as CardWithSources))
  }

  async refreshCard(cardId: string): Promise<CardDisplayData> {
    return await prisma.$transaction(async (tx) => {
      const card = await this.getCardWithSources(tx, cardId)
      if (!card) {
        throw new Error('Card not found')
      }

      // Refresh all sources in parallel
      const refreshPromises = card.sources.map(async (source) => {
        try {
          const newData = await this.scrapeCardData(source.url)
          return await this.updateCardSource(tx, source.id, newData)
        } catch (error) {
          console.error(`Failed to refresh source ${source.id}:`, error)
          return source // Return original if refresh fails
        }
      })

      await Promise.all(refreshPromises)
      
      // Return updated card
      const updatedCard = await this.getCardWithSources(tx, cardId)
      return this.getCardDisplayData(updatedCard!)
    })
  }

  async deleteCard(cardId: string, profile: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Remove user relationship
      await tx.userCard.deleteMany({
        where: {
          userId: profile,
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
    })
  }

  private async findMatchingCards(tx: PrismaTransaction, cardMatch: CardMatch): Promise<CardWithSources[]> {
    const cards = await tx.card.findMany({
      where: {
        name: cardMatch.name,
        jpNo: cardMatch.number
      },
      include: {
        sources: {
          include: {
            prices: true
          }
        }
      }
    })

    return cards
  }

  private async mergeWithExisting(
    tx: PrismaTransaction, 
    existingCard: CardWithSources, 
    newUrl: string, 
    profile: string
  ): Promise<CardWithSources> {
    // 1. Scrape new card data
    const newSourceData = await this.scrapeCardData(newUrl)
    
    // 2. Check if source already exists
    const existingSource = await tx.cardSource.findUnique({
      where: {
        cardId_sourceType: {
          cardId: existingCard.id,
          sourceType: newSourceData.sourceType
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
    
    // 3. Ensure user relationship exists
    await tx.userCard.upsert({
      where: {
        userId_cardId: {
          userId: profile,
          cardId: existingCard.id
        }
      },
      update: {},
      create: {
        userId: profile,
        cardId: existingCard.id
      }
    })
    
    // 4. Return updated card
    const updatedCard = await this.getCardWithSources(tx, existingCard.id)
    if (!updatedCard) {
      throw new Error('Failed to retrieve updated card')
    }
    return updatedCard
  }

  private async createNewCard(
    tx: PrismaTransaction, 
    cardMatch: CardMatch, 
    url: string, 
    profile: string
  ): Promise<CardWithSources> {
    // 1. Scrape card data
    const sourceData = await this.scrapeCardData(url)
    
    // 2. Create card record
    const card = await tx.card.create({
      data: {
        name: cardMatch.name,
        setDisplay: sourceData.setDisplay,
        jpNo: cardMatch.number,
        rarity: sourceData.rarity,
        imageUrl: sourceData.imageUrl
      }
    })
    
    // 3. Add source data
    await this.createCardSource(tx, card.id, sourceData)
    
    // 4. Add user relationship
    await tx.userCard.create({
      data: {
        userId: profile,
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

  private async createCardSource(tx: PrismaTransaction, cardId: string, sourceData: Record<string, any>): Promise<void> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const source = await tx.cardSource.create({
      data: {
        cardId: cardId,
        sourceType: sourceData.sourceType,
        url: sourceData.url,
        productId: sourceData.productId,
        currency: sourceData.currency || 'USD',
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

  private async updateCardSource(tx: PrismaTransaction, sourceId: string, sourceData: Record<string, any>): Promise<void> { // eslint-disable-line @typescript-eslint/no-explicit-any
    // Update source metadata
    await tx.cardSource.update({
      where: { id: sourceId },
      data: {
        url: sourceData.url,
        productId: sourceData.productId,
        currency: sourceData.currency || 'USD',
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

  private async scrapeCardData(url: string): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
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

  private extractPrices(sourceData: Record<string, any>): Array<{ priceType: string; price: number }> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const prices = []
    
    if (sourceData.marketPrice) {
      prices.push({ priceType: 'market', price: sourceData.marketPrice })
    }
    if (sourceData.ungradedPrice) {
      prices.push({ priceType: 'ungraded', price: sourceData.ungradedPrice })
    }
    if (sourceData.grade7Price) {
      prices.push({ priceType: 'grade7', price: sourceData.grade7Price })
    }
    if (sourceData.grade8Price) {
      prices.push({ priceType: 'grade8', price: sourceData.grade8Price })
    }
    if (sourceData.grade9Price) {
      prices.push({ priceType: 'grade9', price: sourceData.grade9Price })
    }
    if (sourceData.grade95Price) {
      prices.push({ priceType: 'grade95', price: sourceData.grade95Price })
    }
    if (sourceData.grade10Price) {
      prices.push({ priceType: 'grade10', price: sourceData.grade10Price })
    }
    
    return prices
  }

  private getCardDisplayData(card: CardWithSources): CardDisplayData {
    const consolidatedPricing = this.consolidatePricing(card.sources)
    
    return {
      id: card.id,
      name: card.name,
      isMerged: card.sources.length > 1,
      sourceCount: card.sources.length,
      sources: card.sources.map(s => ({
        type: s.sourceType,
        url: s.url,
        displayName: s.sourceType === 'tcgplayer' ? 'TCGplayer' : 'PriceCharting'
      })),
      pricing: consolidatedPricing,
      setDisplay: card.setDisplay ?? undefined,
      jpNo: card.jpNo ?? undefined,
      rarity: card.rarity ?? undefined,
      imageUrl: card.imageUrl ?? undefined,
      lastCheckedAt: card.sources.reduce((latest, source) => {
        if (!source.lastCheckedAt) return latest
        if (!latest) return source.lastCheckedAt
        return source.lastCheckedAt > latest ? source.lastCheckedAt : latest
      }, null as Date | null) || undefined,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt
    }
  }

  private consolidatePricing(sources: CardSource[]): CardDisplayData['pricing'] {
    const pricing: CardDisplayData['pricing'] = {}
    
    for (const source of sources) {
      for (const price of source.prices) {
        if (pricing[price.priceType as keyof typeof pricing] === undefined) {
          pricing[price.priceType as keyof typeof pricing] = Number(price.price)
        }
      }
    }
    
    return pricing
  }
}

export const cardService = new CardService()
