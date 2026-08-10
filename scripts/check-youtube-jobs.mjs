import pkg from '../prisma/generated/client/default.js'
const { PrismaClient } = pkg
const db = new PrismaClient()

const jobs = await db.youtubeDownloadJob.findMany({
  orderBy: { createdAt: 'desc' },
  take: 10,
})

console.log('=== Últimos 10 YouTube Download Jobs ===')
for (const j of jobs) {
  const ageMin = Math.round((Date.now() - new Date(j.createdAt).getTime()) / 60000)
  console.log({
    id: j.id,
    status: j.status,
    videoApiStatus: j.videoApiStatus,
    progress: j.progress,
    title: j.title?.slice(0, 50),
    youtubeId: j.youtubeId,
    error: j.error,
    createdAt: j.createdAt.toISOString(),
    ageMin: `${ageMin}min`,
    musicId: j.musicId,
  })
}
await db.$disconnect()
