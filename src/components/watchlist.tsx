'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { RefreshCw, Plus, Download, MoreHorizontal, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { WatchlistSkeleton } from '@/components/skeleton-loading'

interface CardRow {
  id: string
  url: string
  productId: string
  name: string
  setDisplay?: string
  No?: string
  rarity?: string
  imageUrl?: string
  marketPrice?: number
  currency: string
  // PriceCharting prices
  ungradedPrice?: number
  grade7Price?: number
  grade8Price?: number
  grade9Price?: number
  grade95Price?: number
  grade10Price?: number
  lastCheckedAt?: string
  createdAt: string
  updatedAt: string
  // Merged card fields
  isMerged?: boolean
  mergedUrls?: string[]
  mergedSources?: string[]
}

const defaultProfiles = ['Chen', 'Tiff', 'Pho', 'Ying'] as const

interface WatchlistProps {
  profiles?: readonly string[]
}

function WatchlistContent({ profiles = defaultProfiles }: { profiles?: readonly string[] }) {
  const [url, setUrl] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [sortKey, setSortKey] = useState<'name' | 'marketPrice'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  // Initialize profile from localStorage immediately to avoid mismatch
  const [profile, setProfile] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const savedProfile = window.localStorage.getItem('watchlist:profile')
      if (savedProfile && profiles.includes(savedProfile)) {
        return savedProfile
      }
    }
    return profiles[0]
  })
  const queryClient = useQueryClient()

  // Handle profile changes from ProfilePills component
  useEffect(() => {
    const onProfileChange = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail && profiles.includes(detail)) {
        setProfile(detail)
        // Invalidate and immediately refetch for the new profile
        queryClient.invalidateQueries({ queryKey: ['cards'] })
        queryClient.refetchQueries({ queryKey: ['cards', detail] })
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('watchlist:profile-change', onProfileChange as EventListener)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('watchlist:profile-change', onProfileChange as EventListener)
      }
    }
  }, [profiles, queryClient])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('watchlist:profile', profile)
    }
  }, [profile])

  // Fetch cards - now supports SSR with initial data hydration
  const { data: cards = [], isLoading, error, isError } = useQuery<CardRow[]>({
    queryKey: ['cards', profile],
    queryFn: async () => {
      const response = await fetch(`/api/cards?profile=${encodeURIComponent(profile)}`, {
        cache: 'no-store', // Disable Next.js fetch cache
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to fetch cards')
      }
      return response.json()
    },
    retry: 1,
    // Ensure we refetch when profile changes
    enabled: !!profile,
    // refetchOnMount respects staleTime - if data is fresh (< 30s), it won't refetch
    // This prevents the flash of old content when we have fresh dehydrated state
    // Data will still refetch in the background if stale, but won't show loading state
    refetchOnMount: true,
  })

  // Add card mutation
  const addCardMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, profile }),
      })
      if (!response.ok) {
        const error = await response.json()
        // Include details if available (especially in development)
        const errorMessage = error.details 
          ? `${error.error}: ${error.details}` 
          : error.error || 'Failed to add card'
        throw new Error(errorMessage)
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards', profile] })
      setUrl('')
      toast.success('Card added successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Refresh single card mutation
  const refreshCardMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch('/api/cards/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardIds: [id], profile }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to refresh card')
      }
      return response.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cards', profile] })
      if (data.summary.failed > 0) {
        toast.warning(`Refreshed with ${data.summary.failed} failures`)
      } else {
        toast.success('Card refreshed successfully')
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Refresh all cards mutation
  const refreshAllMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/cards/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to refresh cards')
      }
      return response.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cards', profile] })
      toast.success(`Refreshed ${data.summary.successful} cards successfully`)
      if (data.summary.failed > 0) {
        toast.warning(`${data.summary.failed} cards failed to refresh`)
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Delete card mutation
  const deleteCardMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/cards?id=${id}&profile=${profile}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete card')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards', profile] })
      toast.success('Card deleted successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })


  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    setIsAdding(true)
    try {
      await addCardMutation.mutateAsync(url)
    } finally {
      setIsAdding(false)
    }
  }

  const handleRefreshCard = (id: string) => {
    refreshCardMutation.mutate(id)
  }

  const handleRefreshAll = () => {
    if (cards.length === 0) return
    refreshAllMutation.mutate()
  }

  const handleDeleteCard = (id: string) => {
    if (confirm('Are you sure you want to delete this card?')) {
      deleteCardMutation.mutate(id)
    }
  }

  const handleExportCSV = () => {
    window.open('/api/export', '_blank')
  }


  const formatPrice = (price?: number) => {
    if (price === null || price === undefined) return '—'
    return `$${price.toFixed(2)}`
  }

  const getImageUrl = (card: CardRow) => {
    return card.imageUrl || `https://tcgplayer-cdn.tcgplayer.com/product/${card.productId}_in_1000x1000.jpg`
  }

  // Price display component for prominent pricing
  const PriceDisplay = ({ card, tcgUrl, priceChartingUrl }: { card: CardRow; tcgUrl?: string; priceChartingUrl?: string }) => {
    const PriceLink = ({ label, price, url }: { label: string; price?: number; url?: string }) => {
      const priceText = formatPrice(price)
      if (url && price !== null && price !== undefined) {
        return (
          <div className="flex-1">
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xl md:text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 hover:underline block"
            >
              {priceText}
            </a>
          </div>
        )
      }
      return (
        <div className="flex-1">
          <div className="text-xs text-muted-foreground mb-1">{label}</div>
          <div className="text-xl md:text-2xl font-bold font-mono">
            {priceText}
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-3 md:gap-4">
          <PriceLink label="TCG Price" price={card.marketPrice} url={tcgUrl} />
          <PriceLink label="Ungraded" price={card.ungradedPrice} url={priceChartingUrl} />
        </div>
        <div className="hidden lg:flex gap-2">
          <div className="flex-1 text-center px-2 py-1 bg-muted rounded">
            <div className="text-xs text-muted-foreground">Grade 9</div>
            <div className="text-sm font-mono font-semibold">
              {formatPrice(card.grade9Price)}
            </div>
          </div>
          <div className="flex-1 text-center px-2 py-1 bg-muted rounded">
            <div className="text-xs text-muted-foreground">Grade 10</div>
            <div className="text-sm font-mono font-semibold">
              {formatPrice(card.grade10Price)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Card component for unified grid layout (mobile + desktop)
  const CardItem = ({ card, priority = false }: { card: CardRow; priority?: boolean }) => {
    // Determine URLs for TCG and PriceCharting
    let tcgUrl: string | undefined
    let priceChartingUrl: string | undefined

    if (card.isMerged && card.mergedUrls && card.mergedUrls.length > 1) {
      // For merged cards, find the appropriate URLs
      card.mergedUrls.forEach((url) => {
        if (url && typeof url === 'string') {
          if (url.includes('tcgplayer.com')) {
            tcgUrl = url
          } else if (url.includes('pricecharting.com')) {
            priceChartingUrl = url
          }
        }
      })
    } else {
      // For single source cards, determine which URL it is
      if (card.url && typeof card.url === 'string') {
        if (card.url.includes('tcgplayer.com')) {
          tcgUrl = card.url
        } else if (card.url.includes('pricecharting.com')) {
          priceChartingUrl = card.url
        }
      }
    }

    return (
      <div className="border rounded-lg p-3 md:p-4 space-y-3 bg-card flex flex-col h-full">
        {/* Name Row - Compact */}
        <div className="font-medium min-h-[2.5rem] flex flex-col gap-1">
          <span className="text-blue-600 dark:text-blue-400 break-words text-sm md:text-base">{card.name}</span>
          {(card.setDisplay || card.No) && (
            <div 
              className="text-xs text-muted-foreground flex items-center gap-2 truncate w-full"
              title={`${card.setDisplay || ''}${card.setDisplay && card.No ? ' • ' : ''}${card.No ? `#${card.No}` : ''}`}
            >
              {card.setDisplay && <span className="truncate">{card.setDisplay}</span>}
              {card.setDisplay && card.No && <span className="shrink-0">•</span>}
              {card.No && <span className="shrink-0">#{card.No}</span>}
            </div>
          )}
        </div>

        {/* Large Image - Responsive sizing */}
        <div className="w-full aspect-square relative rounded-md overflow-hidden bg-muted">
          <Image
            src={getImageUrl(card)}
            alt={card.name}
            fill
            priority={priority}
            className="object-contain"
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 280px"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
            }}
          />
        </div>

        {/* Prominent Pricing Section */}
        <PriceDisplay card={card} tcgUrl={tcgUrl} priceChartingUrl={priceChartingUrl} />

        {/* Actions Footer - Compact */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t mt-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleRefreshCard(card.id)}
            disabled={refreshCardMutation.isPending}
            className="h-8 w-8 md:h-9 md:w-auto md:px-3 p-0"
            title="Refresh card"
          >
            <RefreshCw className={`h-4 w-4 ${refreshCardMutation.isPending ? 'animate-spin' : ''} md:mr-2`} />
            <span className="hidden md:inline">Refresh</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 md:h-9 md:w-auto md:px-3 p-0" title="More actions">
                <MoreHorizontal className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">More</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => handleDeleteCard(card.id)}
                disabled={deleteCardMutation.isPending}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    )
  }

  // Helper function to get the effective price for sorting
  // If both exist, use ungraded PriceCharting price, else use TCG price, if only one exists use that
  const getEffectivePrice = (card: CardRow): number | null => {
    const hasUngraded = card.ungradedPrice !== null && card.ungradedPrice !== undefined
    const hasMarket = card.marketPrice !== null && card.marketPrice !== undefined
    
    if (hasUngraded && hasMarket) {
      // If both exist, use ungraded PriceCharting price
      return card.ungradedPrice!
    } else if (hasUngraded) {
      // If only ungraded exists, use that
      return card.ungradedPrice!
    } else if (hasMarket) {
      // If only market price exists, use that
      return card.marketPrice!
    }
    // Neither exists
    return null
  }

  const sortedCards = (() => {
    const copy = [...cards]
    copy.sort((a, b) => {
      const direction = sortDir === 'asc' ? 1 : -1
      const nullsLast = (v: unknown) => (v === null || v === undefined || v === '')
      switch (sortKey) {
        case 'name': {
          const av = a.name || ''
          const bv = b.name || ''
          return av.localeCompare(bv) * direction
        }
        case 'marketPrice': {
          const av = getEffectivePrice(a)
          const bv = getEffectivePrice(b)
          if (nullsLast(av) && nullsLast(bv)) return 0
          if (nullsLast(av)) return 1
          if (nullsLast(bv)) return -1
          return (((av as number) - (bv as number)) || 0) * direction
        }
        default:
          return 0
      }
    })
    return copy
  })()

  const toggleSort = (key: 'name' | 'marketPrice') => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  if (isLoading) {
    return <WatchlistSkeleton />
  }

  if (isError) {
    return (
      <div className="text-center py-8 border rounded-lg">
        <p className="text-destructive font-medium">Failed to load cards</p>
        <p className="text-sm text-muted-foreground mt-1">
          {error instanceof Error ? error.message : 'Unknown error occurred'}
        </p>
        <Button
          variant="outline"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['cards', profile] })}
          className="mt-4"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Add Card Form */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {/* Profile pills moved to page header */}

        <form onSubmit={handleAddCard} className="flex-1 flex gap-2">
          <Input
            type="url"
            placeholder="Paste TCGplayer or PriceCharting URL here..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1"
            disabled={isAdding}
          />
          <Button type="submit" disabled={isAdding || !url.trim()}>
            {isAdding ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add Card
          </Button>
        </form>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRefreshAll}
            disabled={refreshAllMutation.isPending || cards.length === 0}
          >
            <RefreshCw className={`h-4 w-4 ${refreshAllMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh All
          </Button>
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={cards.length === 0}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">Sort by:</span>
        <button
          type="button"
          className="flex items-center gap-1 px-3 py-1.5 rounded-md hover:bg-accent transition-colors"
          onClick={() => toggleSort('name')}
        >
          Name
          {sortKey === 'name' ? (
            <span aria-hidden className="text-xs">{sortDir === 'asc' ? '▲' : '▼'}</span>
          ) : null}
        </button>
        <button
          type="button"
          className="flex items-center gap-1 px-3 py-1.5 rounded-md hover:bg-accent transition-colors"
          onClick={() => toggleSort('marketPrice')}
        >
          Price
          {sortKey === 'marketPrice' ? (
            <span aria-hidden className="text-xs">{sortDir === 'asc' ? '▲' : '▼'}</span>
          ) : null}
        </button>
      </div>

      {/* Unified Responsive Grid Layout */}
      {isLoading ? (
        <div className="text-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto" />
          <p className="mt-2 text-muted-foreground">Loading cards...</p>
        </div>
      ) : cards.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-muted-foreground">No cards in your watchlist yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Add a TCGplayer or PriceCharting URL above to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 md:gap-6">
          {sortedCards.map((card, index) => (
            <CardItem key={card.id} card={card} priority={index < 6} />
          ))}
        </div>
      )}
    </div>
  )
}

export function Watchlist({ profiles = defaultProfiles }: WatchlistProps) {
  // HydrationBoundary is already handled in Providers component
  // Just render the content directly
  return <WatchlistContent profiles={profiles} />
}
