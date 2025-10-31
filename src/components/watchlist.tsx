'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient, HydrationBoundary, DehydratedState } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { RefreshCw, Plus, Download, MoreHorizontal, ExternalLink, Trash2 } from 'lucide-react'
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
  dehydratedState?: DehydratedState
}

function WatchlistContent({ profiles = defaultProfiles }: { profiles?: readonly string[] }) {
  const [url, setUrl] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [viewMode, setViewMode] = useState<'compact' | 'expanded'>('compact')
  const [sortKey, setSortKey] = useState<'name' | 'marketPrice'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [profile, setProfile] = useState<string>(profiles[0])
  const queryClient = useQueryClient()

  // Initialize client-side state and load from localStorage
  useEffect(() => {
    // Load view mode
    const savedViewMode = window.localStorage.getItem('watchlist:viewMode')
    if (savedViewMode === 'compact' || savedViewMode === 'expanded') {
      setViewMode(savedViewMode)
    }
    
    // Load profile
    const savedProfile = window.localStorage.getItem('watchlist:profile')
    if (savedProfile && profiles.includes(savedProfile)) {
      setProfile(savedProfile)
    }

    const onProfileChange = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail && profiles.includes(detail)) {
        setProfile(detail)
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
  }, [profiles])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('watchlist:viewMode', viewMode)
    }
  }, [viewMode])
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('watchlist:profile', profile)
    }
  }, [profile])

  // Fetch cards - now supports SSR with initial data hydration
  const { data: cards = [], isLoading, error, isError } = useQuery<CardRow[]>({
    queryKey: ['cards', profile],
    queryFn: async () => {
      const response = await fetch(`/api/cards?profile=${encodeURIComponent(profile)}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to fetch cards')
      }
      return response.json()
    },
    retry: 1,
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
        throw new Error(error.error || 'Failed to add card')
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
  const PriceDisplay = ({ card }: { card: CardRow }) => {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-4">
          <div className="flex-1">
            <div className="text-xs text-muted-foreground mb-1">TCG Price</div>
            <div className="text-2xl font-bold font-mono">
              {formatPrice(card.marketPrice)}
            </div>
          </div>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground mb-1">Ungraded</div>
            <div className="text-2xl font-bold font-mono">
              {formatPrice(card.ungradedPrice)}
            </div>
          </div>
        </div>
        <div className="hidden md:flex gap-2">
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

  // Card component for mobile layout
  const CardItem = ({ card, priority = false }: { card: CardRow; priority?: boolean }) => {
    return (
      <div className="border rounded-lg p-4 space-y-3 bg-card">
        {/* Name and Link Row - Title at top */}
        <div className="space-y-2">
          <div className="font-medium">
            <div className="flex items-start gap-2 flex-wrap">
              <span className="text-blue-600 dark:text-blue-400 break-words">{card.name}</span>
              <div className="flex items-center gap-1 flex-wrap">
                {card.isMerged && card.mergedUrls && card.mergedUrls.length > 1 ? (
                  card.mergedUrls.map((url, index) => {
                    const source = url && typeof url === 'string' && url.includes('tcgplayer.com') ? 'TCGplayer' : 'PriceCharting'
                    return (
                      <a
                        key={index}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {source}
                      </a>
                    )
                  })
                ) : (
                  <a
                    href={card.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {card.url && typeof card.url === 'string' && card.url.includes('tcgplayer.com') ? 'TCGplayer' : 'PriceCharting'}
                  </a>
                )}
              </div>
            </div>
          </div>
          {card.isMerged && card.mergedSources && (
            <div className="text-xs text-blue-600 dark:text-blue-400">
              Merged: {card.mergedSources.join(' + ')}
            </div>
          )}
        </div>

        {/* Full Width Image */}
        <div className="w-full aspect-square relative rounded-md overflow-hidden bg-muted">
          <Image
            src={getImageUrl(card)}
            alt={card.name}
            fill
            priority={priority}
            className="object-contain"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
            }}
          />
        </div>

        {/* Prominent Pricing Section */}
        <PriceDisplay card={card} />

        {/* Metadata */}
        {(card.setDisplay || card.No || card.rarity || card.lastCheckedAt) && (
          <div className="text-sm text-muted-foreground space-y-1">
            {card.setDisplay && <div>Set: {card.setDisplay}</div>}
            {card.No && <div>No: {card.No}</div>}
            {card.rarity && <div>Rarity: {card.rarity}</div>}
            {card.lastCheckedAt && (
              <div>Last checked: {new Date(card.lastCheckedAt).toLocaleString()}</div>
            )}
          </div>
        )}

        {/* Actions Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleRefreshCard(card.id)}
            disabled={refreshCardMutation.isPending}
            className="h-9"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshCardMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9">
                <MoreHorizontal className="h-4 w-4 mr-2" />
                More
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
          const av = a.marketPrice
          const bv = b.marketPrice
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
          <Button
            variant="outline"
            onClick={() => setViewMode(viewMode === 'compact' ? 'expanded' : 'compact')}
            aria-pressed={viewMode === 'expanded'}
            title={viewMode === 'expanded' ? 'Switch to compact' : 'Switch to expanded'}
            className="hidden md:inline-flex"
          >
            {viewMode === 'expanded' ? 'Compact' : 'Expanded'}
          </Button>
        </div>
      </div>

      {/* Mobile Card Layout */}
      <div className="md:hidden space-y-4">
        {isLoading ? (
          <div className="text-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto" />
            <p className="mt-2 text-muted-foreground">Loading cards...</p>
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-8 border rounded-lg">
            <p className="text-muted-foreground">No cards in your watchlist yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add a TCGplayer or PriceCharting URL above to get started.
            </p>
          </div>
        ) : (
          sortedCards.map((card, index) => (
            <CardItem key={card.id} card={card} priority={index < 3} />
          ))
        )}
      </div>

      {/* Desktop Table Layout */}
      <div className="hidden md:block rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Image</TableHead>
              <TableHead>
                <button
                  type="button"
                  className="flex items-center gap-1 p-2 -m-2 rounded hover:bg-accent transition-colors"
                  onClick={() => toggleSort('name')}
                >
                  Card
                  {sortKey === 'name' ? (
                    <span aria-hidden>{sortDir === 'asc' ? '▲' : '▼'}</span>
                  ) : null}
                </button>
              </TableHead>
              <TableHead className="min-w-[180px]">
                <button
                  type="button"
                  className="flex items-center gap-1 p-2 -m-2 rounded hover:bg-accent transition-colors"
                  onClick={() => toggleSort('marketPrice')}
                >
                  Pricing
                  {sortKey === 'marketPrice' ? (
                    <span aria-hidden>{sortDir === 'asc' ? '▲' : '▼'}</span>
                  ) : null}
                </button>
              </TableHead>
              <TableHead className="w-24 text-center">Grade 9</TableHead>
              <TableHead className="w-24 text-center">Grade 10</TableHead>
              <TableHead className="w-16">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto" />
                  <p className="mt-2 text-muted-foreground">Loading cards...</p>
                </TableCell>
              </TableRow>
            ) : cards.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <p className="text-muted-foreground">No cards in your watchlist yet.</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add a TCGplayer or PriceCharting URL above to get started.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              sortedCards.map((card, index) => (
                <TableRow key={card.id}>
                  <TableCell>
                    <div
                      className={
                        viewMode === 'expanded'
                          ? 'w-80 h-80 relative rounded-md overflow-hidden bg-muted'
                          : 'w-16 h-16 relative rounded-md overflow-hidden bg-muted'
                      }
                    >
                      <Image
                        src={getImageUrl(card)}
                        alt={card.name}
                        fill
                        priority={index < 5}
                        className={viewMode === 'expanded' ? 'object-contain' : 'object-cover'}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.style.display = 'none'
                        }}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-600 dark:text-blue-400">{card.name}</span>
                        <div className="flex items-center gap-1">
                          {card.isMerged && card.mergedUrls && card.mergedUrls.length > 1 ? (
                            card.mergedUrls.map((url, index) => {
                              const source = url && typeof url === 'string' && url.includes('tcgplayer.com') ? 'TCGplayer' : 'PriceCharting'
                              return (
                                <a
                                  key={index}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  {source}
                                </a>
                              )
                            })
                          ) : (
                            <a
                              href={card.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {card.url && typeof card.url === 'string' && card.url.includes('tcgplayer.com') ? 'TCGplayer' : 'PriceCharting'}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    {card.isMerged && card.mergedSources && (
                      <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        Merged: {card.mergedSources.join(' + ')}
                      </div>
                    )}
                    <div className="text-sm text-muted-foreground">
                      {card.lastCheckedAt && (
                        <span>
                          Last checked: {new Date(card.lastCheckedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div>
                        <div className="text-xs text-muted-foreground">TCG</div>
                        <div className="font-mono font-semibold text-base">
                          {formatPrice(card.marketPrice)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Ungraded</div>
                        <div className="font-mono font-semibold text-base">
                          {formatPrice(card.ungradedPrice)}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-center">
                    {formatPrice(card.grade9Price)}
                  </TableCell>
                  <TableCell className="font-mono text-center">
                    {formatPrice(card.grade10Price)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRefreshCard(card.id)}
                        disabled={refreshCardMutation.isPending}
                        className="h-8 w-8 p-0"
                        title="Refresh card"
                      >
                        <RefreshCw className={`h-4 w-4 ${refreshCardMutation.isPending ? 'animate-spin' : ''}`} />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="More actions">
                            <MoreHorizontal className="h-4 w-4" />
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
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function Watchlist({ profiles = defaultProfiles, dehydratedState }: WatchlistProps) {
  if (dehydratedState) {
    return (
      <HydrationBoundary state={dehydratedState}>
        <WatchlistContent profiles={profiles} />
      </HydrationBoundary>
    )
  }
  return <WatchlistContent profiles={profiles} />
}
