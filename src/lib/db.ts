import { PrismaClient } from "../../prisma/generated/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Add connection pooling and timeout params for Neon DB
function getDatabaseUrl() {
  const baseUrl = process.env.DATABASE_URL
  if (!baseUrl) {
    console.error('❌ DATABASE_URL environment variable is not defined!')
    console.error('Please set DATABASE_URL in your Vercel project settings or .env file')
    throw new Error('DATABASE_URL is not defined - check your environment variables')
  }

  // Validar que é PostgreSQL
  if (!baseUrl.startsWith('postgresql://') && !baseUrl.startsWith('postgres://')) {
    console.error('❌ DATABASE_URL must be a PostgreSQL connection string!')
    console.error(`Current URL starts with: ${baseUrl.substring(0, 20)}...`)
    console.error('Expected format: postgresql://...')
    throw new Error('DATABASE_URL must be PostgreSQL - check if you accidentally changed to Supabase or another DB')
  }

  // Validar que é Neon (aviso, não erro fatal)
  const validHosts = ['neon.tech', 'neondb']
  const isValidNeonUrl = validHosts.some(host => baseUrl.includes(host))

  if (!isValidNeonUrl && process.env.NODE_ENV === 'development') {
    console.warn('⚠️  WARNING: DATABASE_URL does not appear to be from Neon!')
    console.warn(`   Current host: ${baseUrl.substring(0, 60)}...`)
    console.warn('   Expected: Should contain "neon.tech" or "neondb"')
    console.warn('   If this is intentional, you can ignore this warning.')
  }

  try {
    // Parse URL to add connection params
    const url = new URL(baseUrl)

    // Only add params if not already present
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '10')
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '10')
    }
    if (!url.searchParams.has('connect_timeout')) {
      url.searchParams.set('connect_timeout', '10')
    }

    // Log de sucesso (apenas em dev)
    if (process.env.NODE_ENV === 'development') {
      const maskedUrl = url.toString().replace(/:[^:@]+@/, ':****@')
      console.log('✅ DATABASE_URL validated:', maskedUrl.substring(0, 80))
    }

    return url.toString()
  } catch (error) {
    console.error('❌ Invalid DATABASE_URL format:', error)
    throw new Error('DATABASE_URL is invalid - check the connection string format')
  }
}

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: getDatabaseUrl()
    }
  }
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Handle Prisma connection errors gracefully
db.$connect().catch((err) => {
  console.error('Failed to connect to database:', err.message)
})
