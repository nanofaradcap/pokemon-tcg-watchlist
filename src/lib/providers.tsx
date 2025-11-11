'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

interface ProvidersProps {
  children: React.ReactNode
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Set staleTime to 30 seconds - data is considered fresh for 30s
        // This prevents immediate refetch on mount when we have hydrated data
        staleTime: 1000 * 30, // 30 seconds
        gcTime: 1000 * 60 * 10, // 10 minutes (garbage collection time)
        retry: 1,
        refetchOnWindowFocus: true, // Refetch when window regains focus
        // Only refetch on mount if data is stale (older than staleTime)
        // This prevents the flash of old content when we have fresh dehydrated state
        refetchOnMount: true,
        refetchOnReconnect: true, // Refetch when reconnecting
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
