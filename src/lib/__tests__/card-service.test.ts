import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { PrismaClient } from '@prisma/client'
import { cardService } from '../card-service'

// Mock the scraping functions
jest.mock('../puppeteer-scraping', () => ({
  scrapeWithPuppeteer: jest.fn().mockResolvedValue({
    name: 'Test Card',
    setDisplay: 'Test Set',
    rarity: 'Rare',
    imageUrl: 'https://example.com/image.jpg',
    marketPrice: 10.50
  })
}))

jest.mock('../pricecharting-scraping', () => ({
  scrapePriceCharting: jest.fn().mockResolvedValue({
    name: 'Test Card',
    setDisplay: 'Test Set',
    rarity: 'Rare',
    imageUrl: 'https://example.com/image.jpg',
    ungradedPrice: 15.00,
    grade9Price: 25.00,
    grade10Price: 50.00
  })
}))

jest.mock('../scraping-fallback', () => ({
  scrapeWithFallback: jest.fn().mockResolvedValue({
    name: 'Test Card Fallback',
    setDisplay: 'Test Set',
    rarity: 'Rare',
    imageUrl: 'https://example.com/image.jpg',
    marketPrice: 8.00
  })
}))

const prisma = new PrismaClient()

describe('CardService', () => {
  const testProfile = 'TestUser'
  const tcgplayerUrl = 'https://www.tcgplayer.com/product/123456/test-card'
  const pricechartingUrl = 'https://www.pricecharting.com/game/test-set/test-card-123'

  beforeEach(async () => {
    // Clean up test data
    await prisma.userCard.deleteMany({
      where: { userId: testProfile }
    })
    await prisma.cardPrice.deleteMany()
    await prisma.cardSource.deleteMany()
    await prisma.card.deleteMany()
    await prisma.profile.deleteMany({
      where: { name: testProfile }
    })
  })

  afterEach(async () => {
    // Clean up after each test
    await prisma.userCard.deleteMany({
      where: { userId: testProfile }
    })
    await prisma.cardPrice.deleteMany()
    await prisma.cardSource.deleteMany()
    await prisma.card.deleteMany()
    await prisma.profile.deleteMany({
      where: { name: testProfile }
    })
  })

  describe('addCard', () => {
    it('should create a new card for TCGplayer URL', async () => {
      const result = await cardService.addCard(tcgplayerUrl, testProfile)

      expect(result.name).toBe('Test Card')
      expect(result.isMerged).toBe(false)
      expect(result.sourceCount).toBe(1)
      expect(result.sources[0].type).toBe('tcgplayer')
      expect(result.pricing.marketPrice).toBe(10.50)
    })

    it('should create a new card for PriceCharting URL', async () => {
      const result = await cardService.addCard(pricechartingUrl, testProfile)

      expect(result.name).toBe('Test Card')
      expect(result.isMerged).toBe(false)
      expect(result.sourceCount).toBe(1)
      expect(result.sources[0].type).toBe('pricecharting')
      expect(result.pricing.ungradedPrice).toBe(15.00)
      expect(result.pricing.grade9Price).toBe(25.00)
      expect(result.pricing.grade10Price).toBe(50.00)
    })

    it('should merge cards with same name and number', async () => {
      // Add TCGplayer card first
      const firstCard = await cardService.addCard(tcgplayerUrl, testProfile)
      expect(firstCard.isMerged).toBe(false)

      // Add PriceCharting card with same name
      const secondCard = await cardService.addCard(pricechartingUrl, testProfile)
      
      expect(secondCard.isMerged).toBe(true)
      expect(secondCard.sourceCount).toBe(2)
      expect(secondCard.sources).toHaveLength(2)
      expect(secondCard.sources.map(s => s.type)).toContain('tcgplayer')
      expect(secondCard.sources.map(s => s.type)).toContain('pricecharting')
      
      // Should have pricing from both sources
      expect(secondCard.pricing.marketPrice).toBe(10.50) // From TCGplayer
      expect(secondCard.pricing.ungradedPrice).toBe(15.00) // From PriceCharting
    })

    it('should handle order independence (PriceCharting first, then TCGplayer)', async () => {
      // Add PriceCharting card first
      const firstCard = await cardService.addCard(pricechartingUrl, testProfile)
      expect(firstCard.isMerged).toBe(false)

      // Add TCGplayer card with same name
      const secondCard = await cardService.addCard(tcgplayerUrl, testProfile)
      
      expect(secondCard.isMerged).toBe(true)
      expect(secondCard.sourceCount).toBe(2)
      expect(secondCard.sources).toHaveLength(2)
    })
  })

  describe('getCardsForProfile', () => {
    it('should return cards for a profile', async () => {
      // Add a card
      await cardService.addCard(tcgplayerUrl, testProfile)

      // Get cards for profile
      const cards = await cardService.getCardsForProfile(testProfile)
      
      expect(cards).toHaveLength(1)
      expect(cards[0].name).toBe('Test Card')
    })

    it('should return empty array for profile with no cards', async () => {
      const cards = await cardService.getCardsForProfile(testProfile)
      expect(cards).toHaveLength(0)
    })
  })

  describe('refreshCard', () => {
    it('should refresh a card successfully', async () => {
      // Add a card
      const card = await cardService.addCard(tcgplayerUrl, testProfile)
      
      // Refresh the card
      const refreshedCard = await cardService.refreshCard(card.id)
      
      expect(refreshedCard.id).toBe(card.id)
      expect(refreshedCard.name).toBe('Test Card')
    })

    it('should handle refresh errors gracefully', async () => {
      // Mock scraping to throw error
      const { scrapeWithPuppeteer } = await import('../puppeteer-scraping')
      ;(scrapeWithPuppeteer as jest.Mock).mockRejectedValueOnce(new Error('Scraping failed'))

      // Add a card
      const card = await cardService.addCard(tcgplayerUrl, testProfile)
      
      // Refresh should not throw error
      const refreshedCard = await cardService.refreshCard(card.id)
      expect(refreshedCard.id).toBe(card.id)
    })
  })

  describe('deleteCard', () => {
    it('should delete a card when no other users have it', async () => {
      // Add a card
      const card = await cardService.addCard(tcgplayerUrl, testProfile)
      
      // Delete the card
      await cardService.deleteCard(card.id, testProfile)
      
      // Card should be deleted
      const cards = await cardService.getCardsForProfile(testProfile)
      expect(cards).toHaveLength(0)
    })

    it('should not delete card when other users have it', async () => {
      // Add a card for one user
      const card = await cardService.addCard(tcgplayerUrl, testProfile)
      
      // Add same card for another user
      await cardService.addCard(tcgplayerUrl, 'AnotherUser')
      
      // Delete for first user
      await cardService.deleteCard(card.id, testProfile)
      
      // Card should still exist for other user
      const cards = await cardService.getCardsForProfile('AnotherUser')
      expect(cards).toHaveLength(1)
    })
  })
})
