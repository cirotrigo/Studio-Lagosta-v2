import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { saveClientDownloadedMp3 } from '@/lib/youtube/video-download-client'
import { db } from '@/lib/db'
import { Buffer } from 'node:buffer'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { jobId: jobIdStr } = await params
    const jobId = Number(jobIdStr)
    if (!jobId || Number.isNaN(jobId)) {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 })
    }

    // Verificar se o job existe e pertence ao usuário
    const job = await db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (job.createdBy !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (job.status === 'completed') {
      return NextResponse.json({ error: 'Job already completed' }, { status: 400 })
    }

    // Obter o arquivo do FormData
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Verificar tipo do arquivo
    if (!file.type.includes('audio') && !file.name.endsWith('.mp3')) {
      return NextResponse.json({ error: 'Invalid file type - must be MP3' }, { status: 400 })
    }

    // Converter para Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    console.log(`[YOUTUBE] Upload recebido para job ${jobId}: ${buffer.length} bytes`)

    // Salvar o arquivo
    await saveClientDownloadedMp3(jobId, buffer, file.name)

    // Buscar o job atualizado para retornar os dados
    const updatedJob = await db.youtubeDownloadJob.findUnique({
      where: { id: jobId },
      include: { music: true },
    })

    return NextResponse.json({
      success: true,
      musicId: updatedJob?.musicId,
      name: updatedJob?.music?.name,
      blobUrl: updatedJob?.music?.blobUrl,
    })
  } catch (error) {
    console.error('[YOUTUBE] Upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
