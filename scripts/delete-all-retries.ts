#!/usr/bin/env tsx
import { db } from '../src/lib/db'

async function deleteAll() {
  const result = await db.postRetry.deleteMany({})
  console.log(`✅ Deleted ${result.count} retries`)
  process.exit(0)
}

deleteAll()
