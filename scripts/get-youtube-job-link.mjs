import 'dotenv/config'
import pkg from '../prisma/generated/client/default.js'
const { PrismaClient } = pkg
const db = new PrismaClient()
const jobId = Number(process.argv[2])
const job = await db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
console.log('Title:', job?.title)
console.log('Status:', job?.status, '/', job?.videoApiStatus)
console.log('Download link:')
console.log(job?.videoApiJobId)
await db.$disconnect()
