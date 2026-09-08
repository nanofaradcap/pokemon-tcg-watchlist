# Pokémon TCG Watchlist

A modern web application for tracking Pokémon card prices from TCGplayer and PriceCharting.

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

### Database Setup
This project uses PostgreSQL for both development and production environments:
- **Production**: Neon PostgreSQL (configured via Vercel environment variables)
- **Development**: Same Neon PostgreSQL database (shared for consistency)

### Environment Setup
1. Copy environment variables from Vercel:
   ```bash
   vercel env pull .env.local
   ```

2. Generate Prisma client:
   ```bash
   npx prisma generate
   ```

### Development Server
First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Development checks

After installing dependencies with `npm ci`, run:

```bash
npm test
npm run type-check
npm run lint
npm run build
```

`npm test` compiles and runs the Node.js regression suite with mocked database and scraper dependencies. It overrides database/cache connection settings and does not require a live database, Redis, or browser. The same checks run on pushes and pull requests.

Redis is optional. Set `REDIS_URL` to enable caching and request limits; without it, the app reads directly from PostgreSQL. Unavailable Redis connections fall back without blocking requests, with a 500 ms limit on cache operations. Request limits also fail open during Redis outages.

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

## Automated Backups

A scheduled GitHub Action (`.github/workflows/database-backup.yml`) creates weekly database snapshots and retains them for 30 days. Each scheduled run produces a PostgreSQL `pg_dump` SQL file. For a separate JSON export, run `npm run backup:json`.

To enable the workflow:

1. Add `DATABASE_URL` as a repository secret (Settings → Secrets and variables → Actions).
2. (Optional) Add a repository variable `SCHEMA_VERSION` to label exported snapshots.
3. Leave the workflow enabled; it runs every Sunday at 08:00 UTC and uploads the compressed backups as build artifacts with 30-day retention. You can also trigger a manual backup via the *Run workflow* button in GitHub.
