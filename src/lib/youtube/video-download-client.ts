import { db } from '@/lib/db'
import { put } from '@vercel/blob'
import type { YoutubeDownloadJob } from '@prisma/client'
import { Buffer } from 'node:buffer'
import { extractYoutubeId } from './utils'

const RAPIDAPI_HOST = 'youtube-mp36.p.rapidapi.com'
const RAPIDAPI_URL = `https://${RAPIDAPI_HOST}/dl`

interface RapidApiResponse {
  link?: string | null
  title?: string
  msg?: string
  status: 'ok' | 'processing' | 'fail'
}

interface YoutubeOEmbedResponse {
  title?: string
  author_name?: string
  thumbnail_url?: string
}

function requireRapidApiKey(): string {
  const key = process.env.RAPIDAPI_KEY
  if (!key) {
    throw new Error('RAPIDAPI_KEY is not configured')
  }
  return key
}

async function fetchYoutubeMetadata(videoId: string): Promise<YoutubeOEmbedResponse | null> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    const response = await fetch(url)
    if (!response.ok) return null
    return response.json()
  } catch {
    return null
  }
}

export async function checkYoutubeDownloadStatus(jobId: number) {
  const job = await db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
  if (!job) {
    return null
  }

  if (['completed', 'failed'].includes(job.status)) {
    return job
  }

  const videoId = job.youtubeId || extractYoutubeId(job.youtubeUrl)
  if (!videoId) {
    await db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        error: 'Invalid YouTube URL - could not extract video ID',
      },
    })
    return null
  }

  // Se não tem videoApiJobId, é um job novo - iniciar
  if (!job.videoApiJobId) {
    await db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: {
        status: 'downloading',
        startedAt: new Date(),
        progress: 5,
        videoApiJobId: videoId, // Usamos o videoId como identificador
      },
    })

    // Buscar metadata do YouTube
    const metadata = await fetchYoutubeMetadata(videoId)
    if (metadata) {
      await db.youtubeDownloadJob.update({
        where: { id: job.id },
        data: {
          title: metadata.title ?? job.requestedName ?? job.title,
          thumbnail: metadata.thumbnail_url ?? job.thumbnail,
        },
      })
    }
  }

  try {
    const apiKey = requireRapidApiKey()

    const response = await fetch(`${RAPIDAPI_URL}?id=${videoId}`, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error(`[RAPIDAPI] HTTP ${response.status}: ${errorText}`)

      // Se é 429 (rate limit), incrementar retry e não falhar imediatamente
      if (response.status === 429) {
        await db.youtubeDownloadJob.update({
          where: { id: job.id },
          data: {
            retryCount: { increment: 1 },
            videoApiStatus: 'rate_limited',
          },
        })
        throw new Error('Rate limited - will retry')
      }

      throw new Error(`API request failed: ${response.status}`)
    }

    const data = (await response.json()) as RapidApiResponse
    console.log(`[RAPIDAPI] Job ${job.id} status: ${data.status}`, data.msg || '')

    // Atualizar status baseado na resposta
    if (data.status === 'processing') {
      await db.youtubeDownloadJob.update({
        where: { id: job.id },
        data: {
          progress: Math.min(job.progress + 10, 80),
          videoApiStatus: 'processing',
        },
      })
      return db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
    }

    if (data.status === 'fail') {
      await db.youtubeDownloadJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: data.msg || 'Conversion failed',
          videoApiStatus: 'fail',
        },
      })
      return db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
    }

    if (data.status === 'ok' && data.link) {
      await db.youtubeDownloadJob.update({
        where: { id: job.id },
        data: {
          progress: 90,
          videoApiStatus: 'ready',
          title: data.title || job.title,
        },
      })

      await downloadAndSaveYoutubeMp3(job.id, data.link, data.title)
    }

    return db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
  } catch (error) {
    console.error('[RAPIDAPI] Failed to check progress:', error)

    const currentJob = await db.youtubeDownloadJob.findUnique({ where: { id: job.id } })
    if (currentJob && currentJob.retryCount >= 5) {
      await db.youtubeDownloadJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: 'Max retries exceeded',
        },
      })
      return null
    }

    await db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: {
        retryCount: { increment: 1 },
      },
    })
    throw error
  }
}

async function downloadAndSaveYoutubeMp3(jobId: number, downloadUrl: string, apiTitle?: string) {
  const job = await db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
  if (!job || job.status === 'completed' || job.musicId) {
    return job
  }

  try {
    await db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: {
        status: 'uploading',
        progress: 92,
      },
    })

    console.log(`[RAPIDAPI] Downloading MP3 for job ${job.id}...`)
    const mp3Response = await fetch(downloadUrl)
    if (!mp3Response.ok) {
      throw new Error(`Failed to download MP3 file: ${mp3Response.status}`)
    }

    const mp3Buffer = Buffer.from(await mp3Response.arrayBuffer())
    console.log(`[RAPIDAPI] Downloaded ${mp3Buffer.length} bytes for job ${job.id}`)

    const fileName = `musicas/youtube/${Date.now()}-${job.youtubeId ?? job.id}.mp3`
    const blob = await put(fileName, mp3Buffer, {
      access: 'public',
      contentType: 'audio/mpeg',
    })

    const durationSeconds = job.duration ?? estimateDuration(mp3Buffer.length)
    const resolvedName = job.requestedName || apiTitle || job.title || 'Música do YouTube'

    const music = await db.musicLibrary.create({
      data: {
        name: resolvedName,
        artist: job.requestedArtist,
        genre: job.requestedGenre,
        mood: job.requestedMood,
        projectId: job.projectId,
        duration: durationSeconds,
        blobUrl: blob.url,
        blobSize: mp3Buffer.length,
        thumbnailUrl: job.thumbnail,
        createdBy: job.createdBy,
      },
    })

    await db.musicStemJob.create({
      data: {
        musicId: music.id,
        status: 'pending',
        progress: 0,
      },
    }).catch((error) => {
      console.error('[RAPIDAPI] Failed to create MusicStemJob:', error)
    })

    await db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        progress: 100,
        musicId: music.id,
        completedAt: new Date(),
        duration: durationSeconds,
        title: music.name,
        videoApiStatus: 'done',
      },
    })

    console.log(`[RAPIDAPI] Job ${job.id} completed successfully - Music ID: ${music.id}`)
  } catch (error) {
    console.error('[RAPIDAPI] Failed to finalize YouTube download:', error)
    await db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    })
    throw error
  }
}

function estimateDuration(sizeInBytes: number, bitrateKbps = 128) {
  // RapidAPI retorna 128kbps
  const bytesPerSecond = ((bitrateKbps * 1000) / 8)
  const seconds = Math.max(1, Math.round(sizeInBytes / bytesPerSecond))
  return seconds
}
