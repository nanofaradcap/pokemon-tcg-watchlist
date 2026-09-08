'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { buildImageCandidates, getPriceChartingSourceUrl, type CardImageData } from '../lib/card-images'

export function CardImage({ card, priority = false }: { card: CardImageData; priority?: boolean }) {
  // Reset failed candidates when the card's stored image or sources change.
  const identity = JSON.stringify([card.id, card.imageUrl, card.productId, card.url, card.mergedUrls])
  return <CardImageContent key={identity} card={card} priority={priority} />
}

function CardImageContent({ card, priority }: { card: CardImageData; priority: boolean }) {
  const [failedUrls, setFailedUrls] = useState<string[]>([])
  const storedCandidates = buildImageCandidates(card)
  const storedImage = storedCandidates.find((url) => !failedUrls.includes(url))
  const sourceUrl = getPriceChartingSourceUrl(card)

  // Query state owns the request lifetime: starting recovery must not cancel it.
  // Successful results are shared across cards; errors stay retryable rather than
  // becoming permanent null entries in a module-level promise cache.
  const recovery = useQuery({
    queryKey: ['card-image', sourceUrl],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/images/pricecharting?sourceUrl=${encodeURIComponent(sourceUrl!)}`, { signal })
      if (!response.ok) throw new Error('Image recovery failed')
      const data = await response.json()
      if (typeof data.imageUrl !== 'string' || !/^https:\/\//.test(data.imageUrl)) {
        throw new Error('Image recovery returned no image')
      }
      return data.imageUrl as string
    },
    enabled: !!sourceUrl && !storedImage,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  })

  const recoveredImage = recovery.data && !failedUrls.includes(recovery.data) ? recovery.data : undefined
  const imageSrc = recoveredImage || storedImage
  if (!imageSrc) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground" role="status">
        {recovery.isFetching ? 'Loading image…' : 'No image'}
      </div>
    )
  }

  return (
    // Source images have multiple fallbacks and are served directly to avoid image-proxy costs.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageSrc}
      alt={card.name}
      loading={priority ? 'eager' : 'lazy'}
      referrerPolicy="no-referrer"
      className="w-full h-full object-contain"
      onError={() => setFailedUrls((urls) => urls.includes(imageSrc) ? urls : [...urls, imageSrc])}
    />
  )
}
