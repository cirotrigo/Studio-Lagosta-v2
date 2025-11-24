import { db } from '../src/lib/db'

async function main() {
  const posts = await db.socialPost.findMany({
    where: {
      postType: 'STORY',
      createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      createdAt: true,
      status: true,
      verificationStatus: true,
      verificationAttempts: true,
      verificationTag: true,
      verificationError: true,
      nextVerificationAt: true,
      lastVerificationAt: true,
      bufferSentAt: true,
      sentAt: true,
      Project: { select: { name: true } },
    },
  })

  console.log(posts)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
