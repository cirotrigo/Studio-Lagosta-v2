import { db } from '../src/lib/db'

async function main() {
  const projects = await db.project.findMany({
    select: {
      id: true,
      name: true,
      instagramAccountId: true,
      instagramUserId: true,
    },
    orderBy: { id: 'asc' },
  })

  const missing = projects.filter((p) => !p.instagramAccountId && !p.instagramUserId)
  const withAccountOnly = projects.filter((p) => p.instagramAccountId && !p.instagramUserId)
  const withUserId = projects.filter((p) => p.instagramUserId)

  console.log('Projects total:', projects.length)
  console.log('Missing both IDs:', missing.length)
  console.log('Has instagramAccountId only:', withAccountOnly.length)
  console.log('Has instagramUserId (validated):', withUserId.length)

  if (missing.length > 0) {
    console.log('\nMissing list (first 20):')
    missing.slice(0, 20).forEach((p) => console.log(`- ${p.id}: ${p.name}`))
  }

  if (withAccountOnly.length > 0) {
    console.log('\nNeed validation (accountId only, first 20):')
    withAccountOnly.slice(0, 20).forEach((p) =>
      console.log(`- ${p.id}: ${p.name} | accountId=${p.instagramAccountId}`)
    )
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
