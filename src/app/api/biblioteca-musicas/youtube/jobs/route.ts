import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const jobs = await db.youtubeDownloadJob.findMany({
      where: { createdBy: userId },
      include: {
        music: {
          select: {
            id: true,
            name: true,
            blobUrl: true,
            hasInstrumentalStem: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json(jobs)
  } catch (error) {
    console.error('[YOUTUBE] Failed to list jobs:', error)
    return NextResponse.json({ error: 'Failed to list jobs' }, { status: 500 })
  }
}
