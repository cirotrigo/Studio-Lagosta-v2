import { db } from '@/lib/db'
import { put } from '@vercel/blob'
import type { YoutubeDownloadJob } from '@prisma/client'
import { Buffer } from 'node:buffer'

const VIDEO_DOWNLOAD_API_URL = 'https://p.savenow.to/ajax'

interface VideoDownloadStartResponse {
  success: boolean
  id?: string
  error?: string
  info?: {
    title?: string
    image?: string
    duration?: string | number
  }
}

interface VideoDownloadProgressResponse {
  success: boolean
  progress?: number | string
  text?: string
  download_url?: string
  error?: string
  info?: {
    title?: string
    duration?: string | number
    image?: string
  }
}

function requireVideoDownloadApiKey(): string {
  const key = process.env.VIDEO_DOWNLOAD_API_KEY
  if (!key) {
    throw new Error('VIDEO_DOWNLOAD_API_KEY is not configured')
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

  if (!job.videoApiJobId) {
    await startYoutubeDownload(job)
    return db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
  }

  try {
    const url = `${VIDEO_DOWNLOAD_API_URL}/progress?id=${job.videoApiJobId}`
    const response = await fetch(url)

    if (!response.ok) {
      // Se é 404 e o job tem mais de 1 hora, provavelmente expirou na API externa
      if (response.status === 404) {
        const jobAge = Date.now() - new Date(job.createdAt).getTime()
        const oneHour = 60 * 60 * 1000

        if (jobAge > oneHour || job.retryCount >= 3) {
          // Job expirou ou teve muitas tentativas - marcar como falho
          await db.youtubeDownloadJob.update({
            where: { id: job.id },
            data: {
              status: 'failed',
              error: 'Download job expired or not found in external API',
            },
          })
          console.log(`[VIDEO-API] Job ${job.id} marked as failed (404 error, age: ${Math.round(jobAge / 1000 / 60)} minutes)`)
          return null
        }
      }

      throw new Error(`Failed to fetch progress: ${response.status}`)
    }

    const data = (await response.json()) as VideoDownloadProgressResponse

    const rawProgress = typeof data.progress === 'string' ? parseInt(data.progress, 10) : data.progress || 0
    const progressPercent = Math.max(10, Math.min(Math.floor((rawProgress / 1000) * 90), 90))

    await db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: {
        progress: progressPercent,
        videoApiStatus: data.text || job.videoApiStatus,
      },
    })

    if (data.success && data.download_url) {
      await downloadAndSaveYoutubeMp3(job.id, data)
    }

    // Detectar erros da API externa (incluindo "No Files - Code XXXX")
    const isErrorText = data.text && /error|fail|no files/i.test(data.text)
    const isCompletedWithoutUrl = rawProgress >= 1000 && !data.download_url

    if (isErrorText || isCompletedWithoutUrl) {
      const errorMessage = data.text || 'Download completed but no file was provided'
      await db.youtubeDownloadJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: errorMessage,
        },
      })
    }

    return db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
  } catch (error) {
    console.error('[VIDEO-API] Failed to check progress:', error)
    await db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: {
        retryCount: { increment: 1 },
      },
    })
    throw error
  }
}

async function startYoutubeDownload(job: YoutubeDownloadJob) {
  try {
    const apiKey = requireVideoDownloadApiKey()

    await db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: {
        status: 'downloading',
        startedAt: new Date(),
        progress: 5,
      },
    })

    const params = new URLSearchParams({
      format: 'mp3',
      url: job.youtubeUrl,
      apikey: apiKey,
      audio_quality: '320',
      add_info: '1',
    })

    const response = await fetch(`${VIDEO_DOWNLOAD_API_URL}/download.php?${params.toString()}`)
    if (!response.ok) {
      throw new Error(`Failed to start download: ${response.status}`)
    }

    const data = (await response.json()) as VideoDownloadStartResponse
    if (!data.success || !data.id) {
      throw new Error(data.error || 'Failed to start video download')
    }

    await db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: {
        videoApiJobId: data.id,
        videoApiStatus: 'waiting',
        progress: 10,
        title: data.info?.title ?? job.requestedName ?? job.title,
        thumbnail: data.info?.image ?? job.thumbnail,
        duration: parseDuration(data.info?.duration) ?? job.duration,
      },
    })
  } catch (error) {
    await db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to start download',
      },
    })
    throw error
  }
}

async function downloadAndSaveYoutubeMp3(jobId: number, downloadData: VideoDownloadProgressResponse) {
  const job = await db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
  if (!job || job.status === 'completed' || job.musicId) {
    return job
  }

  const downloadUrl = downloadData.download_url
  if (!downloadUrl) {
    throw new Error('Missing download URL from provider response')
  }

  try {
    await db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: {
        status: 'uploading',
        progress: 92,
      },
    })

    const mp3Response = await fetch(downloadUrl)
    if (!mp3Response.ok) {
      throw new Error('Failed to download MP3 file from provider')
    }

    const mp3Buffer = Buffer.from(await mp3Response.arrayBuffer())

    const fileName = `musicas/youtube/${Date.now()}-${job.youtubeId ?? job.id}.mp3`
    const blob = await put(fileName, mp3Buffer, {
      access: 'public',
      contentType: 'audio/mpeg',
    })

    const durationSeconds =
      job.duration ??
      parseDuration(downloadData.info?.duration) ??
      estimateDuration(mp3Buffer.length)

    const thumbnailUrl = job.thumbnail ?? downloadData.info?.image ?? null
    const resolvedName = job.requestedName || downloadData.info?.title || job.title || 'Música do YouTube'

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
        thumbnailUrl,
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
      console.error('[VIDEO-API] Failed to create MusicStemJob:', error)
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
        thumbnail: thumbnailUrl,
        videoApiStatus: 'done',
      },
    })
  } catch (error) {
    console.error('[VIDEO-API] Failed to finalize YouTube download:', error)
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

function parseDuration(duration?: string | number | null): number | null {
  if (!duration && duration !== 0) return null
  if (typeof duration === 'number' && !Number.isNaN(duration)) {
    return duration
  }
  if (typeof duration === 'string') {
    if (/^\d+$/.test(duration)) {
      return parseInt(duration, 10)
    }
    if (duration.includes(':')) {
      return duration.split(':').reduce((total, part) => total * 60 + parseInt(part, 10), 0)
    }
  }
  return null
}

function estimateDuration(sizeInBytes: number, bitrateKbps = 320) {
  const bytesPerSecond = ((bitrateKbps * 1000) / 8)
  const seconds = Math.max(1, Math.round(sizeInBytes / bytesPerSecond))
  return seconds
}
