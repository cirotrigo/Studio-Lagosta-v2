import { db } from '@/lib/db'
import { put } from '@vercel/blob'
import type { YoutubeDownloadJob } from '@prisma/client'
import { Buffer } from 'node:buffer'
import { extractYoutubeId } from './utils'

// API: youtube-to-mp315 (marcocollatina)
const RAPIDAPI_HOST = 'youtube-to-mp315.p.rapidapi.com'
const RAPIDAPI_URL = `https://${RAPIDAPI_HOST}`

interface ConversionStartResponse {
  id: string
  status: 'CONVERTING' | 'AVAILABLE' | 'EXPIRED' | 'CONVERSION_ERROR'
  downloadUrl?: string
  title?: string
  format?: string
}

interface ConversionStatusResponse {
  id: string
  status: 'CONVERTING' | 'AVAILABLE' | 'EXPIRED' | 'CONVERSION_ERROR'
  downloadUrl?: string
  title?: string
  format?: string
}

function requireRapidApiKey(): string {
  const key = process.env.RAPIDAPI_KEY
  if (!key) {
    throw new Error('RAPIDAPI_KEY is not configured')
  }
  return key
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

  try {
    const apiKey = requireRapidApiKey()

    // Se não tem videoApiJobId, iniciar conversão
    if (!job.videoApiJobId) {
      console.log(`[YOUTUBE-API] Starting conversion for job ${job.id}, video: ${videoId}`)

      await db.youtubeDownloadJob.update({
        where: { id: job.id },
        data: {
          status: 'downloading',
          startedAt: new Date(),
          progress: 10,
        },
      })

      const response = await fetch(`${RAPIDAPI_URL}/download`, {
        method: 'POST',
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': RAPIDAPI_HOST,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          format: 'mp3',
          quality: 0, // best quality
        }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        console.error(`[YOUTUBE-API] Start conversion failed: ${response.status} - ${errorText}`)
        throw new Error(`Failed to start conversion: ${response.status}`)
      }

      const data = (await response.json()) as ConversionStartResponse
      console.log(`[YOUTUBE-API] Conversion started: ${data.id}, status: ${data.status}`)

      await db.youtubeDownloadJob.update({
        where: { id: job.id },
        data: {
          videoApiJobId: data.id,
          videoApiStatus: data.status,
          progress: 20,
          title: data.title ?? job.requestedName ?? job.title,
        },
      })

      // Se já está disponível, baixar imediatamente
      if (data.status === 'AVAILABLE' && data.downloadUrl) {
        await downloadAndSaveYoutubeMp3(job.id, data.downloadUrl, data.title)
      }

      return db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
    }

    // Verificar status da conversão
    console.log(`[YOUTUBE-API] Checking status for job ${job.id}, conversion: ${job.videoApiJobId}`)

    const response = await fetch(`${RAPIDAPI_URL}/status/${job.videoApiJobId}`, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
    })

    if (!response.ok) {
      console.error(`[YOUTUBE-API] Status check failed: ${response.status}`)
      throw new Error(`Failed to check status: ${response.status}`)
    }

    const data = (await response.json()) as ConversionStatusResponse
    console.log(`[YOUTUBE-API] Status: ${data.status}`)

    // Atualizar progresso baseado no status
    if (data.status === 'CONVERTING') {
      await db.youtubeDownloadJob.update({
        where: { id: job.id },
        data: {
          progress: Math.min(job.progress + 15, 80),
          videoApiStatus: 'CONVERTING',
        },
      })
    } else if (data.status === 'AVAILABLE' && data.downloadUrl) {
      await db.youtubeDownloadJob.update({
        where: { id: job.id },
        data: {
          progress: 85,
          videoApiStatus: 'AVAILABLE',
          title: data.title ?? job.title,
        },
      })
      await downloadAndSaveYoutubeMp3(job.id, data.downloadUrl, data.title)
    } else if (data.status === 'EXPIRED') {
      await db.youtubeDownloadJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: 'Download link expired - please try again',
          videoApiStatus: 'EXPIRED',
        },
      })
    } else if (data.status === 'CONVERSION_ERROR') {
      await db.youtubeDownloadJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: 'Conversion failed - video may be unavailable or restricted',
          videoApiStatus: 'CONVERSION_ERROR',
        },
      })
    }

    return db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
  } catch (error) {
    console.error('[YOUTUBE-API] Error:', error)

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
        progress: 90,
      },
    })

    console.log(`[YOUTUBE-API] Downloading MP3 for job ${job.id} from: ${downloadUrl}`)

    const mp3Response = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      },
      redirect: 'follow',
    })

    if (!mp3Response.ok) {
      throw new Error(`Failed to download MP3: ${mp3Response.status} ${mp3Response.statusText}`)
    }

    const mp3Buffer = Buffer.from(await mp3Response.arrayBuffer())
    console.log(`[YOUTUBE-API] Downloaded ${mp3Buffer.length} bytes for job ${job.id}`)

    if (mp3Buffer.length < 10000) {
      throw new Error('Downloaded file is too small - conversion may have failed')
    }

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
      console.error('[YOUTUBE-API] Failed to create MusicStemJob:', error)
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

    console.log(`[YOUTUBE-API] Job ${job.id} completed - Music ID: ${music.id}`)
  } catch (error) {
    console.error('[YOUTUBE-API] Download failed:', error)
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

function estimateDuration(sizeInBytes: number, bitrateKbps = 192) {
  const bytesPerSecond = ((bitrateKbps * 1000) / 8)
  const seconds = Math.max(1, Math.round(sizeInBytes / bytesPerSecond))
  return seconds
}
