const { scrapePriceCharting } = require('./src/lib/pricecharting-scraping.ts')

async function test() {
  try {
    console.log('Testing PriceCharting scraping...')
    const result = await scrapePriceCharting('https://www.pricecharting.com/game/pokemon-paldean-fates/mew-ex-232')
    console.log('Result:', JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('Error:', error)
  }
}

test()
