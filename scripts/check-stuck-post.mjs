import { config } from 'dotenv'
config({ path: '/Users/cirotrigo/Documents/Studio-Lagosta-v2/.env' })
config({ path: '/Users/cirotrigo/Documents/Studio-Lagosta-v2/.env.local', override: true })

const { PrismaClient } = await import('/Users/cirotrigo/Documents/Studio-Lagosta-v2/prisma/generated/client/index.js')
const prisma = new PrismaClient()

const postId = process.argv[2] || 'cmn7z5vcg001fsw2koyf6c3cn'

const post = await prisma.socialPost.findUnique({
  where: { id: postId },
  include: {
    Project: { select: { id: true, name: true, instagramAccountId: true } }
  }
})
console.log('=== POST ===')
console.log(JSON.stringify(post, null, 2))

const logs = await prisma.postLog.findMany({
  where: { postId },
  orderBy: { createdAt: 'desc' },
  take: 30
})
console.log('\n=== LOGS ===')
console.log(JSON.stringify(logs, null, 2))

const retries = await prisma.postRetry.findMany({
  where: { postId },
  orderBy: { createdAt: 'desc' },
  take: 10
})
console.log('\n=== RETRIES ===')
console.log(JSON.stringify(retries, null, 2))

await prisma.$disconnect()
