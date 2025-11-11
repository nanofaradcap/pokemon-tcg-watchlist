'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { getProfilePreference, setProfile } from '@/lib/profile-storage'

const defaultProfiles = ['Chen', 'Tiff', 'Pho', 'Ying'] as const

interface ProfilePillsProps {
  profiles?: readonly string[]
}

export function ProfilePills({ profiles = defaultProfiles }: ProfilePillsProps) {
  const [profile, setProfile] = useState<string>(profiles[0])
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
    if (typeof window !== 'undefined') {
      const savedProfile = getProfilePreference(profiles)
      setProfile(savedProfile)
    }
  }, [profiles])

  const handleSelect = (p: string) => {
    setProfile(p)
    if (typeof window !== 'undefined') {
      setProfile(p) // Sync both localStorage and cookies
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
            className="h-9 px-3 py-2 animate-pulse rounded-md bg-muted border"
            style={{ width: `${p.length * 8 + 24}px` }} // Approximate width based on text length
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
