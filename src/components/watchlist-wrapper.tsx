'use client'

import { HydrationBoundary, DehydratedState } from '@tanstack/react-query'
import { Watchlist } from './watchlist'

interface WatchlistWrapperProps {
  dehydratedState?: DehydratedState | null
}

export function WatchlistWrapper({ dehydratedState }: WatchlistWrapperProps) {
  if (dehydratedState) {
    return (
      <HydrationBoundary state={dehydratedState}>
        <Watchlist />
      </HydrationBoundary>
    )
  }
  return <Watchlist />
}

