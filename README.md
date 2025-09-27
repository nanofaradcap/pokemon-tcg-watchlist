# Pokémon TCG Watchlist

A modern web application for tracking Pokémon TCG card prices from multiple sources with automatic card merging.

## Features

- **Multi-Source Price Tracking**: Track prices from both TCGplayer and PriceCharting
- **Automatic Card Merging**: Cards from different sources are automatically merged when they represent the same physical card
- **Comprehensive Pricing Data**: 
  - TCGplayer market prices
  - PriceCharting graded prices (Ungraded, Grade 7, 8, 9, 9.5, 10)
- **Smart Duplicate Prevention**: Prevents adding the same card multiple times
- **Real-time Refresh**: Update prices from both sources with a single click
- **Profile Management**: Support for multiple user profiles
- **Modern UI**: Clean, responsive interface built with Next.js and Tailwind CSS

## Supported Sources

- **TCGplayer**: Market prices and card information
- **PriceCharting**: Graded card prices and condition-specific data

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Usage

1. **Add Cards**: Paste TCGplayer or PriceCharting URLs to add cards to your watchlist
2. **Automatic Merging**: Cards with the same name and number are automatically merged
3. **Track Prices**: Monitor both market prices and graded card values
4. **Refresh Data**: Click refresh to get the latest prices from both sources
5. **Manage Cards**: Unmerge cards if needed or remove them from your watchlist

## Technology Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL with Prisma ORM
- **Web Scraping**: Puppeteer with Chromium
- **Deployment**: Vercel

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.
