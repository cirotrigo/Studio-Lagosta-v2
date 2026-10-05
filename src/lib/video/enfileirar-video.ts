/**
 * O enfileiramento do vídeo exportado da página, fora da rota HTTP: a rota (que
 * cuida do login, dos créditos, do acesso ao projeto e do upload) e a prova de
 * integração chamam as MESMAS duas funções, na mesma ordem.
 *
 * 1. `prepararVideoDaPagina` decide para onde o vídeo vai, ANTES de qualquer
 *    upload ou cobrança: confere a página, o destino e — na substituição — o
 *    post, e monta `videoDaPagina` (a versão do que foi gravado).
 * 2. `criarJobDeVideo` cria a Generation da galeria e o job, num commit. Na
 *    substituição, é ali, com o post TRAVADO, que o pedido registra o post como
 *    está e os pedidos anteriores dele ainda sem desfecho.
 */
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
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
    // Antes do upload, para recusar cedo; o post como está e os pedidos anteriores são lidos no commit do pedido.
    if (recusa) return { ok: false, status: 409, error: recusa }
  }
  return { ok: true, videoDaPagina }
}

/**
 * Substituir: o post como está e os pedidos anteriores dele ainda sem
 * desfecho, lidos com o post TRAVADO, na transação que cria o pedido. Lidos
 * antes (no preparo), dois envios simultâneos para o mesmo post não se viam: os
 * dois saíam sem predecessora, e qual vídeo ficava no post dependia da ordem em
 * que a fila os processava. Travado, o segundo espera o commit do primeiro e o
 * enxerga — a cadeia termina no mais novo em qualquer ordem.
 */
async function comOPostTravado(
  tx: Prisma.TransactionClient,
  projectId: number,
  video: VideoDaPagina,
): Promise<VideoDaPagina> {
  if (video.destino.tipo !== 'substituir') return video
  const postId = video.destino.postId
  await tx.$queryRaw`SELECT id FROM "SocialPost" WHERE id = ${postId} FOR UPDATE`
  const post = await tx.socialPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      projectId: true,
      pageId: true,
      status: true,
      laterPostId: true,
      updatedAt: true,
      createdAt: true,
      mediaUrls: true,
      videoDaPagina: true,
    },
  })
  const recusa = validarSubstituicaoNaFila(post, {
    projectId,
    pageId: video.pageId,
    ehVideo: post ? postDeVideo(post) : false,
  })
  if (recusa) throw new CreativeError('SUBSTITUICAO_RECUSADA', recusa, 409)
  // Os pedidos deste post (nenhum é mais velho que ele): a troca que fizerem não conta como mudança na agenda.
  const anteriores = await tx.generation.findMany({
    where: {
      projectId,
      status: { not: 'FAILED' },
      createdAt: { gte: post!.createdAt },
      fieldValues: { path: ['videoDaPagina', 'destino', 'postId'], equals: postId },
    },
    select: { id: true, fieldValues: true },
  })
  return {
    ...video,
    esperado: { revisao: post!.updatedAt.toISOString(), mediaUrls: post!.mediaUrls, pageId: video.pageId },
    predecessoras: anteriores
      .filter((g) => {
        const v = lerVideoDaPagina(g.fieldValues)
        return v?.destino.tipo === 'substituir' && !v.resultado
      })
      .map((g) => g.id),
  }
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
}): Promise<{ jobId: string; generationId: string; videoDaPagina: VideoDaPagina | null }> {

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
    const videoDaPagina = p.videoDaPagina ? await comOPostTravado(tx, p.project.id, p.videoDaPagina) : null
    const baseFieldValues = {
      videoExport: true,
      isVideo: true,
      progress: 0,
      thumbnailUrl: p.thumbnailUrl,
      videoDuration: p.videoDuration,
      videoWidth: p.videoWidth,
      videoHeight: p.videoHeight,
      // NUNCA `pageId`: esse campo diz "esta Generation é a arte (imagem) da página" (ver arte-da-pagina.ts).
      ...(videoDaPagina ? { videoDaPagina: videoDaPagina as unknown as Prisma.InputJsonObject } : {}),
    }
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

    return { jobId: createdJob.id, generationId: createdGeneration.id, videoDaPagina }
  }, { maxWait: 10_000, timeout: 20_000 })
}
