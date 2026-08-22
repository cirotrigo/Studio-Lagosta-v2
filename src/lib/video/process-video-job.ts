/**
 * Processador da fila de vídeo (WebM → MP4).
 *
 * Extraído de /api/video-processing/process para poder ser chamado tanto pela
 * rota (disparo imediato do browser após o upload) quanto pelo cron de
 * varredura /api/cron/video-processing — antes, se o fetch fire-and-forget do
 * browser morresse (aba fechada), o job ficava PENDING para sempre.
 */

import { writeFile, unlink } from 'fs/promises'
import { join, extname } from 'path'
import { tmpdir } from 'os'
import type { Prisma } from '../../../prisma/generated/client'
import { db } from '@/lib/db'
import { put } from '@vercel/blob'
import { deductCreditsForFeature } from '@/lib/credits/deduct'
import { googleDriveService } from '@/server/google-drive-service'
import {
  convertWebMToMP4ServerSide,
  type AudioMixOptions,
} from '@/lib/video/ffmpeg-server-converter'

export type ProcessVideoJobResult =
  | { outcome: 'idle' }
  | { outcome: 'completed'; jobId: string; mp4Url: string; thumbnailUrl?: string }
  | { outcome: 'failed'; jobId: string; error: string }

interface ExportAudioConfig {
  source: 'original' | 'library' | 'mute' | 'mix'
  musicId?: number
  audioVersion?: 'original' | 'instrumental' | 'vocals'
  startTime?: number
  endTime?: number
  volume?: number
  volumeOriginal?: number
  volumeMusic?: number
  fadeIn?: boolean
  fadeOut?: boolean
  fadeInDuration?: number
  fadeOutDuration?: number
}

/**
 * Fonte de verdade do mix: __exportAudioConfig gravado pela rota de queue
 * (fallback: design.audio persistido na página). Jobs antigos, sem o campo,
 * seguem o caminho legado — WebM com áudio embutido convertido direto.
 */
function resolveExportAudioConfig(
  designData: Record<string, unknown> | null,
): ExportAudioConfig | null {
  const raw =
    (designData?.__exportAudioConfig as ExportAudioConfig | null | undefined) ??
    (designData?.audio as ExportAudioConfig | null | undefined) ??
    null
  if (!raw || typeof raw !== 'object') return null
  if (!['original', 'library', 'mute', 'mix'].includes(raw.source)) return null
  return raw
}

function findVideoLayer(designData: Record<string, unknown> | null): {
  fileUrl?: string
  videoMetadata?: { trimStart?: number }
} | null {
  const layers = designData?.layers
  if (!Array.isArray(layers)) return null
  return (
    (layers.find(
      (l) => l && typeof l === 'object' && (l as { type?: string }).type === 'video',
    ) as { fileUrl?: string; videoMetadata?: { trimStart?: number } } | undefined) ?? null
  )
}

async function downloadToTmp(url: string, label: string, tempFiles: string[]): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Falha ao baixar ${label}: HTTP ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  let ext = '.bin'
  try {
    ext = extname(new URL(url).pathname) || '.bin'
  } catch {
    // mantém .bin
  }
  const filePath = join(
    tmpdir(),
    `audio-input-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`,
  )
  await writeFile(filePath, buffer)
  tempFiles.push(filePath)
  return filePath
}

/**
 * Baixa os insumos (vídeo fonte e/ou música) e monta o AudioMixOptions.
 * Devolve undefined quando não há o que mixar (ex.: 'original' sem arquivo).
 */
async function prepareAudioMix(
  cfg: ExportAudioConfig,
  designData: Record<string, unknown> | null,
  tempFiles: string[],
): Promise<AudioMixOptions | undefined> {
  if (cfg.source === 'mute') return undefined
  const mix: AudioMixOptions = { mode: cfg.source as AudioMixOptions['mode'] }

  if (cfg.source === 'original' || cfg.source === 'mix') {
    const videoLayer = findVideoLayer(designData)
    const fileUrl = videoLayer?.fileUrl
    if (typeof fileUrl === 'string' && fileUrl.startsWith('http')) {
      mix.originalPath = await downloadToTmp(fileUrl, 'vídeo fonte', tempFiles)
      mix.originalTrimStart = videoLayer?.videoMetadata?.trimStart ?? 0
      mix.originalVolume = cfg.source === 'mix' ? (cfg.volumeOriginal ?? 80) / 100 : 1
    } else if (cfg.source === 'original') {
      console.warn('[Video Processor] Fonte de áudio "original" sem fileUrl — export sem áudio')
      return undefined
    }
  }

  if ((cfg.source === 'library' || cfg.source === 'mix') && cfg.musicId) {
    const music = await db.musicLibrary.findUnique({ where: { id: cfg.musicId } })
    if (!music) {
      throw new Error(`Música ${cfg.musicId} não encontrada na biblioteca`)
    }
    // O original é o fallback: stem pedido que ainda não existe toca a faixa
    // inteira, nunca um vídeo mudo.
    const musicUrl =
      cfg.audioVersion === 'instrumental' && music.instrumentalUrl
        ? music.instrumentalUrl
        : cfg.audioVersion === 'vocals' && music.vocalsUrl
          ? music.vocalsUrl
          : music.blobUrl
    mix.musicPath = await downloadToTmp(musicUrl, `música ${music.name}`, tempFiles)
    mix.musicStart = cfg.startTime ?? 0
    mix.musicVolume =
      (cfg.source === 'mix' ? cfg.volumeMusic ?? cfg.volume ?? 60 : cfg.volume ?? 80) / 100
    mix.fadeInDuration = cfg.fadeIn ? cfg.fadeInDuration : undefined
    mix.fadeOutDuration = cfg.fadeOut ? cfg.fadeOutDuration : undefined
  } else if (cfg.source === 'library') {
    console.warn('[Video Processor] Fonte "library" sem musicId — export sem áudio')
    return undefined
  }

  if (!mix.originalPath && !mix.musicPath) return undefined
  return mix
}

export async function processNextVideoJob(): Promise<ProcessVideoJobResult> {
  const job = await db.videoProcessingJob.findFirst({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    include: {
      generation: true,
    },
  })

  if (!job) {
    return { outcome: 'idle' }
  }

  console.log('[Video Processor] Processando job:', job.id)

  const organizationId =
    typeof job.designData === 'object' && job.designData !== null && !Array.isArray(job.designData)
      ? ((job.designData as { __organizationId?: string | null }).__organizationId ?? null)
      : null

  let generationId = job.generationId ?? job.generation?.id ?? null
  let generationFieldValues: Record<string, unknown> =
    (job.generation?.fieldValues as Record<string, unknown> | undefined) ?? {}

  const project = await db.project.findUnique({
    where: { id: job.projectId },
    select: {
      googleDriveFolderId: true,
      googleDriveFolderName: true,
    },
  })

  if (generationId) {
    generationFieldValues = {
      videoExport: true,
      isVideo: true,
      ...generationFieldValues,
      originalJobId: job.id,
    }

    if (!generationFieldValues['thumbnailUrl'] && job.thumbnailUrl) {
      generationFieldValues['thumbnailUrl'] = job.thumbnailUrl
    }
  } else {
    console.warn('[Video Processor] Job sem generation vinculada. Criando registro temporário...')
    const baseFieldValues: Record<string, unknown> = {
      videoExport: true,
      originalJobId: job.id,
      isVideo: true,
      progress: job.progress ?? 0,
      thumbnailUrl: job.thumbnailUrl,
    }

    const fallbackGeneration = await db.generation.create({
      data: {
        templateId: job.templateId,
        projectId: job.projectId,
        createdBy: job.clerkUserId,
        status: 'PROCESSING',
        templateName: job.videoName,
        fieldValues: baseFieldValues as Prisma.InputJsonValue,
        resultUrl: job.thumbnailUrl,
      },
    })

    generationId = fallbackGeneration.id
    generationFieldValues = baseFieldValues

    await db.videoProcessingJob.update({
      where: { id: job.id },
      data: { generationId },
    })
  }

  const persistGeneration = async (
    partialFieldValues: Record<string, unknown> = {},
    extra?: {
      status?: 'PROCESSING' | 'COMPLETED' | 'FAILED'
      resultUrl?: string | null
      completedAt?: Date
    },
  ) => {
    if (!generationId) return
    generationFieldValues = { ...generationFieldValues, ...partialFieldValues }
    await db.generation.update({
      where: { id: generationId },
      data: {
        ...(extra?.status ? { status: extra.status } : {}),
        ...(extra?.resultUrl !== undefined ? { resultUrl: extra.resultUrl } : {}),
        ...(extra?.completedAt ? { completedAt: extra.completedAt } : {}),
        fieldValues: generationFieldValues as Prisma.InputJsonValue,
      },
    })
  }

  await db.videoProcessingJob.update({
    where: { id: job.id },
    data: {
      status: 'PROCESSING',
      startedAt: new Date(),
      progress: 10,
    },
  })

  await persistGeneration(
    {
      progress: 10,
      processingStartedAt: new Date().toISOString(),
    },
    { status: 'PROCESSING' },
  )

  try {
    console.log('[Video Processor] Baixando WebM:', job.webmBlobUrl)
    const webmResponse = await fetch(job.webmBlobUrl)
    const webmArrayBuffer = await webmResponse.arrayBuffer()
    const webmBuffer = Buffer.from(webmArrayBuffer)

    await db.videoProcessingJob.update({
      where: { id: job.id },
      data: { progress: 20 },
    })
    await persistGeneration({ progress: 20 })

    // Trilha sonora (mix server-side): o WebM novo chega mudo; a trilha vem
    // do __exportAudioConfig. Falha na preparação NÃO derruba o job — cai na
    // conversão sem áudio (pior caso: vídeo silencioso, nunca job perdido).
    const jobDesignData =
      typeof job.designData === 'object' && job.designData !== null && !Array.isArray(job.designData)
        ? (job.designData as Record<string, unknown>)
        : null
    const exportAudio = resolveExportAudioConfig(jobDesignData)
    const audioTempFiles: string[] = []
    let audioMix: AudioMixOptions | undefined
    if (exportAudio) {
      try {
        audioMix = await prepareAudioMix(exportAudio, jobDesignData, audioTempFiles)
      } catch (error) {
        console.error('[Video Processor] Falha ao preparar trilha — seguindo sem áudio:', error)
      }
    }

    console.log('[Video Processor] Convertendo WebM → MP4 com FFmpeg...')
    console.log('[Video Processor] Dimensões de destino:', job.videoWidth, 'x', job.videoHeight)
    console.log('[Video Processor] Trilha:', audioMix ? audioMix.mode : 'nenhuma (conversão direta)')

    const conversionOptions = {
      preset: 'fast' as const,
      crf: 23,
      generateThumbnail: true,
      durationSeconds: job.videoDuration,
      // Passar dimensões de destino para garantir aspect ratio correto (crucial para Instagram Stories 9:16)
      targetWidth: job.videoWidth ?? undefined,
      targetHeight: job.videoHeight ?? undefined,
    }
    const onConversionProgress = async (progress: { percent: number }) => {
      const dbProgress = 20 + progress.percent * 0.6
      const roundedProgress = Math.min(80, Math.round(dbProgress))
      await db.videoProcessingJob.update({
        where: { id: job.id },
        data: { progress: roundedProgress },
      })
      await persistGeneration({ progress: roundedProgress })
    }

    let mp4Buffer: Buffer
    let thumbnailBuffer: Buffer | undefined
    try {
      ;({ mp4Buffer, thumbnailBuffer } = await convertWebMToMP4ServerSide(
        webmBuffer,
        onConversionProgress,
        { ...conversionOptions, audioMix },
      ))
    } catch (error) {
      if (!audioMix) throw error
      // Fallback: mix falhou (ex.: vídeo fonte sem faixa de áudio) — entrega
      // o vídeo sem trilha em vez de perder o job e os créditos do usuário
      console.error('[Video Processor] Mix de áudio falhou — reconvertendo sem trilha:', error)
      ;({ mp4Buffer, thumbnailBuffer } = await convertWebMToMP4ServerSide(
        webmBuffer,
        onConversionProgress,
        conversionOptions,
      ))
    } finally {
      await Promise.all(audioTempFiles.map((file) => unlink(file).catch(() => {})))
    }

    console.log('[Video Processor] Conversão concluída!')

    console.log('[Video Processor] Upload do MP4...')
    const mp4Filename = `video-exports/${job.clerkUserId}/${Date.now()}-${job.videoName}.mp4`

    const { url: mp4Url } = await put(mp4Filename, mp4Buffer, {
      access: 'public',
      contentType: 'video/mp4',
    })

    let finalThumbnailUrl: string | null =
      typeof job.thumbnailUrl === 'string' ? job.thumbnailUrl : null
    let driveBackupUrl: string | null = null

    if (thumbnailBuffer) {
      console.log('[Video Processor] Upload da thumbnail...')
      const thumbnailFilename = `video-thumbnails/${job.clerkUserId}/${Date.now()}-${job.videoName}.jpg`
      const { url } = await put(thumbnailFilename, thumbnailBuffer, {
        access: 'public',
        contentType: 'image/jpeg',
      })
      finalThumbnailUrl = url
    } else if (
      !finalThumbnailUrl &&
      typeof generationFieldValues['thumbnailUrl'] === 'string'
    ) {
      finalThumbnailUrl = generationFieldValues['thumbnailUrl'] as string
    }

    const driveFolderId = project?.googleDriveFolderId ?? null
    if (driveFolderId && googleDriveService.isEnabled()) {
      try {
        const driveResult = await googleDriveService.uploadFileToFolder({
          buffer: mp4Buffer,
          folderId: driveFolderId,
          mimeType: 'video/mp4',
          fileName: job.videoName,
        })
        driveBackupUrl = driveResult.publicUrl
        console.log('[Video Processor] Backup enviado ao Google Drive:', driveBackupUrl)
      } catch (error) {
        console.error('[Video Processor] Falha ao fazer backup no Google Drive:', error)
      }
    }

    await db.videoProcessingJob.update({
      where: { id: job.id },
      data: { progress: 85 },
    })
    await persistGeneration({ progress: 85 })

    if (!job.creditsDeducted) {
      console.log('[Video Processor] Deduzindo créditos...')
      await deductCreditsForFeature({
        clerkUserId: job.clerkUserId,
        feature: 'video_export',
        details: {
          jobId: job.id,
          videoName: job.videoName,
          duration: job.videoDuration,
        },
        organizationId: organizationId ?? undefined,
        projectId: job.projectId,
      })
    }

    const completedAt = new Date()
    const completedFieldValues: Record<string, unknown> = {
      progress: 100,
      videoUrl: mp4Url,
      mimeType: 'video/mp4',
    }
    if (finalThumbnailUrl) {
      completedFieldValues.thumbnailUrl = finalThumbnailUrl
    }
    if (driveBackupUrl) {
      completedFieldValues.driveBackupUrl = driveBackupUrl
    }

    const updatedDesignData = {
      ...((job.designData as Record<string, unknown> | null) ?? {}),
      ...(driveBackupUrl ? { driveBackupUrl } : {}),
    }

    await persistGeneration(completedFieldValues, {
      status: 'COMPLETED',
      resultUrl: mp4Url,
      completedAt,
    })

    await db.videoProcessingJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        mp4ResultUrl: mp4Url,
        thumbnailUrl: finalThumbnailUrl ?? job.thumbnailUrl ?? null,
        progress: 100,
        completedAt,
        creditsDeducted: true,
        designData: updatedDesignData,
      },
    })

    console.log('[Video Processor] Job concluído:', job.id)

    return {
      outcome: 'completed',
      jobId: job.id,
      mp4Url,
      thumbnailUrl: finalThumbnailUrl ?? undefined,
    }
  } catch (error) {
    console.error('[Video Processor] Erro ao processar job:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    await db.videoProcessingJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        errorMessage,
      },
    })

    const fallbackThumbnail =
      job.thumbnailUrl ||
      (typeof generationFieldValues['thumbnailUrl'] === 'string'
        ? (generationFieldValues['thumbnailUrl'] as string)
        : null)

    await persistGeneration(
      {
        progress: 100,
        errorMessage,
      },
      {
        status: 'FAILED',
        resultUrl: fallbackThumbnail ?? null,
      },
    )

    return { outcome: 'failed', jobId: job.id, error: errorMessage }
  }
}

/**
 * Marca como FAILED jobs presos em PROCESSING além do tempo máximo de function
 * (300s + folga). Sem isto, um deploy no meio da conversão ou um crash do
 * ffmpeg deixaria o job PROCESSING para sempre — e o polling do editor
 * girando até desistir.
 */
export async function failStuckVideoJobs(maxAgeMinutes = 30): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000)

  const stuck = await db.videoProcessingJob.findMany({
    where: {
      status: 'PROCESSING',
      startedAt: { lt: cutoff },
    },
    select: { id: true, generationId: true },
  })

  for (const job of stuck) {
    const errorMessage =
      'Processamento interrompido (timeout). Tente exportar o vídeo novamente.'

    await db.videoProcessingJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorMessage },
    })

    if (job.generationId) {
      await db.generation
        .update({
          where: { id: job.generationId },
          data: { status: 'FAILED' },
        })
        .catch((error) => {
          console.error('[Video Processor] Falha ao marcar generation como FAILED:', error)
        })
    }

    console.warn(`[Video Processor] Job preso marcado como FAILED: ${job.id}`)
  }

  return stuck.length
}
