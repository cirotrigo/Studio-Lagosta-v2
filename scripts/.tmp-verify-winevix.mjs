import { config } from 'dotenv'
config({ path: '/Users/cirotrigo/Documents/Studio-Lagosta-v2/.env' })
config({ path: '/Users/cirotrigo/Documents/Studio-Lagosta-v2/.env.local', override: true })

const { PrismaClient } = await import('/Users/cirotrigo/Documents/Studio-Lagosta-v2/prisma/generated/client/index.js')
const prisma = new PrismaClient()

const post = await prisma.socialPost.findUnique({
  where: { id: 'cmrzfhp3c0001jr04ltl1vgmp' },
  select: { id: true, status: true, errorMessage: true, laterPostId: true, sentAt: true },
})
console.log(JSON.stringify(post, null, 2))
await prisma.$disconnect()
