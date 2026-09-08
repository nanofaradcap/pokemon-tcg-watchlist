import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cardUrlSchema, parseCardUrl } from '../card-url'
import { scrapeWithPuppeteer } from '../puppeteer-scraping'
import { scrapePriceCharting } from '../pricecharting-scraping'

const invalidUrls = [
  'https://evil.example/tcgplayer.com/product/123/card',
  'https://tcgplayer.com.evil.example/product/123/card',
  'https://www.tcgplayer.com@127.0.0.1/product/123/card',
  'https://127.0.0.1/?url=https://www.tcgplayer.com/product/123/card',
  'http://www.tcgplayer.com/product/123/card',
  'https://www.tcgplayer.com:8443/product/123/card',
  'https://user:password@www.tcgplayer.com/product/123/card',
  'https://www.tcgplayer.com/other/product/123/card',
  'https://www.tcgplayer.com/product/123abc/card',
  'https://www.pricecharting.com/game/',
  'https://www.pricecharting.com/game/pokemon',
  'file:///etc/passwd',
]

describe('card URLs', () => {
  for (const url of invalidUrls) {
    it(`rejects ${url}`, () => {
      assert.throws(() => parseCardUrl(url))
      assert.equal(cardUrlSchema.safeParse(url).success, false)
    })
  }

  for (const suffix of ['', '/', '/pikachu-123', '?Language=English', '#prices']) {
    it(`accepts TCGplayer product IDs with suffix ${suffix}`, () => {
      assert.equal(parseCardUrl(`https://www.tcgplayer.com/product/123${suffix}`).productId, '123')
    })
  }

  it('normalizes tracking parameters, fragments, whitespace and trailing slashes', () => {
    assert.deepEqual(parseCardUrl(' https://www.pricecharting.com/game/pokemon-base-set/pikachu-58/?utm_source=test#prices '), {
      url: 'https://www.pricecharting.com/game/pokemon-base-set/pikachu-58',
      sourceType: 'pricecharting',
      productId: '',
    })
    assert.equal(cardUrlSchema.safeParse(`https://tcgplayer.com/product/123/${'a'.repeat(2048)}`).success, false)
  })

  it('rejects invalid persisted sources before launching a scraper', async () => {
    await assert.rejects(scrapeWithPuppeteer(invalidUrls[0], '123'))
    await assert.rejects(scrapePriceCharting(invalidUrls[0]))
    await assert.rejects(scrapePriceCharting('https://tcgplayer.com/product/123'))
  })
})
