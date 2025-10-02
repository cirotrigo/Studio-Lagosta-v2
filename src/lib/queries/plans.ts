import { db } from '@/lib/db'

// Query interface: Plans
// Centralizes all DB access for plan reads
export async function getActivePlansSorted() {
  try {
    return await db.plan.findMany({
      where: { active: true },
      orderBy: [
        { sortOrder: 'asc' },
        { credits: 'asc' }
      ]
    })
  } catch (error) {
    // During build time or when DB is not available, return empty array
    console.warn('Database not available for plans query:', error instanceof Error ? error.message : 'Unknown error')
    return []
  }
}

