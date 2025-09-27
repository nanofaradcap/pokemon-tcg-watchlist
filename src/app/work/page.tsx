'use client'

import { Watchlist } from '@/components/watchlist'
import { ProfilePills } from '@/components/profile-pills'

export default function WorkPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pokémon TCG Watchlist - Work</h1>
            <p className="text-muted-foreground mt-2">
              Track Pokémon TCG card prices from TCGplayer and PriceCharting with automatic card merging
            </p>
          </div>
          <ProfilePills profiles={['Tiff', 'Son', 'Candice', 'Claude', 'Rachel', 'Roxanne']} />
        </div>
        <Watchlist profiles={['Tiff', 'Son', 'Candice', 'Claude', 'Rachel', 'Roxanne']} />
      </div>
    </div>
  )
}
