import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { CardService, type CardWithSources } from '../card-service'
import { prisma } from '../prisma'
import * as database from '../prisma'
import * as tcgScraper from '../puppeteer-scraping'
import * as pcScraper from '../pricecharting-scraping'
import * as cache from '../redis'

const now = new Date('2026-01-01T00:00:00Z')
function makeCard(): CardWithSources {
  return {
    id: 'card-1', name: 'Pikachu', No: '58', setDisplay: 'Base Set', rarity: null,
    imageUrl: null, createdAt: now, updatedAt: now,
    sources: [{
      id: 'source-1', cardId: 'card-1', sourceType: 'tcgplayer',
      url: 'https://www.tcgplayer.com/product/123/pikachu-58', productId: '123',
      currency: 'USD', lastCheckedAt: now, createdAt: now, updatedAt: now,
      prices: [{ id: 'price-1', sourceId: 'source-1', priceType: 'market', price: new Prisma.Decimal(10), createdAt: now, updatedAt: now }],
    }],
  }
}

// All database operations default to throwing. Tests explicitly allow only the calls
// they exercise; there is no database cleanup or external scraper access.
const realPrisma = prisma
beforeEach(() => {
  const fakePrisma = Object.fromEntries(
    ['profile', 'card', 'cardSource', 'cardPrice', 'userCard'].map((model) => [model,
      Object.fromEntries(['findUnique', 'findMany', 'findFirst', 'create', 'update', 'upsert', 'delete', 'deleteMany']
        .map((method) => [method, async () => { throw new Error(`Unexpected database operation: ${model}.${method}`) }])),
    ]),
  )
  Object.assign(fakePrisma, { $transaction: async () => { throw new Error('Unexpected transaction') } })
  Object.defineProperty(database, 'prisma', { value: fakePrisma, configurable: true })
  mock.method(tcgScraper, 'scrapeWithPuppeteer', async () => { throw new Error('Unexpected TCGplayer scrape') })
  mock.method(pcScraper, 'scrapePriceCharting', async () => { throw new Error('Unexpected PriceCharting scrape') })
  mock.method(console, 'log', () => {})
  mock.method(console, 'warn', () => {})
  mock.method(console, 'error', () => {})
})
afterEach(() => {
  mock.restoreAll()
  Object.defineProperty(database, 'prisma', { value: realPrisma, configurable: true })
})

function mockTransaction() {
  return mock.method(prisma, '$transaction', (async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma)) as never)
}

describe('CardService', () => {
  it('rejects unsupported URLs before scraping or starting a transaction', async () => {
    await assert.rejects(new CardService().addCard('https://evil.example/tcgplayer.com/product/123/pikachu-58', 'Chen'))
  })

  it('reads an unknown profile as an empty watchlist without creating it', async () => {
    mock.method(prisma.profile, 'findUnique', async () => null)
    assert.deepEqual(await new CardService().getCardsForProfile('Chen'), [])
  })

  it('returns stored prices when reading a watchlist without Redis', async () => {
    const card = makeCard()
    mock.method(prisma.profile, 'findUnique', async () => ({ id: 'profile-1' }) as never)
    mock.method(prisma.userCard, 'findMany', async () => [{ card }] as never)
    mock.method(prisma.cardSource, 'findMany', async () => card.sources as never)
    const result = await new CardService().getCardsForProfile('Chen')
    assert.equal(result[0].marketPrice, 10)
    assert.equal(result[0].productId, '123')
  })

  it('keeps valid prices when a refresh returns zero, negative or non-finite values', async () => {
    const card = makeCard()
    mock.method(prisma.card, 'findUnique', async () => card as never)
    mock.method(prisma.profile, 'findMany', async () => [])
    mock.method(prisma.cardSource, 'update', async () => card.sources[0] as never)
    mockTransaction()
    mock.method(tcgScraper, 'scrapeWithPuppeteer', async () => ({
      url: card.sources[0].url, productId: '123', name: 'Pikachu', marketPrice: 0,
      ungradedPrice: NaN, grade7Price: -1, grade8Price: Infinity, grade9Price: 20,
    }))
    const writes: unknown[] = []
    mock.method(prisma.cardPrice, 'upsert', async (args: Prisma.CardPriceUpsertArgs) => { writes.push(args); return {} as never })
    const result = await new CardService().refreshCard(card.id)
    assert.equal(result.marketPrice, 10)
    assert.equal(writes.length, 1)
    assert.deepEqual(writes[0], {
      where: { sourceId_priceType: { sourceId: 'source-1', priceType: 'grade9' } },
      update: { price: 20 }, create: { sourceId: 'source-1', priceType: 'grade9', price: 20 },
    })
  })

  it('preserves prices on scraper failure and invalidates every owner after commit', async () => {
    const card = makeCard()
    mock.method(prisma.card, 'findUnique', async () => card as never)
    mock.method(prisma.cardSource, 'update', async () => card.sources[0] as never)
    let committed = false
    mock.method(prisma, '$transaction', (async (callback: (tx: typeof prisma) => Promise<unknown>) => {
      const value = await callback(prisma)
      committed = true
      return value
    }) as never)
    mock.method(prisma.profile, 'findMany', async () => {
      assert.equal(committed, true)
      return [{ name: 'Chen' }, { name: 'Tiff' }] as never
    })
    const invalidated: string[] = []
    mock.method(cache, 'withRedis', async (operation: Parameters<typeof cache.withRedis>[0]) => operation({
      del: async (key: string) => { assert.equal(committed, true); invalidated.push(key) },
    } as never))
    assert.equal((await new CardService().refreshCard(card.id)).marketPrice, 10)
    assert.deepEqual(invalidated.sort(), ['cards:Chen', 'cards:Tiff'])
  })

  it('retains the product ID and image URL when adding through the scraper fallback', async () => {
    const card = makeCard()
    mockTransaction()
    mock.method(prisma.profile, 'findUnique', async () => ({ id: 'profile-1' }) as never)
    mock.method(prisma.card, 'findMany', async () => [])
    mock.method(prisma.card, 'create', async () => card as never)
    mock.method(prisma.card, 'findUnique', async () => card as never)
    mock.method(prisma.userCard, 'create', async () => ({}) as never)
    const sourceWrites: unknown[] = []
    mock.method(prisma.cardSource, 'create', async (args: Prisma.CardSourceCreateArgs) => {
      sourceWrites.push(args.data)
      return card.sources[0] as never
    })
    await new CardService().addCard(`${card.sources[0].url}?tracking=test`, 'Chen')
    assert.equal(sourceWrites.length, 1)
    assert.equal((sourceWrites[0] as { productId: string }).productId, '123')
    assert.equal((sourceWrites[0] as { url: string }).url, card.sources[0].url)
    const fallback = await import('../scraping-fallback')
    assert.equal((await fallback.scrapeWithFallback(card.sources[0].url, '123')).imageUrl,
      'https://tcgplayer-cdn.tcgplayer.com/product/123_in_1000x1000.jpg')
  })
})
