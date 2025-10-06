'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

const defaultProfiles = ['Chen', 'Tiff', 'Pho', 'Ying'] as const

interface ProfilePillsProps {
  profiles?: readonly string[]
}

export function ProfilePills({ profiles = defaultProfiles }: ProfilePillsProps) {
  const [profile, setProfile] = useState<string>(profiles[0])
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('watchlist:profile') : null
    if (saved && profiles.includes(saved)) setProfile(saved)
    else setProfile(profiles[0]) // Default to first profile if saved one doesn't exist
  }, [profiles])

  const handleSelect = (p: string) => {
    setProfile(p)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('watchlist:profile', p)
      window.dispatchEvent(new CustomEvent('watchlist:profile-change', { detail: p }))
    }
  }

  // Show skeleton loading until client-side initialization
  if (!isClient) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {profiles.map((p) => (
          <div
            key={p}
            className="h-9 w-16 animate-pulse rounded-md bg-muted"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {profiles.map((p) => (
        <Button
          key={p}
          type="button"
          variant={p === profile ? 'default' : 'outline'}
          onClick={() => handleSelect(p)}
          className={p === profile ? '' : 'bg-background dark:bg-input/30'}
          aria-pressed={p === profile}
        >
          {p}
        </Button>
      ))}
    </div>
  )
}
