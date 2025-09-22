import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/export - Export cards as CSV
export async function GET() {
  try {
    const cards = await prisma.card.findMany({
      orderBy: { createdAt: 'desc' }
    })

    // CSV header
    const headers = [
      'Image',
      'Card',
      'Price',
      'Set (JP/EN)',
      'No.',
      'Link'
    ]

    // CSV rows
    const rows = cards.map(card => [
      card.imageUrl || `https://tcgplayer-cdn.tcgplayer.com/product/${card.productId}_in_1000x1000.jpg`,
      card.name,
      card.marketPrice ? `$${card.marketPrice.toFixed(2)}` : '—',
      card.setDisplay || '—',
      card.jpNo || '—',
      card.url
    ])

    // Escape CSV values
    const escapeCsvValue = (value: string) => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`
      }
      return value
    }

    // Build CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(escapeCsvValue).join(','))
    ].join('\n')

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="pokemon-tcg-watchlist.csv"',
      },
    })

  } catch (error) {
    console.error('Error exporting CSV:', error)
    return NextResponse.json(
      { error: 'Failed to export CSV' },
      { status: 500 }
    )
  }
}
