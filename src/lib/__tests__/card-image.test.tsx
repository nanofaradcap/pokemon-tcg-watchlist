import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { JSDOM } from 'jsdom'
import { CardImage } from '../../components/card-image'
import { getPriceChartingSourceUrl, type CardImageData } from '../card-images'
import cards from './fixtures/reported-images.json'

let dom: JSDOM
let root: Root
let container: HTMLDivElement
let client: QueryClient
const globals = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT']
const originalGlobals = globals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key))

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://watchlist.test' })
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true })
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true })
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request') })
})
afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  dom.window.close()
  mock.restoreAll()
  globals.forEach((key, i) => {
    const descriptor = originalGlobals[i]
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  })
})

async function render(card: CardImageData) {
  await act(async () => {
    root.render(<StrictMode><QueryClientProvider client={client}><CardImage card={card} /></QueryClientProvider></StrictMode>)
  })
}
async function failCurrentImage() {
  const img = container.querySelector('img')
  assert.ok(img)
  await act(async () => { img.dispatchEvent(new dom.window.Event('error')) })
}
async function waitForImage(url: string) {
  for (let i = 0; i < 100; i++) {
    if (container.querySelector('img')?.getAttribute('src') === url) return
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
  }
  assert.equal(container.querySelector('img')?.getAttribute('src'), url)
}

describe('reported card image failures', () => {
  for (const card of cards) {
    it(`recovers ${card.name} (${card.url.split('/').at(-1)}) after delayed resolution`, async () => {
      let resolveResponse!: (response: Response) => void
      const fetchImage = mock.method(globalThis, 'fetch', () => new Promise<Response>((resolve) => { resolveResponse = resolve }))
      await render(card)
      assert.equal(fetchImage.mock.callCount(), 0, 'Do not resolve healthy images eagerly')
      await failCurrentImage() // expired full-size image
      await failCurrentImage() // expired thumbnail
      assert.equal(fetchImage.mock.callCount(), 1)
      assert.match(container.textContent ?? '', /Loading image/)
      const request = String(fetchImage.mock.calls[0].arguments[0])
      assert.equal(new URL(request, 'https://watchlist.test').searchParams.get('sourceUrl'), getPriceChartingSourceUrl(card))
      await act(async () => resolveResponse(Response.json({ imageUrl: card.resolvedImageUrl })))
      await waitForImage(card.resolvedImageUrl)
      assert.equal(fetchImage.mock.callCount(), 1)
    })
  }

  it('uses a working TCGplayer fallback without asking for PriceCharting recovery', async () => {
    const card = { ...cards[0], productId: '123' }
    const fetchImage = mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected recovery') })
    await render(card)
    await failCurrentImage()
    await failCurrentImage()
    assert.equal(container.querySelector('img')?.getAttribute('src'), 'https://tcgplayer-cdn.tcgplayer.com/product/123_in_1000x1000.jpg')
    assert.equal(fetchImage.mock.callCount(), 0)
  })

  it('resolves a missing image and retries a temporary upstream error', async () => {
    let attempts = 0
    const card = { ...cards[0], imageUrl: undefined }
    mock.method(globalThis, 'fetch', async () => {
      attempts++
      return attempts === 1 ? new Response('', { status: 503 }) : Response.json({ imageUrl: cards[0].resolvedImageUrl })
    })
    await render(card)
    // React Query retries the failed lookup after its normal one-second backoff.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1100)) })
    await waitForImage(cards[0].resolvedImageUrl)
    assert.equal(attempts, 2)
  })

  it('does not apply a late response to a different card', async () => {
    let resolveResponse!: (response: Response) => void
    mock.method(globalThis, 'fetch', () => new Promise<Response>((resolve) => { resolveResponse = resolve }))
    await render(cards[0])
    await failCurrentImage()
    await failCurrentImage()
    await render(cards[2])
    await act(async () => resolveResponse(Response.json({ imageUrl: cards[0].resolvedImageUrl })))
    assert.equal(container.querySelector('img')?.getAttribute('src'), cards[2].imageUrl)
  })

  it('shows a stable empty state when the resolved image is also unavailable', async () => {
    const card = cards[0]
    const fetchImage = mock.method(globalThis, 'fetch', async () => Response.json({ imageUrl: card.imageUrl }))
    await render(card)
    await failCurrentImage()
    await failCurrentImage()
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
    assert.equal(container.querySelector('img'), null)
    assert.equal(container.textContent, 'No image')
    assert.equal(fetchImage.mock.callCount(), 1, 'Do not loop on a dead image')
  })
})
