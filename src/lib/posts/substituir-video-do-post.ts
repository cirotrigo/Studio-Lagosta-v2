/**
 * Troca o vídeo de um post da agenda pelo vídeo novo que a página exportou —
 * ou recusa, dizendo por quê. Tudo numa transação que quem chama abriu já
 * segurando o arrendamento do job; aqui se trava o POST também.
 *
 * Idempotente pelo desfecho: o `resultado` gravado na Generation do vídeo novo
 * sai no MESMO commit da troca (e do registro no histórico do post). Uma
 * repetição do job — caiu depois da troca e antes de terminar — encontra o
 * desfecho e o devolve, sem trocar de novo e sem recusar a própria troca.
 *
 * A decisão é a pura (`decidirSubstituicao`): o post precisa estar como estava
 * quando o vídeo foi pedido (`esperado.revisao`), ou como o deixou um pedido
 * ANTERIOR do mesmo post que já trocou o vídeo (`predecessoras`) — é o que faz
 * a cadeia terminar no vídeo mais novo em qualquer ordem de chegada. Qualquer
 * mudança feita na agenda no meio (mídia trocada, vídeo antigo restaurado,
 * texto, horário) muda `updatedAt`, e a mudança de lá vence.
 */
import type { Prisma } from '@prisma/client'
import { isVideoUrl } from '@/lib/media-type'
import { mesclarFieldValuesDaArte } from '@/lib/creatives/mesclar-field-values'
import { comoCopiaDaPagina } from '@/lib/posts/copy-segue-a-pagina'
import { postDeVideo } from '@/lib/posts/post-de-video'
import {
  decidirSubstituicao,
  lerVideoDaPagina,
  midiasDepoisDaTroca,
  revisoesAceitas,
  type ResultadoDoDestino,
} from '@/lib/video/destino-do-video'

export async function substituirVideoDoPost(
  tx: Prisma.TransactionClient,
  params: {
    generationId: string
    mp4Url: string
    /** A copy de texto do que o vídeo GRAVOU (não da página de agora). */
    copyGravada: Record<string, string> | null
    agora?: Date
  },
): Promise<ResultadoDoDestino> {
  const gen = await tx.generation.findUnique({ where: { id: params.generationId }, select: { fieldValues: true } })
  const video = lerVideoDaPagina(gen?.fieldValues)
  if (!video || video.destino.tipo !== 'substituir' || !video.esperado) {
    throw new Error('Esta Generation não é um pedido de substituição de vídeo.')
  }
  if (video.resultado) return video.resultado

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
      mediaUrls: true,
      renderedImageUrl: true,
      videoDaPagina: true,
    },
  })

  const predecessoras = video.predecessoras?.length
    ? await tx.generation.findMany({ where: { id: { in: video.predecessoras } }, select: { fieldValues: true } })
    : []
  const aceitas = revisoesAceitas(
    video.esperado,
    predecessoras.map((g) => lerVideoDaPagina(g.fieldValues)?.resultado),
  )
  const decisao = decidirSubstituicao(post, video.esperado, aceitas, post ? postDeVideo(post) : false)
  const em = (params.agora ?? new Date()).toISOString()

  let resultado: ResultadoDoDestino
  if (decisao.aceitar === false) {
    resultado = { ok: false, motivo: decisao.motivo, em }
    if (post) {
      await tx.postLog.create({
        data: {
          postId,
          event: 'EDITED',
          message: `O vídeo novo da página não foi colocado neste post: ${decisao.motivo}`,
          metadata: { generationId: params.generationId, substituicaoDeVideo: 'recusada' },
        },
      })
    }
  } else {
    const anterior = post!.mediaUrls.find((u) => isVideoUrl(u)) ?? null
    const atualizado = await tx.socialPost.update({
      where: { id: postId },
      data: {
        mediaUrls: midiasDepoisDaTroca(post!.mediaUrls, anterior, params.mp4Url),
        generationId: params.generationId,
        videoDaPagina: true,
        renderStatus: 'NOT_NEEDED',
        ...(post!.renderedImageUrl && post!.renderedImageUrl === anterior ? { renderedImageUrl: params.mp4Url } : {}),
        ...(params.copyGravada ? { slotValues: comoCopiaDaPagina(params.copyGravada) as Prisma.InputJsonValue } : {}),
      },
      select: { updatedAt: true },
    })
    resultado = { ok: true, revisaoDepois: atualizado.updatedAt.toISOString(), em }
    await tx.postLog.create({
      data: {
        postId,
        event: 'EDITED',
        message: 'Vídeo substituído pelo novo export da página.',
        metadata: { generationId: params.generationId, anterior, novo: params.mp4Url, substituicaoDeVideo: 'feita' },
      },
    })
  }

  // O objeto INTEIRO: o merge do banco é raso, e `videoDaPagina` é aninhado.
  await mesclarFieldValuesDaArte(tx, params.generationId, { videoDaPagina: { ...video, resultado } })
  return resultado
}
