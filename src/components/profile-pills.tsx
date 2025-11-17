'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { getProfilePreference, setProfile as saveProfile } from '@/lib/profile-storage'

const defaultProfiles = ['Chen', 'Tiff', 'Pho', 'Ying'] as const

interface ProfilePillsProps {
  profiles?: readonly string[]
}

export function ProfilePills({ profiles = defaultProfiles }: ProfilePillsProps) {
  const [profile, setProfile] = useState<string>(() => {
    // Initialize from storage on client-side only
    if (typeof window !== 'undefined') {
      return getProfilePreference(profiles)
    }
    return profiles[0]
  })

  const handleSelect = (p: string) => {
    setProfile(p)
    saveProfile(p) // Sync both localStorage and cookies
    window.dispatchEvent(new CustomEvent('watchlist:profile-change', { detail: p }))
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
