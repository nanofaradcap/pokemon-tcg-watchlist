import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/export - Export cards as CSV
export async function GET() {
  try {
    const cards = await prisma.card.findMany({
      include: {
        sources: {
          include: {
            prices: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // CSV header
    const headers = [
      'Image',
      'Card',
      'Market Price',
      'Ungraded Price',
      'Grade 9 Price',
      'Grade 10 Price',
      'Set (JP/EN)',
      'No.',
      'Sources'
    ]

    // CSV rows
    const rows = cards.map(card => {
      // Consolidate pricing from all sources
      const marketPrice = card.sources.find(s => s.prices.some(p => p.priceType === 'market'))?.prices.find(p => p.priceType === 'market')?.price
      const ungradedPrice = card.sources.find(s => s.prices.some(p => p.priceType === 'ungraded'))?.prices.find(p => p.priceType === 'ungraded')?.price
      const grade9Price = card.sources.find(s => s.prices.some(p => p.priceType === 'grade9'))?.prices.find(p => p.priceType === 'grade9')?.price
      const grade10Price = card.sources.find(s => s.prices.some(p => p.priceType === 'grade10'))?.prices.find(p => p.priceType === 'grade10')?.price
      
      const sources = card.sources.map(s => s.sourceType).join(', ')
      const primarySource = card.sources[0]
      const imageUrl = primarySource?.url.includes('tcgplayer.com') 
        ? `https://tcgplayer-cdn.tcgplayer.com/product/${primarySource.productId}_in_1000x1000.jpg`
        : card.imageUrl

      return [
        imageUrl || '—',
        card.name,
        marketPrice ? `$${Number(marketPrice).toFixed(2)}` : '—',
        ungradedPrice ? `$${Number(ungradedPrice).toFixed(2)}` : '—',
        grade9Price ? `$${Number(grade9Price).toFixed(2)}` : '—',
        grade10Price ? `$${Number(grade10Price).toFixed(2)}` : '—',
        card.setDisplay || '—',
        card.jpNo || '—',
        sources
      ]
    })

    // Combine headers and rows
    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="pokemon-cards.csv"'
      }
    })
  } catch (error) {
    console.error('Error exporting CSV:', error)
    return NextResponse.json(
      { error: 'Failed to export CSV' },
      { status: 500 }
    )
  }
}
