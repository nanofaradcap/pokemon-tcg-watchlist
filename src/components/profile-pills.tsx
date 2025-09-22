'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

const profiles = ['Chen', 'Tiff', 'Pho', 'Ying'] as const
type Profile = typeof profiles[number]

export function ProfilePills() {
  const [profile, setProfile] = useState<Profile>('Chen')

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('watchlist:profile') : null
    if (saved && profiles.includes(saved as Profile)) setProfile(saved as Profile)
  }, [])

  const handleSelect = (p: Profile) => {
    setProfile(p)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('watchlist:profile', p)
      window.dispatchEvent(new CustomEvent('watchlist:profile-change', { detail: p }))
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {profiles.map((p) => (
        <Button
          key={p}
          type="button"
          variant={p === profile ? 'default' : 'outline'}
          onClick={() => handleSelect(p as Profile)}
          className={p === profile ? '' : 'bg-background dark:bg-input/30'}
          aria-pressed={p === profile}
        >
          {p}
        </Button>
      ))}
    </div>
  )
}


