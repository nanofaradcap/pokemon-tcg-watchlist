#!/usr/bin/env node

(async () => {
  const [{ PrismaClient }, fs, path, dotenv] = await Promise.all([
    import('@prisma/client'),
    import('node:fs'),
    import('node:path'),
    import('dotenv'),
  ])

  const envFiles = ['.env', '.env.local']
  for (const envFile of envFiles) {
    const envPath = path.join(process.cwd(), envFile)
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath })
    }
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set. Aborting backup.')
    process.exit(1)
  }

  const prisma = new PrismaClient()

  const SCHEMA_VERSION = process.env.SCHEMA_VERSION || 'unversioned'

  const OUTPUT_DIR = process.env.BACKUP_OUTPUT_DIR || path.join(process.cwd(), 'backups', 'json')
  const TIMESTAMP = process.env.BACKUP_TIMESTAMP || new Date().toISOString().replace(/[:]/g, '-').replace(/\..+/, 'Z')

  const toISOString = (value) => (value instanceof Date ? value.toISOString() : value ?? null)

  const serializeDecimal = (value) => {
    if (value === null || value === undefined) return null
    if (typeof value === 'string') return value
    if (typeof value === 'number') return value.toString()
    if (typeof value === 'bigint') return value.toString()
    if (value && typeof value.toString === 'function') return value.toString()
    return `${value}`
  }

  try {
    await fs.promises.mkdir(OUTPUT_DIR, { recursive: true })

    console.log('🗄️  Fetching data from database…')

    const [profiles, cards, cardSources, cardPrices, userCards] = await Promise.all([
      prisma.profile.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.card.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.cardSource.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.cardPrice.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.userCard.findMany({ orderBy: { createdAt: 'asc' } }),
    ])

    const payload = {
      profiles: profiles.map((profile) => ({
        ...profile,
        createdAt: toISOString(profile.createdAt),
      })),
      cards: cards.map((card) => ({
        ...card,
        createdAt: toISOString(card.createdAt),
        updatedAt: toISOString(card.updatedAt),
      })),
      cardSources: cardSources.map((source) => ({
        ...source,
        lastCheckedAt: toISOString(source.lastCheckedAt),
        createdAt: toISOString(source.createdAt),
        updatedAt: toISOString(source.updatedAt),
      })),
      cardPrices: cardPrices.map((price) => ({
        ...price,
        price: serializeDecimal(price.price),
        createdAt: toISOString(price.createdAt),
        updatedAt: toISOString(price.updatedAt),
      })),
      userCards: userCards.map((userCard) => ({
        ...userCard,
        createdAt: toISOString(userCard.createdAt),
      })),
      exportedAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
    }

    const filePath = path.join(OUTPUT_DIR, `backup-${TIMESTAMP}.json`)
    await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2))

    console.log('✅ Backup created:', filePath)
    console.log('   Profiles:', payload.profiles.length)
    console.log('   Cards:', payload.cards.length)
    console.log('   CardSources:', payload.cardSources.length)
    console.log('   CardPrices:', payload.cardPrices.length)
    console.log('   UserCards:', payload.userCards.length)
  } catch (error) {
    console.error('❌ Backup failed:', error)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
})()
