/**
 * Processador da fila de vídeo (WebM → MP4), durável e retomável.
 *
 * Chamado pela rota da fila (`after()`, logo depois do enfileiramento) e pelo
 * cron de varredura `/api/cron/video-processing`, que é a rede: pega o PENDING
 * esquecido e o devolvido pela recuperação.
 *
 * Reserva por compare-and-set (PENDING → PROCESSING, `startedAt` = o token do
 * arrendamento, `attempts + 1`) e etapas com marcador, cada uma pulada na
 * repetição:
 *   1. MP4 convertido e enviado → `job.mp4ResultUrl` (não reconverte);
 *   2. cobrança, com a marca `creditsDeducted` NO MESMO commit do débito (não
 *      cobra duas vezes, nem se a confirmação se perder);
 *   3. Generation COMPLETED;
 *   4. destino (agenda: o post e o vínculo num commit; substituir: a troca e o
 *      desfecho num commit — `substituirVideoDoPost`);
 *   5. job COMPLETED.
 * Toda escrita a partir da reserva confere que o arrendamento ainda é desta
 * execução; quem o perdeu para sem escrever. Falha depois da cobrança é
 * tratada como transitória: o job fica PROCESSING e a recuperação
 * (`recuperarJobsDeVideoPresos`) o devolve à fila ou conclui sem destino.
 */

import { writeFile, unlink } from 'fs/promises'
import { join, extname } from 'path'
import { tmpdir } from 'os'
import type { Prisma } from '../../../prisma/generated/client'
import { db } from '@/lib/db'
import { put, del } from '@vercel/blob'
import { deductCreditsForFeature } from '@/lib/credits/deduct'
import { googleDriveService } from '@/server/google-drive-service'
import { CreativeError } from '@/lib/creatives/errors'
import { mesclarFieldValuesDaArte } from '@/lib/creatives/mesclar-field-values'
import { copyDeCamadas } from '@/lib/aprendizado/diff-copy'
import { CobrancaRecusada, marcarCobrancaNoMesmoCommit } from '@/lib/video/cobranca-do-video'
import {
  ARRENDAMENTO_DO_VIDEO_MS,
  MOTIVO_DESTINO_NAO_CONCLUIDO,
  decidirRecuperacao,
  lerVideoDaPagina,
  situacaoNaHoraDoDestino,
  type DestinoAgenda,
  type VideoDaPagina,
} from '@/lib/video/destino-do-video'
import {
  convertWebMToMP4ServerSide,
  temFaixaDeAudio,
  type AudioMixOptions,
} from '@/lib/video/ffmpeg-server-converter'
import { trechosDeVideo, trechosOriginais, volumeDoOriginal } from '@/lib/video/plano-de-som'
import {
  MOTIVO_DO_AVISO_DE_AUDIO,
  fonteEfetiva,
  proximaTentativaDeAudio,
  type AudioAviso,
} from '@/lib/video/audio-do-export'

export type ProcessVideoJobResult =
  | { outcome: 'idle' }
  | { outcome: 'completed'; jobId: string; mp4Url: string; thumbnailUrl?: string }
  | { outcome: 'failed'; jobId: string; error: string }
  /** A execução parou sem concluir (arrendamento perdido, falha depois da cobrança, queda simulada): o job segue PROCESSING. */
  | { outcome: 'interrompido'; jobId: string; motivo: string }

/** Só para a prova: simulam a queda entre as etapas (lançam `QuedaSimulada`). */
export interface CosturasDoVideo {
  depoisDeCobrar?: () => Promise<void> | void
  antesDeConcluir?: () => Promise<void> | void
}

export class QuedaSimulada extends Error {
  constructor(onde: string) {
    super(`Queda simulada ${onde}`)
    this.name = 'QuedaSimulada'
  }
}

class ArrendamentoPerdido extends Error {
  constructor() {
    super('Outra execução assumiu este vídeo.')
    this.name = 'ArrendamentoPerdido'
  }
}

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

function camadasDaPagina(designData: Record<string, unknown> | null): Parameters<typeof trechosDeVideo>[0] {
  const layers = designData?.layers
  return Array.isArray(layers) ? (layers as Parameters<typeof trechosDeVideo>[0]) : null
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
 * Baixa os insumos (vídeos da sequência e/ou música) e monta o AudioMixOptions.
 * `mix` ausente = não há o que mixar. `aviso` vem quando o som vai sair
 * diferente do pedido: algo FALHOU, ou a página não tem vídeo com som (foto +
 * música, motion sobre foto, sequência sem vídeo) e o pedido contava com o som
 * do vídeo (`fonteEfetiva` decide antes de baixar qualquer arquivo).
 *
 * Fase 4: o som original é o de CADA clipe de vídeo, na posição dele na linha
 * do tempo (`trechosOriginais`, a mesma conta da prévia). Clipe sem faixa de
 * áudio é pulado (`temFaixaDeAudio`), sem erro; só com nenhum sobrando o som
 * original conta como falho.
 */
async function prepareAudioMix(
  pedido: ExportAudioConfig,
  designData: Record<string, unknown> | null,
  tempFiles: string[],
): Promise<{ mix?: AudioMixOptions; aviso?: AudioAviso }> {
  const layers = camadasDaPagina(designData)
  const temSomOriginal = trechosDeVideo(layers).some((t) => t.fileUrl.startsWith('http'))
  const { config: cfg, aviso: avisoDaFonte } = fonteEfetiva(pedido, temSomOriginal)
  if (cfg.source === 'mute') return { aviso: avisoDaFonte }
  const mix: AudioMixOptions = { mode: cfg.source as AudioMixOptions['mode'] }
  let somOriginalFalhou = false

  if (cfg.source === 'original' || cfg.source === 'mix') {
    if (temSomOriginal) {
      try {
        const baixados = new Map<string, string>() // o mesmo arquivo duas vezes na sequência baixa uma vez
        const originais: NonNullable<AudioMixOptions['originais']> = []
        for (const t of trechosOriginais(layers, cfg)) {
          if (!t.fileUrl.startsWith('http')) continue
          let path = baixados.get(t.fileUrl)
          if (!path) {
            path = await downloadToTmp(t.fileUrl, 'vídeo fonte', tempFiles)
            baixados.set(t.fileUrl, path)
          }
          if (!(await temFaixaDeAudio(path))) {
            console.warn(`[Video Processor] Clipe ${t.id} sem faixa de áudio — pulado`)
            continue
          }
          originais.push({ path, trimStart: t.trimStart, inicio: t.inicio, duracao: t.duracao })
        }
        if (originais.length === 0) throw new Error('Nenhum vídeo da página tem faixa de áudio')
        mix.originais = originais
        mix.originalVolume = volumeDoOriginal(cfg)
      } catch (error) {
        // 'original' não tem outra fonte: quem chama registra e segue sem áudio.
        // No mix a música não pode ir embora junto com o som que falhou.
        if (cfg.source !== 'mix') throw error
        console.error('[Video Processor] Som original indisponível — mix segue só com a música:', error)
        somOriginalFalhou = true
      }
    }
  }

  if ((cfg.source === 'library' || cfg.source === 'mix') && cfg.musicId) {
    try {
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
    } catch (error) {
      // Música apagada ou fora do ar: no mix, o som do vídeo que já chegou
      // íntegro não vai embora junto. Sem ele, quem chama segue sem áudio.
      if (!mix.originais?.length) throw error
      console.error('[Video Processor] Música indisponível — mix segue só com o som do vídeo:', error)
      return { mix: { ...mix, mode: 'original' }, aviso: 'so-original' }
    }
  } else if (cfg.source === 'library') {
    console.warn('[Video Processor] Fonte "library" sem musicId — export sem áudio')
    return {}
  }

  const aviso: AudioAviso | undefined = somOriginalFalhou
    ? mix.musicPath
      ? 'so-musica'
      : 'sem-audio'
    : avisoDaFonte
  if (!mix.originais?.length && !mix.musicPath) return { aviso }
  return { mix, aviso }
}

function comoObjeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export async function processNextVideoJob(): Promise<ProcessVideoJobResult> {
  const candidato = await db.videoProcessingJob.findFirst({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!candidato) return { outcome: 'idle' }
  return processVideoJob(candidato.id)
}

export async function processVideoJob(
  jobId: string,
  costuras: CosturasDoVideo = {},
): Promise<ProcessVideoJobResult> {
  // Reserva: só quem passa o job de PENDING para PROCESSING trabalha nele.
  const startedAt = new Date()
  const reserva = await db.videoProcessingJob.updateMany({
    where: { id: jobId, status: 'PENDING' },
    data: { status: 'PROCESSING', startedAt, attempts: { increment: 1 }, progress: 10 },
  })
  if (reserva.count !== 1) return { outcome: 'idle' }

  const job = await db.videoProcessingJob.findUnique({ where: { id: jobId } })
  if (!job) return { outcome: 'idle' }
  console.log('[Video Processor] Processando job:', job.id, `(tentativa ${job.attempts})`)

  const doArrendamento = { id: job.id, status: 'PROCESSING' as const, startedAt }
  /** Escreve no job só se o arrendamento ainda é desta execução. */
  const noJob = async (data: Prisma.VideoProcessingJobUncheckedUpdateManyInput) => {
    const r = await db.videoProcessingJob.updateMany({ where: doArrendamento, data })
    if (r.count !== 1) throw new ArrendamentoPerdido()
  }
  /** Uma transação que trava o job e confere o arrendamento antes de escrever. */
  const comArrendamento = <T>(fazer: (tx: Prisma.TransactionClient) => Promise<T>) =>
    db.$transaction(
      async (tx) => {
        const [linha] = await tx.$queryRaw<Array<{ status: string; startedAt: Date | null }>>`SELECT status::text AS status, "startedAt" FROM "VideoProcessingJob" WHERE id = ${job.id} FOR UPDATE`
        if (!linha || linha.status !== 'PROCESSING' || linha.startedAt?.getTime() !== startedAt.getTime()) {
          throw new ArrendamentoPerdido()
        }
        return fazer(tx)
      },
      { timeout: 20_000 },
    )

  const designData = comoObjeto(job.designData)
  const organizationId = (designData?.__organizationId as string | null | undefined) ?? null

  let cobrado = job.creditsDeducted
  let generationId = job.generationId
  try {
    // Generation da galeria (a fila sempre cria; job antigo sem ela ganha uma).
    if (!generationId) {
      console.warn('[Video Processor] Job sem generation vinculada. Criando registro temporário...')
      const criada = await db.generation.create({
        data: {
          templateId: job.templateId,
          projectId: job.projectId,
          createdBy: job.clerkUserId,
          status: 'PROCESSING',
          templateName: job.videoName,
          fieldValues: { videoExport: true, isVideo: true, originalJobId: job.id, thumbnailUrl: job.thumbnailUrl } as Prisma.InputJsonValue,
          resultUrl: job.thumbnailUrl,
        },
      })
      generationId = criada.id
      await noJob({ generationId })
    }
    const progresso = async (progress: number) => {
      // Progresso é informativo: escrita condicionada, sem lançar (o callback roda dentro do ffmpeg).
      await db.videoProcessingJob.updateMany({ where: doArrendamento, data: { progress } }).catch(() => {})
      await mesclarFieldValuesDaArte(db, generationId, { progress }).catch(() => {})
    }
    await mesclarFieldValuesDaArte(db, generationId, {
      videoExport: true,
      isVideo: true,
      originalJobId: job.id,
      progress: 10,
      processingStartedAt: startedAt.toISOString(),
    })

    // (1) MP4 — marcador `mp4ResultUrl`: a repetição não reconverte.
    let mp4Url = job.mp4ResultUrl
    let finalThumbnailUrl = job.thumbnailUrl ?? null
    let audioAviso = (designData?.__audioAviso as AudioAviso | undefined) ?? undefined
    let driveBackupUrl = (designData?.driveBackupUrl as string | undefined) ?? null
    if (!mp4Url) {
      const convertido = await converterEEnviar(job, designData, progresso)
      try {
        driveBackupUrl = convertido.driveBackupUrl
        audioAviso = convertido.audioAviso
        finalThumbnailUrl = convertido.thumbnailUrl ?? finalThumbnailUrl
        await noJob({
          mp4ResultUrl: convertido.mp4Url,
          thumbnailUrl: finalThumbnailUrl,
          progress: 85,
          designData: {
            ...(designData ?? {}),
            ...(driveBackupUrl ? { driveBackupUrl } : {}),
            ...(audioAviso ? { __audioAviso: audioAviso } : {}),
          } as Prisma.InputJsonValue,
        })
        mp4Url = convertido.mp4Url
      } catch (error) {
        // Arrendamento perdido depois do upload: o MP4 desta execução não é de ninguém.
        await del(convertido.mp4Url).catch(() => {})
        throw error
      }
    }

    // (2) Cobrança — a marca sai no mesmo commit do débito.
    if (!cobrado) {
      try {
        await deductCreditsForFeature({
          clerkUserId: job.clerkUserId,
          feature: 'video_export',
          details: { jobId: job.id, videoName: job.videoName, duration: job.videoDuration },
          organizationId: organizationId ?? undefined,
          projectId: job.projectId,
          noMesmoCommit: marcarCobrancaNoMesmoCommit(job.id, startedAt),
        })
      } catch (error) {
        if (!(error instanceof CobrancaRecusada)) throw error
        // A marca já estava gravada (uma tentativa anterior cobrou) ou o job mudou de dono.
        const atual = await db.videoProcessingJob.findUnique({
          where: { id: job.id },
          select: { status: true, startedAt: true, creditsDeducted: true },
        })
        if (atual?.status !== 'PROCESSING' || atual.startedAt?.getTime() !== startedAt.getTime()) {
          throw new ArrendamentoPerdido()
        }
        if (!atual.creditsDeducted) throw error
      }
      cobrado = true
    }
    await costuras.depoisDeCobrar?.()

    // (3) Generation COMPLETED.
    const completedAt = new Date()
    await comArrendamento(async (tx) => {
      await mesclarFieldValuesDaArte(
        tx,
        generationId,
        {
          progress: 100,
          videoUrl: mp4Url,
          mimeType: 'video/mp4',
          ...(finalThumbnailUrl ? { thumbnailUrl: finalThumbnailUrl } : {}),
          ...(driveBackupUrl ? { driveBackupUrl } : {}),
          ...(audioAviso
            ? { audioAviso, audioAvisoMotivo: MOTIVO_DO_AVISO_DE_AUDIO[audioAviso] }
            : {}),
        },
        { resultUrl: mp4Url },
      )
      await tx.generation.update({ where: { id: generationId }, data: { status: 'COMPLETED', completedAt } })
    })

    // (4) Destino.
    await levarAoDestino(job, generationId, mp4Url, designData, comArrendamento)

    // (5) Job COMPLETED.
    await costuras.antesDeConcluir?.()
    await noJob({ status: 'COMPLETED', progress: 100, completedAt, creditsDeducted: true })

    console.log('[Video Processor] Job concluído:', job.id)
    return {
      outcome: 'completed',
      jobId: job.id,
      mp4Url,
      thumbnailUrl: finalThumbnailUrl ?? undefined,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    // Sem o arrendamento, ou já cobrado: não escreve nada — a recuperação decide.
    if (error instanceof ArrendamentoPerdido || error instanceof QuedaSimulada || cobrado) {
      console.warn('[Video Processor] Job interrompido:', job.id, errorMessage)
      return { outcome: 'interrompido', jobId: job.id, motivo: errorMessage }
    }
    console.error('[Video Processor] Erro ao processar job:', error)
    const r = await db.videoProcessingJob.updateMany({
      where: doArrendamento,
      data: { status: 'FAILED', errorMessage },
    })
    if (r.count === 1 && generationId) {
      await mesclarFieldValuesDaArte(db, generationId, { progress: 100, errorMessage })
      await db.generation.update({ where: { id: generationId }, data: { status: 'FAILED', resultUrl: job.thumbnailUrl ?? null } })
    }
    return { outcome: 'failed', jobId: job.id, error: errorMessage }
  }
}

type JobDoVideo = NonNullable<Awaited<ReturnType<typeof db.videoProcessingJob.findUnique>>>

/** A etapa 1: baixa o WebM, monta a trilha, converte e envia MP4, miniatura e backup. */
async function converterEEnviar(
  job: JobDoVideo,
  designData: Record<string, unknown> | null,
  progresso: (p: number) => Promise<void>,
): Promise<{ mp4Url: string; thumbnailUrl: string | null; driveBackupUrl: string | null; audioAviso?: AudioAviso }> {
  console.log('[Video Processor] Baixando WebM:', job.webmBlobUrl)
  const webmResponse = await fetch(job.webmBlobUrl)
  const webmBuffer = Buffer.from(await webmResponse.arrayBuffer())
  await progresso(20)

  // Trilha sonora (mix server-side): o WebM novo chega mudo; a trilha vem
  // do __exportAudioConfig. Falha na preparação NÃO derruba o job — cai na
  // conversão sem áudio (pior caso: vídeo silencioso, nunca job perdido).
  // Mas nunca em silêncio: audioAviso guarda o que saiu diferente do pedido
  // e vai para a Generation, que é o que o card do criativo mostra.
  const exportAudio = resolveExportAudioConfig(designData)
  const audioTempFiles: string[] = []
  let audioMix: AudioMixOptions | undefined
  let audioAviso: AudioAviso | undefined
  if (exportAudio) {
    try {
      ;({ mix: audioMix, aviso: audioAviso } = await prepareAudioMix(exportAudio, designData, audioTempFiles))
    } catch (error) {
      console.error('[Video Processor] Falha ao preparar trilha — seguindo sem áudio:', error)
      audioAviso = 'sem-audio'
    }
  }

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
    // O WebM do MediaRecorder não traz duração: o ffmpeg devolve percentual absurdo (medido: -2,7e14).
    const percent = Number.isFinite(progress.percent) ? Math.max(0, Math.min(100, progress.percent)) : 0
    await progresso(Math.round(20 + percent * 0.6))
  }

  let mp4Buffer: Buffer
  let thumbnailBuffer: Buffer | undefined
  // A trilha como foi pedida: é por ela que a escada sabe o que ainda falta tentar
  const audioPedido = audioMix
  try {
    // Escada: a trilha pedida → só a música → só o som do vídeo (os dois
    // degraus do meio só quando havia som do vídeo E música) → sem áudio. Cada
    // falha desce um degrau; sem trilha, a falha é do vídeo e derruba o job.
    for (;;) {
      try {
        ;({ mp4Buffer, thumbnailBuffer } = await convertWebMToMP4ServerSide(
          webmBuffer,
          onConversionProgress,
          { ...conversionOptions, audioMix },
        ))
        break
      } catch (error) {
        if (!audioMix) throw error
        const proxima = proximaTentativaDeAudio(audioMix, audioPedido ?? audioMix)
        console.error(
          `[Video Processor] Conversão com trilha falhou — tentando ${proxima.mix ? `com ${proxima.mix.mode === 'library' ? 'só a música' : 'só o som do vídeo'}` : 'sem áudio'}:`,
          error,
        )
        audioMix = proxima.mix
        audioAviso = proxima.aviso
      }
    }
  } finally {
    await Promise.all(audioTempFiles.map((file) => unlink(file).catch(() => {})))
  }

  const { url: mp4Url } = await put(`video-exports/${job.clerkUserId}/${Date.now()}-${job.videoName}.mp4`, mp4Buffer, {
    access: 'public',
    contentType: 'video/mp4',
  })

  let thumbnailUrl: string | null = null
  if (thumbnailBuffer) {
    const { url } = await put(`video-thumbnails/${job.clerkUserId}/${Date.now()}-${job.videoName}.jpg`, thumbnailBuffer, {
      access: 'public',
      contentType: 'image/jpeg',
    })
    thumbnailUrl = url
  }

  let driveBackupUrl: string | null = null
  const project = await db.project.findUnique({ where: { id: job.projectId }, select: { googleDriveFolderId: true } })
  if (project?.googleDriveFolderId && googleDriveService.isEnabled()) {
    try {
      const driveResult = await googleDriveService.uploadFileToFolder({
        buffer: mp4Buffer,
        folderId: project.googleDriveFolderId,
        mimeType: 'video/mp4',
        fileName: job.videoName,
      })
      driveBackupUrl = driveResult.publicUrl
    } catch (error) {
      console.error('[Video Processor] Falha ao fazer backup no Google Drive:', error)
    }
  }

  return { mp4Url, thumbnailUrl, driveBackupUrl, audioAviso }
}

type ComArrendamento = <T>(fazer: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>

/**
 * A etapa 4. Erro de NEGÓCIO (`CreativeError`: horário inválido, conta do
 * Instagram ausente) vira `resultado` registrado e o job conclui — o vídeo
 * fica na galeria. Qualquer outro erro sobe: é transitório, e a recuperação
 * tenta de novo.
 */
async function levarAoDestino(
  job: JobDoVideo,
  generationId: string,
  mp4Url: string,
  designData: Record<string, unknown> | null,
  comArrendamento: ComArrendamento,
): Promise<void> {
  const gen = await db.generation.findUnique({ where: { id: generationId }, select: { fieldValues: true } })
  const video = lerVideoDaPagina(gen?.fieldValues)
  if (!video || video.destino.tipo === 'galeria' || video.resultado) return

  const copyGravada = copyDeCamadas(designData?.layers ?? null)
  try {
    if (video.destino.tipo === 'substituir') {
      const { substituirVideoDoPost } = await import('@/lib/posts/substituir-video-do-post')
      await comArrendamento((tx) => substituirVideoDoPost(tx, { generationId, mp4Url, copyGravada }))
      return
    }
    await levarParaAgenda(job, generationId, mp4Url, video, video.destino, copyGravada, comArrendamento)
  } catch (error) {
    if (!(error instanceof CreativeError)) throw error
    const resultado = { ok: false as const, motivo: error.message, em: new Date().toISOString() }
    await comArrendamento(async (tx) => {
      const atual = lerVideoDaPagina(
        (await tx.generation.findUnique({ where: { id: generationId }, select: { fieldValues: true } }))?.fieldValues,
      )
      if (atual && !atual.resultado && !atual.postId) {
        await mesclarFieldValuesDaArte(tx, generationId, { videoDaPagina: { ...atual, resultado } })
      }
    })
  }
}

async function levarParaAgenda(
  job: JobDoVideo,
  generationId: string,
  mp4Url: string,
  video: VideoDaPagina,
  destino: DestinoAgenda,
  copyGravada: Record<string, string> | null,
  comArrendamento: ComArrendamento,
): Promise<void> {
  const { resolverAgendamento, criarPostDoAgendamento, efeitosDoAgendamento, contextoDosEfeitos } = await import(
    '@/lib/creatives/agendar'
  )
  const naHora = situacaoNaHoraDoDestino(destino, new Date())
  const feito = await comArrendamento(async (tx) => {
    // Repetição depois de uma queda: o post já foi criado por uma tentativa anterior.
    const atual = lerVideoDaPagina(
      (await tx.generation.findUnique({ where: { id: generationId }, select: { fieldValues: true } }))?.fieldValues,
    )
    if (!atual || atual.postId || atual.resultado) return null
    const r = await resolverAgendamento(
      {
        projectId: job.projectId,
        postType: destino.postType,
        caption: destino.postType === 'REEL' ? destino.legenda : undefined,
        scheduledDatetime: destino.quando,
        pageId: video.pageId,
        mediaUrls: [mp4Url],
        generationId,
        situacao: naHora.situacao,
        decididoPor: job.userId,
        superficie: 'editor',
      },
      { leitor: tx, ingerir: false },
    )
    // A cópia de texto é a do que o vídeo GRAVOU, não a da página de agora.
    if (copyGravada) {
      r.copyDaPagina = copyGravada
      r.copyFinal = copyGravada
    }
    const post = await criarPostDoAgendamento(tx, r)
    await mesclarFieldValuesDaArte(tx, generationId, {
      videoDaPagina: { ...atual, postId: post.id, ...(naHora.motivo ? { aviso: naHora.motivo } : {}) },
    })
    return { post, r }
  })
  if (feito) await efeitosDoAgendamento(feito.post, contextoDosEfeitos(feito.r))
}

/**
 * A recuperação do job preso em PROCESSING além do arrendamento (deploy no
 * meio, função morta por tempo): volta à fila enquanto houver tentativa;
 * esgotado, falha — a não ser que o vídeo já exista e esteja cobrado, e aí
 * conclui com o vídeo na galeria e o destino registrando o motivo. Tudo por
 * compare-and-set no `startedAt` lido: um job que voltou a andar não é tocado.
 */
export async function recuperarJobsDeVideoPresos(
  agora = new Date(),
): Promise<{ devolvidos: number; falhados: number; concluidos: number }> {
  const presos = await db.videoProcessingJob.findMany({
    where: { status: 'PROCESSING', startedAt: { lt: new Date(agora.getTime() - ARRENDAMENTO_DO_VIDEO_MS) } },
    select: { id: true, startedAt: true, attempts: true, mp4ResultUrl: true, creditsDeducted: true, generationId: true, thumbnailUrl: true },
  })
  const placar = { devolvidos: 0, falhados: 0, concluidos: 0 }
  for (const job of presos) {
    const lido = { id: job.id, status: 'PROCESSING' as const, startedAt: job.startedAt }
    const decisao = decidirRecuperacao({ attempts: job.attempts, videoPronto: !!job.mp4ResultUrl && job.creditsDeducted })
    try {
      if (decisao === 'devolver') {
        const r = await db.videoProcessingJob.updateMany({ where: lido, data: { status: 'PENDING' } })
        placar.devolvidos += r.count
      } else if (decisao === 'falhar') {
        const errorMessage = 'O processamento do vídeo foi interrompido duas vezes. Tente exportar o vídeo novamente.'
        const r = await db.videoProcessingJob.updateMany({ where: lido, data: { status: 'FAILED', errorMessage } })
        if (r.count === 1 && job.generationId) {
          await db.generation.update({ where: { id: job.generationId }, data: { status: 'FAILED' } })
        }
        placar.falhados += r.count
      } else {
        await db.$transaction(async (tx) => {
          const r = await tx.videoProcessingJob.updateMany({
            where: lido,
            data: { status: 'COMPLETED', progress: 100, completedAt: agora },
          })
          if (r.count !== 1 || !job.generationId) return
          const gen = await tx.generation.findUnique({ where: { id: job.generationId }, select: { fieldValues: true } })
          const video = lerVideoDaPagina(gen?.fieldValues)
          await mesclarFieldValuesDaArte(
            tx,
            job.generationId,
            {
              progress: 100,
              videoUrl: job.mp4ResultUrl,
              mimeType: 'video/mp4',
              ...(video && video.destino.tipo !== 'galeria' && !video.postId && !video.resultado
                ? { videoDaPagina: { ...video, resultado: { ok: false, motivo: MOTIVO_DESTINO_NAO_CONCLUIDO, em: agora.toISOString() } } }
                : {}),
            },
            { resultUrl: job.mp4ResultUrl! },
          )
          await tx.generation.update({ where: { id: job.generationId }, data: { status: 'COMPLETED', completedAt: agora } })
          placar.concluidos += 1
        })
      }
    } catch (error) {
      console.error('[Video Processor] Falha ao recuperar job preso:', job.id, error)
    }
  }
  return placar
}
