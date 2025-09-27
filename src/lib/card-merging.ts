/**
 * Card merging functionality for combining data from different sources
 */

import { prisma } from '@/lib/prisma'
import { extractCardMatch, areCardsSame, type CardMatch } from '@/lib/card-matching'

export interface MergedCardData {
  id: string
  url: string
  productId: string
  name: string
  setDisplay?: string | null
  jpNo?: string | null
  rarity?: string | null
  imageUrl?: string | null
  marketPrice?: number | null
  currency: string
  ungradedPrice?: number | null
  grade7Price?: number | null
  grade8Price?: number | null
  grade9Price?: number | null
  grade95Price?: number | null
  grade10Price?: number | null
  lastCheckedAt?: Date | null
  createdAt: Date
  updatedAt: Date
  // Merging fields
  mergedWith?: string | null
  isMerged: boolean
  mergeGroupId?: string | null
  // Additional data for UI
  mergedUrls: string[]
  mergedSources: string[]
}

interface Card {
  id: string
  url: string
  productId: string
  name: string
  setDisplay?: string | null
  jpNo?: string | null
  rarity?: string | null
  imageUrl?: string | null
  marketPrice?: number | null
  currency: string
  ungradedPrice?: number | null
  grade7Price?: number | null
  grade8Price?: number | null
  grade9Price?: number | null
  grade95Price?: number | null
  grade10Price?: number | null
  lastCheckedAt?: Date | null
  createdAt: Date
  updatedAt: Date
  mergedWith?: string | null
  isMerged: boolean
  mergeGroupId?: string | null
}

/**
 * Find existing cards that match the given card
 */
export async function findMatchingCards(
  newCardName: string,
  newCardUrl: string
): Promise<{ card: Card; match: CardMatch }[]> {
  const newCardMatch = extractCardMatch(newCardName, newCardUrl)
  if (!newCardMatch) return []

  // Check all cards (both merged and non-merged)
  const allCards = await prisma.card.findMany()

  const matches: { card: Card; match: CardMatch }[] = []

  for (const card of allCards) {
    const existingMatch = extractCardMatch(card.name, card.url)
    if (existingMatch && areCardsSame(newCardMatch, existingMatch)) {
      matches.push({ card, match: existingMatch })
    }
  }

  return matches
}

/**
 * Merge a new card with existing cards
 */
export async function mergeCardWithExisting(
  newCardData: Partial<Card>,
  existingMatches: { card: Card; match: CardMatch }[]
): Promise<{ mergedCard: Card; wasMerged: boolean }> {
  if (existingMatches.length === 0) {
    // No matches found, create new card
    const newCard = await prisma.card.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: newCardData as any, // Type assertion needed for Prisma compatibility
    })
    return { mergedCard: newCard, wasMerged: false }
  }

  // Use the first existing card as the primary card
  const primaryCard = existingMatches[0].card
  const mergeGroupId = primaryCard.mergeGroupId || primaryCard.id

  // Update the primary card with merged data
  const mergedData = mergeCardData(primaryCard, newCardData)
  const updatedPrimaryCard = await prisma.card.update({
    where: { id: primaryCard.id },
    data: {
      ...mergedData,
      isMerged: true,
      mergeGroupId,
    },
  })

  // Note: We don't create a new card when merging - we just update the existing one

  // Update any other existing matches to be merged with the primary
  for (const { card } of existingMatches.slice(1)) {
    await prisma.card.update({
      where: { id: card.id },
      data: {
        mergedWith: primaryCard.id,
        isMerged: true,
        mergeGroupId,
      },
    })
  }

  return { mergedCard: updatedPrimaryCard, wasMerged: true }
}

/**
 * Merge data from two cards, prioritizing non-null values
 */
function mergeCardData(primaryCard: Card, newCardData: Partial<Card>): Partial<Card> {
  return {
    // Keep primary card's basic info
    url: primaryCard.url,
    productId: primaryCard.productId,
    name: primaryCard.name,
    setDisplay: primaryCard.setDisplay || newCardData.setDisplay,
    jpNo: primaryCard.jpNo || newCardData.jpNo,
    rarity: primaryCard.rarity || newCardData.rarity,
    imageUrl: primaryCard.imageUrl || newCardData.imageUrl,
    currency: primaryCard.currency,
    
    // Merge prices (keep existing values, add new ones)
    marketPrice: primaryCard.marketPrice || newCardData.marketPrice,
    ungradedPrice: primaryCard.ungradedPrice || newCardData.ungradedPrice,
    grade7Price: primaryCard.grade7Price || newCardData.grade7Price,
    grade8Price: primaryCard.grade8Price || newCardData.grade8Price,
    grade9Price: primaryCard.grade9Price || newCardData.grade9Price,
    grade95Price: primaryCard.grade95Price || newCardData.grade95Price,
    grade10Price: primaryCard.grade10Price || newCardData.grade10Price,
    
    // Use the most recent check time
    lastCheckedAt: new Date(Math.max(
      primaryCard.lastCheckedAt?.getTime() || 0,
      newCardData.lastCheckedAt?.getTime() || 0
    )),
  }
}

/**
 * Get merged card data for display
 */
export async function getMergedCardData(cardId: string): Promise<MergedCardData | null> {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
  })

  if (!card) return null

  if (!card.isMerged) {
    // Single card, return as-is
    return {
      ...card,
      mergedUrls: [card.url],
      mergedSources: [getSourceFromUrl(card.url)],
    }
  }

  // Get all cards in the merge group
  const mergeGroupCards = await prisma.card.findMany({
    where: {
      OR: [
        { id: cardId },
        { mergedWith: cardId },
        { mergeGroupId: card.mergeGroupId },
      ],
    },
  })

  // Find the primary card (the one that others are merged with)
  const primaryCard = mergeGroupCards.find(c => !c.mergedWith) || card

  // Consolidate data from all cards in the merge group
  let consolidatedData: MergedCardData = {
    ...primaryCard,
    mergedUrls: [],
    mergedSources: [],
  }

  // Merge pricing data from all cards
  for (const groupCard of mergeGroupCards) {
    consolidatedData = {
      ...consolidatedData,
      // Merge pricing data, prioritizing non-null values
      marketPrice: consolidatedData.marketPrice ?? groupCard.marketPrice,
      ungradedPrice: consolidatedData.ungradedPrice ?? groupCard.ungradedPrice,
      grade7Price: consolidatedData.grade7Price ?? groupCard.grade7Price,
      grade8Price: consolidatedData.grade8Price ?? groupCard.grade8Price,
      grade9Price: consolidatedData.grade9Price ?? groupCard.grade9Price,
      grade95Price: consolidatedData.grade95Price ?? groupCard.grade95Price,
      grade10Price: consolidatedData.grade10Price ?? groupCard.grade10Price,
      // Merge other data, prioritizing non-null values
      setDisplay: consolidatedData.setDisplay ?? groupCard.setDisplay,
      jpNo: consolidatedData.jpNo ?? groupCard.jpNo,
      rarity: consolidatedData.rarity ?? groupCard.rarity,
      imageUrl: consolidatedData.imageUrl ?? groupCard.imageUrl,
      mergedUrls: [...consolidatedData.mergedUrls, groupCard.url],
      mergedSources: [...consolidatedData.mergedSources, getSourceFromUrl(groupCard.url)],
    }
  }

  // Ensure unique URLs and sources
  consolidatedData.mergedUrls = Array.from(new Set(consolidatedData.mergedUrls))
  consolidatedData.mergedSources = Array.from(new Set(consolidatedData.mergedSources))

  return consolidatedData
}

/**
 * Unmerge a card from its merge group
 * cardId can be either a Card ID or ProfileCard ID
 */
export async function unmergeCard(cardId: string): Promise<boolean> {
  // First try to find by Card ID
  let card = await prisma.card.findUnique({
    where: { id: cardId },
  })

  // If not found, try to find by ProfileCard ID
  if (!card) {
    const profileCard = await prisma.profileCard.findUnique({
      where: { id: cardId },
      include: { card: true },
    })
    
    if (!profileCard) return false
    card = profileCard.card
  }

  if (!card || !card.isMerged) return false

  // Find all cards in the merge group
  const mergeGroupCards = await prisma.card.findMany({
    where: { mergeGroupId: card.mergeGroupId },
  })

  // Restore each card to its original pricing data based on source
  for (const groupCard of mergeGroupCards) {
    const source = getSourceFromUrl(groupCard.url)
    
    let pricingData: Partial<Card> = {}
    
    if (source === 'TCGplayer') {
      // TCGplayer cards should only have marketPrice, clear PriceCharting data
      pricingData = {
        ungradedPrice: null,
        grade7Price: null,
        grade8Price: null,
        grade9Price: null,
        grade95Price: null,
        grade10Price: null,
      }
    } else if (source === 'PriceCharting') {
      // PriceCharting cards should only have graded prices, clear TCGplayer data
      pricingData = {
        marketPrice: null,
      }
    }

    await prisma.card.update({
      where: { id: groupCard.id },
      data: {
        ...pricingData,
        mergedWith: null,
        isMerged: false,
        mergeGroupId: null,
      },
    })
  }

  return true
}

/**
 * Get source name from URL
 */
function getSourceFromUrl(url: string): string {
  if (url.includes('tcgplayer.com')) return 'TCGplayer'
  if (url.includes('pricecharting.com')) return 'PriceCharting'
  return 'Unknown'
}

