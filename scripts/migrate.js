#!/usr/bin/env node

async function main() {
  const { execSync } = await import('node:child_process')

  console.log('🚀 Starting database migration...')

  try {
    // Generate Prisma client
    console.log('📦 Generating Prisma client...')
    execSync('npx prisma generate', { stdio: 'inherit' })

    // Push schema to database
    console.log('🗄️  Pushing schema to database...')
    execSync('npx prisma db push', { stdio: 'inherit' })

    console.log('✅ Database migration completed successfully!')
  } catch (error) {
    console.error('❌ Migration failed:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

void main()
