import { db } from '@/lib/db'
async function main() {
  const u = await db.chatUpload.create({
    data: { projectId: 8, expiresAt: new Date(Date.now() + 30 * 60_000) },
    select: { id: true },
  })
  console.log(u.id)
}
main().finally(() => db.$disconnect())
