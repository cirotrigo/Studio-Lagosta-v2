import 'dotenv/config'
import pkg from '../prisma/generated/client/default.js'
const { PrismaClient } = pkg

const db = new PrismaClient()

const jobId = Number(process.argv[2])
if (!jobId) {
  console.error('Usage: node scripts/recover-youtube-job.mjs <jobId>')
  process.exit(1)
}

const apiKey = process.env.RAPIDAPI_KEY
if (!apiKey) {
  console.error('RAPIDAPI_KEY missing in env')
  process.exit(1)
}

const job = await db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
if (!job) {
  console.error(`Job ${jobId} not found`)
  process.exit(1)
}
if (!job.youtubeId) {
  console.error(`Job ${jobId} has no youtubeId`)
  process.exit(1)
}

console.log(`Re-querying RapidAPI for video ${job.youtubeId}...`)
const res = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${job.youtubeId}`, {
  headers: {
    'x-rapidapi-key': apiKey,
    'x-rapidapi-host': 'youtube-mp36.p.rapidapi.com',
  },
})

const data = await res.json()
console.log('RapidAPI status:', data.status)

if (data.status !== 'ok' || !data.link) {
  console.error('Conversion not ready or failed:', data)
  process.exit(1)
}

const updated = await db.youtubeDownloadJob.update({
  where: { id: jobId },
  data: {
    status: 'downloading',
    progress: 50,
    videoApiStatus: 'ready',
    videoApiJobId: data.link,
    title: data.title ?? job.title,
    duration: data.duration ?? job.duration,
    startedAt: new Date(),
  },
})

console.log('Job updated:', {
  id: updated.id,
  status: updated.status,
  videoApiStatus: updated.videoApiStatus,
  title: updated.title,
  duration: updated.duration,
  downloadLinkLength: updated.videoApiJobId?.length,
})

await db.$disconnect()
