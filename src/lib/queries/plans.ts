import { db } from '@/lib/db'

// Query interface: Plans
// Centralizes all DB access for plan reads
export async function getActivePlansSorted() {
  return db.plan.findMany({ 
    where: { active: true }, 
    orderBy: [
      { sortOrder: 'asc' },
      { credits: 'asc' }
    ] 
  })
}

