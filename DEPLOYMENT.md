# Deployment Guide for Pokemon TCG Watchlist

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **GitHub Repository**: Push your code to GitHub
3. **Domain**: Your domain `chencat.com` should be configured in Namecheap

## Step 1: Set up PostgreSQL Database

### Option A: Vercel Postgres (Recommended)
1. Go to your Vercel dashboard
2. Create a new project
3. Go to Storage tab
4. Add a Postgres database
5. Copy the connection string

### Option B: Railway Postgres
1. Go to [railway.app](https://railway.app)
2. Create a new project
3. Add a PostgreSQL database
4. Copy the connection string

### Option C: Supabase
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Go to Settings > Database
4. Copy the connection string

## Step 2: Deploy to Vercel

1. **Connect GitHub Repository**:
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your GitHub repository
   - Select the repository

2. **Configure Environment Variables**:
   ```
   DATABASE_URL=postgresql://username:password@host:port/database
   SCRAPE_CONCURRENCY=2
   SCRAPE_TIMEOUT_MS=12000
   ENABLE_TCGPLAYER_API=false
   TCGPLAYER_PUBLIC_KEY=
   TCGPLAYER_PRIVATE_KEY=
   NODE_ENV=production
   NEXT_PUBLIC_APP_URL=https://chencat.com
   ```

3. **Deploy**:
   - Click "Deploy"
   - Wait for the build to complete

## Step 3: Set up Custom Domain

1. **In Vercel Dashboard**:
   - Go to your project
   - Go to Settings > Domains
   - Add `chencat.com` and `www.chencat.com`

2. **In Namecheap**:
   - Go to your domain management
   - Update DNS records:
     - Type: A Record, Host: @, Value: `76.76.19.61`
     - Type: CNAME, Host: www, Value: `cname.vercel-dns.com`

## Step 4: Database Migration

After deployment, run the database migration:

```bash
# Install Vercel CLI
npm i -g vercel

# Run migration
vercel env pull .env.local
npx prisma db push
```

## Step 5: Verify Deployment

1. Visit `https://chencat.com`
2. Test adding a card
3. Verify all functionality works

## Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | - |
| `SCRAPE_CONCURRENCY` | Number of concurrent scraping requests | No | 2 |
| `SCRAPE_TIMEOUT_MS` | Timeout for scraping requests (ms) | No | 12000 |
| `ENABLE_TCGPLAYER_API` | Enable TCGplayer API integration | No | false |
| `TCGPLAYER_PUBLIC_KEY` | TCGplayer API public key | No | - |
| `TCGPLAYER_PRIVATE_KEY` | TCGplayer API private key | No | - |
| `NODE_ENV` | Environment mode | Yes | production |
| `NEXT_PUBLIC_APP_URL` | Public app URL | Yes | https://chencat.com |

## Troubleshooting

### Common Issues:

1. **Database Connection Error**:
   - Verify `DATABASE_URL` is correct
   - Check if database is accessible from Vercel

2. **Build Failures**:
   - Check that all dependencies are in `package.json`
   - Verify TypeScript compilation

3. **Domain Not Working**:
   - Check DNS propagation (can take up to 24 hours)
   - Verify domain is added in Vercel dashboard

### Support:
- Check Vercel logs in dashboard
- Check database logs
- Verify environment variables are set correctly
