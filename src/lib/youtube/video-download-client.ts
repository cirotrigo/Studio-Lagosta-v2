import { db } from '@/lib/db'
import { put } from '@vercel/blob'
import type { YoutubeDownloadJob } from '@prisma/client'
import { Buffer } from 'node:buffer'
import { extractYoutubeId } from './utils'

// API: youtube-mp36 (RapidAPI)
const RAPIDAPI_HOST = 'youtube-mp36.p.rapidapi.com'
const RAPIDAPI_URL = `https://${RAPIDAPI_HOST}/dl`

interface RapidApiResponse {
  link?: string | null
  title?: string
  msg?: string
  status: 'ok' | 'processing' | 'fail'
  duration?: number
  filesize?: number
}

function requireRapidApiKey(): string {
  const key = process.env.RAPIDAPI_KEY
  if (!key) {
    throw new Error('RAPIDAPI_KEY is not configured')
  }
  return key
}

/**
 * Obtém o link de download do YouTube MP3
 * Retorna o link para o cliente fazer o download no browser
 */
export async function getYoutubeDownloadLink(videoId: string): Promise<{
  success: boolean
  link?: string
  title?: string
  duration?: number
  error?: string
}> {
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
      console.error(`[YOUTUBE-API] HTTP ${response.status}`)
      return { success: false, error: `API request failed: ${response.status}` }
    }

    const data = (await response.json()) as RapidApiResponse
    console.log(`[YOUTUBE-API] Response status: ${data.status}`)

    if (data.status === 'processing') {
      return { success: false, error: 'processing' }
    }

    if (data.status === 'fail' || !data.link) {
      return { success: false, error: data.msg || 'Conversion failed' }
    }

    return {
      success: true,
      link: data.link,
      title: data.title,
      duration: data.duration,
    }
  } catch (error) {
    console.error('[YOUTUBE-API] Error:', error)
    return { success: false, error: 'Failed to get download link' }
  }
}

/**
 * Persiste um MP3 (já em memória) na biblioteca: sobe para o Vercel Blob,
 * cria a MusicLibrary (versão original), enfileira a geração instrumental
 * (MusicStemJob) e marca o job de download como concluído.
 *
 * IMPORTANTE: não marca o job como "failed" em caso de erro — quem chama é
 * responsável por isso (para poder aplicar mensagens/estratégias diferentes).
 */
async function persistDownloadedMp3(
  job: YoutubeDownloadJob,
  mp3Buffer: Buffer,
  fileName: string
) {
  await db.youtubeDownloadJob.update({
    where: { id: job.id },
    data: {
      status: 'uploading',
      progress: 90,
    },
  })

  console.log(`[YOUTUBE-API] Persistindo ${mp3Buffer.length} bytes para o job ${job.id}`)

  if (mp3Buffer.length < 10000) {
    throw new Error('Arquivo muito pequeno — o download pode ter falhado')
  }

  const blobFileName = `musicas/youtube/${Date.now()}-${job.youtubeId ?? job.id}.mp3`
  const blob = await put(blobFileName, mp3Buffer, {
    access: 'public',
    contentType: 'audio/mpeg',
  })

  const durationSeconds = job.duration ?? estimateDuration(mp3Buffer.length)
  const resolvedName = job.requestedName || job.title || fileName || 'Música do YouTube'

  // Cadastra a música IMEDIATAMENTE com apenas a versão original.
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

  // Enfileira a versão instrumental. Se falhar aqui, a música permanece
  // cadastrada só com a original (o usuário pode reprocessar depois).
  await db.musicStemJob.create({
    data: {
      musicId: music.id,
      status: 'pending',
      progress: 0,
    },
  }).catch((error) => {
    console.error('[YOUTUBE-API] Falha ao criar MusicStemJob (instrumental na fila):', error)
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

  console.log(`[YOUTUBE-API] Job ${job.id} concluído — Music ID: ${music.id}`)
  return music
}

/**
 * Salva um MP3 que foi baixado pelo cliente (fluxo legado de upload manual).
 * Mantido como fallback — o fluxo principal agora usa downloadAndIngestYoutubeJob.
 */
export async function saveClientDownloadedMp3(
  jobId: number,
  mp3Buffer: Buffer,
  fileName: string
) {
  const job = await db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
  if (!job) {
    throw new Error('Job not found')
  }

  if (job.status === 'completed' || job.musicId) {
    return job
  }

  try {
    return await persistDownloadedMp3(job, mp3Buffer, fileName)
  } catch (error) {
    console.error('[YOUTUBE-API] Upload failed:', error)
    await db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Upload failed',
      },
    })
    throw error
  }
}

/**
 * Baixa o MP3 direto do link da RapidAPI (server-side) e cadastra a música.
 *
 * Substitui o antigo fluxo manual "abrir link no browser + reenviar arquivo".
 * Usa um claim atômico (downloading → uploading) para que chamadas concorrentes
 * (POST inicial, polling do status e cron) nunca baixem o mesmo job em duplicidade.
 *
 * Em caso de erro no download, marca o job como "failed" com mensagem em PT — a
 * música NÃO é cadastrada, e o usuário pode tentar novamente pelo mesmo link.
 */
export async function downloadAndIngestYoutubeJob(jobId: number) {
  // Claim atômico: só um processo consegue transicionar downloading → uploading.
  const claim = await db.youtubeDownloadJob.updateMany({
    where: { id: jobId, status: 'downloading', musicId: null },
    data: { status: 'uploading', progress: 70 },
  })

  if (claim.count === 0) {
    // Já foi processado por outro fluxo (ou não está pronto). Retorna o estado atual.
    return db.youtubeDownloadJob.findUnique({
      where: { id: jobId },
      include: { music: true },
    })
  }

  const job = await db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
  if (!job) {
    throw new Error('Job not found')
  }

  const link = job.videoApiJobId
  if (!link || !link.startsWith('http')) {
    await db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: 'Link de download indisponível' },
    })
    throw new Error('No download link available')
  }

  try {
    console.log(`[YOUTUBE-API] Baixando MP3 (server-side) para o job ${job.id}...`)
    const response = await fetch(link)
    if (!response.ok) {
      throw new Error(`Falha ao baixar do YouTube (HTTP ${response.status})`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const fileName = `${job.youtubeId ?? job.id}.mp3`

    return await persistDownloadedMp3(job, buffer, fileName)
  } catch (error) {
    console.error('[YOUTUBE-API] Download server-side falhou:', error)
    await db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Falha ao baixar o áudio',
      },
    })
    throw error
  }
}

/**
 * Inicia um job de download (cria registro no banco)
 */
export async function startYoutubeDownloadJob(
  youtubeUrl: string,
  userId: string,
  options?: {
    name?: string
    artist?: string
    genre?: string
    mood?: string
    projectId?: number
  }
) {
  const videoId = extractYoutubeId(youtubeUrl)
  if (!videoId) {
    throw new Error('Invalid YouTube URL')
  }

  // Verificar se já existe job ativo para este vídeo
  const existingJob = await db.youtubeDownloadJob.findFirst({
    where: {
      youtubeId: videoId,
      createdBy: userId,
      status: { in: ['pending', 'downloading', 'uploading'] },
    },
  })

  if (existingJob) {
    return existingJob
  }

  // Buscar metadados do YouTube
  const metadata = await fetchYoutubeMetadata(videoId)

  const job = await db.youtubeDownloadJob.create({
    data: {
      youtubeUrl,
      youtubeId: videoId,
      status: 'pending',
      progress: 0,
      createdBy: userId,
      requestedName: options?.name,
      requestedArtist: options?.artist,
      requestedGenre: options?.genre,
      requestedMood: options?.mood,
      projectId: options?.projectId,
      title: metadata?.title ?? options?.name,
      thumbnail: metadata?.thumbnail_url,
    },
  })

  return job
}

/**
 * Atualiza o job com o link de download obtido
 */
export async function updateJobWithDownloadLink(
  jobId: number,
  link: string,
  title?: string,
  duration?: number
) {
  return db.youtubeDownloadJob.update({
    where: { id: jobId },
    data: {
      status: 'downloading',
      progress: 50,
      videoApiStatus: 'ready',
      videoApiJobId: link,
      title: title ?? undefined,
      duration: duration ?? undefined,
      startedAt: new Date(),
    },
  })
}

async function fetchYoutubeMetadata(videoId: string): Promise<{
  title?: string
  author_name?: string
  thumbnail_url?: string
} | null> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    const response = await fetch(url)
    if (!response.ok) return null
    return response.json()
  } catch {
    return null
  }
}

function estimateDuration(sizeInBytes: number, bitrateKbps = 128) {
  const bytesPerSecond = ((bitrateKbps * 1000) / 8)
  const seconds = Math.max(1, Math.round(sizeInBytes / bytesPerSecond))
  return seconds
}

/**
 * Para jobs que ficaram em "pending" porque a RapidAPI ainda estava convertendo,
 * re-consulta a API. Se a conversão terminou, salva o link e move o job para "downloading".
 *
 * Retorna o job atualizado (ou o job original se nada mudou). Falha silenciosamente em erros
 * transitórios — quem chamou continua usando o job que recebeu.
 */
export async function refreshPendingYoutubeJob(jobId: number) {
  const job = await db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
  if (!job) return null

  if (job.status !== 'pending' || job.videoApiStatus !== 'processing' || !job.youtubeId) {
    return job
  }

  const result = await getYoutubeDownloadLink(job.youtubeId)

  if (!result.success) {
    if (result.error === 'processing') {
      return job
    }

    return db.youtubeDownloadJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        error: result.error || 'Conversion failed',
        videoApiStatus: 'fail',
      },
    })
  }

  return db.youtubeDownloadJob.update({
    where: { id: job.id },
    data: {
      status: 'downloading',
      progress: 50,
      videoApiStatus: 'ready',
      videoApiJobId: result.link ?? null,
      title: result.title ?? job.title,
      duration: result.duration ?? job.duration,
      startedAt: new Date(),
    },
  })
}

// Manter compatibilidade com cron job existente (vai falhar graciosamente)
export async function checkYoutubeDownloadStatus(jobId: number) {
  const job = await db.youtubeDownloadJob.findUnique({ where: { id: jobId } })
  if (!job) return null

  if (job.status === 'pending' && job.videoApiStatus === 'processing') {
    return refreshPendingYoutubeJob(jobId)
  }

  // Jobs agora são processados pelo cliente, não pelo servidor
  // Apenas marcar jobs antigos como falhos
  if (job.status === 'downloading') {
    const jobAge = Date.now() - new Date(job.createdAt).getTime()
    const oneHour = 60 * 60 * 1000

    if (jobAge > oneHour) {
      await db.youtubeDownloadJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: 'Download timeout - please try again',
        },
      })
    }
  }

  return job
}
