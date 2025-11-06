import { PrismaClient } from "../../prisma/generated/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Add connection pooling and timeout params for Neon DB
function getDatabaseUrl() {
  const baseUrl = process.env.DATABASE_URL
  if (!baseUrl) {
    console.error('DATABASE_URL environment variable is not defined!')
    console.error('Please set DATABASE_URL in your Vercel project settings or .env file')
    throw new Error('DATABASE_URL is not defined - check your environment variables')
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

    return url.toString()
  } catch (error) {
    console.error('Invalid DATABASE_URL format:', error)
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
