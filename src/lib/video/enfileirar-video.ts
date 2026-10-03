/**
 * O enfileiramento do vídeo exportado da página, fora da rota HTTP: a rota (que
 * cuida do login, dos créditos, do acesso ao projeto e do upload) e a prova de
 * integração chamam as MESMAS duas funções, na mesma ordem.
 *
 * 1. `prepararVideoDaPagina` decide para onde o vídeo vai, ANTES de qualquer
 *    upload ou cobrança: confere a página, o destino e — na substituição — o
 *    post, e monta `videoDaPagina` (a versão do que foi gravado, o post como
 *    estava, os pedidos anteriores do mesmo post ainda sem desfecho).
 * 2. `criarJobDeVideo` cria a Generation da galeria e o job, num commit.
 */
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { postDeVideo } from '@/lib/posts/post-de-video'
import {
  lerVideoDaPagina,
  validarDestinoNaFila,
  validarSubstituicaoNaFila,
  type DestinoDoVideo,
  type VideoDaPagina,
} from './destino-do-video'
import { paginaDoDesign, versaoDoVideo } from './versao-do-video'

export type PreparoDoVideo =
  | { ok: true; videoDaPagina: VideoDaPagina | null }
  | { ok: false; status: 400 | 409; error: string }

export async function prepararVideoDaPagina(p: {
  projectId: number
  templateId: number
  pageId?: string | null
  destino: DestinoDoVideo
  designData: unknown
  videoWidth: number
  videoHeight: number
  agora?: Date
}): Promise<PreparoDoVideo> {
  const { destino } = p
  if (destino.tipo !== 'galeria' && !p.pageId) {
    return { ok: false, status: 400, error: 'Para levar o vídeo à agenda, informe a página.' }
  }
  if (!p.pageId) return { ok: true, videoDaPagina: null }

  const pagina = await db.page.findUnique({
    where: { id: p.pageId },
    select: {
      templateId: true,
      width: true,
      height: true,
      background: true,
      layers: true,
      audio: true,
      Template: { select: { projectId: true } },
    },
  })
  if (!pagina || pagina.templateId !== p.templateId || pagina.Template.projectId !== p.projectId) {
    return { ok: false, status: 400, error: 'A página não pertence a este template.' }
  }
  const motivo = validarDestinoNaFila(destino, {
    agora: p.agora ?? new Date(),
    largura: p.videoWidth,
    altura: p.videoHeight,
  })
  if (motivo) return { ok: false, status: 400, error: motivo }

  const gravada = paginaDoDesign(p.designData)
  const versao = gravada ? versaoDoVideo(gravada) : null
  const versaoNoBanco = versaoDoVideo(pagina)
  const videoDaPagina: VideoDaPagina = {
    pageId: p.pageId,
    versao,
    divergiuNaGravacao: !versao || !versaoNoBanco || versao !== versaoNoBanco,
    destino,
  }

  if (destino.tipo === 'substituir') {
    const post = await db.socialPost.findUnique({
      where: { id: destino.postId },
      select: {
        id: true,
        projectId: true,
        pageId: true,
        status: true,
        laterPostId: true,
        updatedAt: true,
        mediaUrls: true,
        videoDaPagina: true,
      },
    })
    const recusa = validarSubstituicaoNaFila(post, {
      projectId: p.projectId,
      pageId: p.pageId,
      ehVideo: post ? postDeVideo(post) : false,
    })
    if (recusa) return { ok: false, status: 409, error: recusa }
    // As substituições deste post ainda em produção: a troca que elas fizerem não conta como mudança na agenda.
    const emAndamento = await db.generation.findMany({
      where: {
        projectId: p.projectId,
        status: { not: 'FAILED' },
        createdAt: { gte: new Date(Date.now() - 14 * 86_400_000) },
        fieldValues: { path: ['videoDaPagina', 'destino', 'postId'], equals: destino.postId },
      },
      select: { id: true, fieldValues: true },
    })
    videoDaPagina.esperado = {
      revisao: post!.updatedAt.toISOString(),
      mediaUrls: post!.mediaUrls,
      pageId: p.pageId,
    }
    videoDaPagina.predecessoras = emAndamento
      .filter((g) => {
        const v = lerVideoDaPagina(g.fieldValues)
        return v?.destino.tipo === 'substituir' && !v.resultado
      })
      .map((g) => g.id)
  }
  return { ok: true, videoDaPagina }
}

/** A trilha pedida (o `audioConfig` da fila; com `strict: false` o zod a entrega toda opcional). */
interface ConfigDeAudio {
  source?: 'original' | 'library' | 'mute' | 'mix'
  musicId?: number
  startTime?: number
  endTime?: number
  volume?: number
  volumeMusic?: number
  fadeIn?: boolean
  fadeOut?: boolean
  fadeInDuration?: number
  fadeOutDuration?: number
}

export async function criarJobDeVideo(p: {
  user: { id: string }
  clerkUserId: string
  orgId: string | null
  project: { id: number; name: string }
  templateId: number
  videoName: string
  videoDuration: number
  videoWidth: number
  videoHeight: number
  webmBlobUrl: string
  webmFileSize: number
  thumbnailUrl: string | null
  designData: unknown
  audioConfig: ConfigDeAudio | null
  videoDaPagina: VideoDaPagina | null
}): Promise<{ jobId: string; generationId: string }> {
  const baseFieldValues = {
    videoExport: true,
    isVideo: true,
    progress: 0,
    thumbnailUrl: p.thumbnailUrl,
    videoDuration: p.videoDuration,
    videoWidth: p.videoWidth,
    videoHeight: p.videoHeight,
    // NUNCA `pageId`: esse campo diz "esta Generation é a arte (imagem) da página" (ver arte-da-pagina.ts).
    ...(p.videoDaPagina ? { videoDaPagina: p.videoDaPagina as unknown as Prisma.InputJsonObject } : {}),
  }

  const designDataWithContext =
    typeof p.designData === 'object' && p.designData !== null && !Array.isArray(p.designData)
      ? { ...(p.designData as Record<string, unknown>), __organizationId: p.orgId, __exportAudioConfig: p.audioConfig }
      : { value: p.designData, __organizationId: p.orgId, __exportAudioConfig: p.audioConfig }

  // Colunas de rastreio da trilha (fonte de verdade do mix é o
  // __exportAudioConfig no designData; aqui é o que dá vida à relação
  // MusicLibrary.usedInVideos e a métricas de uso)
  const audioCfg = p.audioConfig
  const usesMusic =
    audioCfg != null && (audioCfg.source === 'library' || audioCfg.source === 'mix') && audioCfg.musicId
  const audioTrackingColumns = audioCfg
    ? {
        audioSource: audioCfg.source,
        musicId: usesMusic ? audioCfg.musicId : null,
        musicStartTime: usesMusic ? audioCfg.startTime : null,
        musicEndTime: usesMusic ? audioCfg.endTime : null,
        audioVolume:
          (audioCfg.source === 'mix' ? audioCfg.volumeMusic ?? audioCfg.volume : audioCfg.volume) / 100,
        audioFadeIn: audioCfg.fadeIn ? audioCfg.fadeInDuration : null,
        audioFadeOut: audioCfg.fadeOut ? audioCfg.fadeOutDuration : null,
        audioLoop: false,
      }
    : {}

  return db.$transaction(async (tx) => {
    const createdGeneration = await tx.generation.create({
      data: {
        templateId: p.templateId,
        projectId: p.project.id,
        createdBy: p.clerkUserId,
        status: 'PROCESSING',
        templateName: p.videoName,
        projectName: p.project.name,
        fieldValues: baseFieldValues,
        resultUrl: p.thumbnailUrl,
      },
    })

    const createdJob = await tx.videoProcessingJob.create({
      data: {
        userId: p.user.id,
        clerkUserId: p.clerkUserId,
        templateId: p.templateId,
        projectId: p.project.id,
        status: 'PENDING',
        webmBlobUrl: p.webmBlobUrl,
        webmFileSize: p.webmFileSize,
        thumbnailUrl: p.thumbnailUrl ?? undefined,
        videoName: p.videoName,
        videoDuration: p.videoDuration,
        videoWidth: p.videoWidth,
        videoHeight: p.videoHeight,
        designData: designDataWithContext as unknown as Prisma.InputJsonValue,
        ...audioTrackingColumns,
        progress: 0,
        creditsDeducted: false,
        creditsUsed: 10,
        generationId: createdGeneration.id,
      },
    })

    await tx.generation.update({
      where: { id: createdGeneration.id },
      data: { fieldValues: { ...baseFieldValues, originalJobId: createdJob.id, generationId: createdGeneration.id } },
    })

    return { jobId: createdJob.id, generationId: createdGeneration.id }
  })
}
