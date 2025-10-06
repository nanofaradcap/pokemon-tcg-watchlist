'use client'

import { Skeleton } from '@/components/ui/skeleton'

export function CardSkeleton() {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-8 w-16" />
      </div>
      
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-20" />
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-6 w-12" />
        </div>
        <Skeleton className="h-8 w-8" />
      </div>
    </div>
  )
}

export function WatchlistSkeleton() {
  return (
    <div className="space-y-6">
      {/* Add Card Form skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {/* Profile pills skeleton */}
        <div className="flex items-center gap-2 flex-wrap">
          {['Chen', 'Tiff', 'Pho', 'Ying'].map((p) => (
            <div
              key={p}
              className="h-9 px-3 py-2 animate-pulse rounded-md bg-muted border"
              style={{ width: `${p.length * 8 + 24}px` }}
            />
          ))}
        </div>
        
        {/* Add card form skeleton */}
        <div className="flex-1 flex gap-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-[120px]" />
          <Skeleton className="h-9 w-[120px]" />
          <Skeleton className="h-9 w-[120px]" />
        </div>
      </div>
      
      {/* Table skeleton */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full caption-bottom text-sm">
          <thead>
            <tr className="border-b">
              <th className="h-10 px-2 text-left align-middle font-medium w-20">
                <Skeleton className="h-5 w-12" />
              </th>
              <th className="h-10 px-2 text-left align-middle font-medium">
                <Skeleton className="h-5 w-24" />
              </th>
              <th className="h-10 px-2 text-left align-middle font-medium w-24">
                <Skeleton className="h-5 w-20" />
              </th>
              <th className="h-10 px-2 text-center align-middle font-medium w-20">
                <Skeleton className="h-5 w-16" />
              </th>
              <th className="h-10 px-2 text-center align-middle font-medium w-20">
                <Skeleton className="h-5 w-16" />
              </th>
              <th className="h-10 px-2 text-center align-middle font-medium w-20">
                <Skeleton className="h-5 w-16" />
              </th>
              <th className="h-10 px-2 text-left align-middle font-medium w-16">
                <Skeleton className="h-5 w-12" />
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, index) => (
              <tr key={index} className="border-b">
                <td className="p-2 align-middle">
                  <Skeleton className="h-16 w-16 rounded-md" />
                </td>
                <td className="p-2 align-middle">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2 mt-1 text-xs" />
                </td>
                <td className="p-2 align-middle">
                  <Skeleton className="h-5 w-full" />
                </td>
                <td className="p-2 align-middle text-center">
                  <Skeleton className="h-5 w-full" />
                </td>
                <td className="p-2 align-middle text-center">
                  <Skeleton className="h-5 w-full" />
                </td>
                <td className="p-2 align-middle text-center">
                  <Skeleton className="h-5 w-full" />
                </td>
                <td className="p-2 align-middle">
                  <Skeleton className="h-5 w-full" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
