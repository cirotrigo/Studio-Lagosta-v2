/**
 * Dá uma arte de galeria (Generation) ao post que veio do Zernio, para a melhoria com IA ter de onde partir.
 *
 * Post importado do Zernio é imagem pronta: sem página, sem Generation, com a mídia no CDN de lá. A melhoria precisa
 * das duas coisas que faltam: uma Generation de origem e a imagem no Blob do Studio (o pipeline só lê o nosso Blob).
 * Isto é feito SOB DEMANDA, quando alguém pede a melhoria: copiar toda arte importada encheria a galeria de cada
 * cliente com o que ninguém vai mexer.
 *
 * A arte trazida fica na galeria e é a ANTERIOR da melhoria: para desfazer, troca-se a arte do post de volta por ela
 * (`trocar-arte-do-post` com o `generationId` devolvido aqui).
 */

import { db } from '@/lib/db'
import type { CanalDaArte } from '@/lib/creatives/canal'
import { CreativeError } from '@/lib/creatives/errors'
import { importarArte } from '@/lib/creatives/arte-enviada'
import { baixarImagemExterna } from '@/lib/creatives/baixar-imagem-externa'
import { isVideoUrl } from '@/lib/media-type'
import { formatarBRT } from './agenda-acoes'
import { recusaDeArteNoZernio } from './midia-no-zernio'

export async function trazerArteDoPostParaGaleria(params: {
  projectId: number
  postId: string
  /** Qual imagem do post (0 = a primeira). */
  indice?: number | null
  /** `User.id` INTERNO de quem pediu; sem isso, o dono do projeto. */
  createdBy?: string | null
  canal?: CanalDaArte | null
}): Promise<{ generationId: string; url: string; jaEstava: boolean }> {
  const { projectId, postId } = params
  const indice = params.indice ?? 0

  const post = await db.socialPost.findFirst({
    where: { id: postId, projectId },
    select: {
      id: true,
      status: true,
      laterPostId: true,
      lateStatus: true,
      scheduledDatetime: true,
      mediaUrls: true,
      postType: true,
    },
  })
  if (!post) throw new CreativeError('POST_NAO_ENCONTRADO', 'Post não encontrado neste projeto.', 404)
  if (!post.laterPostId) {
    throw new CreativeError(
      'POST_NAO_ESTA_NO_ZERNIO',
      'Este post não veio do Zernio: a arte dele já está na galeria do Studio. Use o generationId que ver-agenda mostra.',
      400,
    )
  }
  if (post.status !== 'DRAFT' && post.status !== 'SCHEDULED') {
    throw new CreativeError('POST_NAO_MELHORAVEL', `Este post não pode ser melhorado (status ${post.status}).`, 400)
  }
  // Antes de baixar e de pôr qualquer coisa na galeria: arte que não vai poder trocar não precisa ser trazida.
  const recusa = recusaDeArteNoZernio(post)
  if (recusa) throw new CreativeError(recusa.codigo, recusa.mensagem, recusa.status)

  const midia = post.mediaUrls[indice]
  if (!Number.isInteger(indice) || indice < 0 || !midia) {
    throw new CreativeError('SLIDE_INVALIDO', `Este post tem ${post.mediaUrls.length} imagem(ns); a ${indice + 1} não existe.`, 400)
  }
  if (isVideoUrl(midia)) {
    throw new CreativeError('POST_DE_VIDEO', 'Esta mídia é um vídeo, e a melhoria com IA só trabalha com imagem.', 400)
  }

  // A mídia já é uma arte da galeria (a melhoria anterior, uma troca de arte): é dela que se parte.
  const existente = await db.generation.findFirst({
    where: { projectId, resultUrl: midia },
    orderBy: { createdAt: 'desc' },
    select: { id: true, resultUrl: true },
  })
  if (existente?.resultUrl) return { generationId: existente.id, url: existente.resultUrl, jaEstava: true }

  const { bytes } = await baixarImagemExterna(midia)
  const quando = post.scheduledDatetime ? ` — ${formatarBRT(post.scheduledDatetime)}` : ''
  const arte = await importarArte({
    projectId,
    bytes,
    fileName: `post-do-zernio-${post.id}-${indice + 1}.png`,
    name: `${post.postType === 'STORY' ? 'Story' : 'Post'} do Zernio${quando}`,
    origem: `post-do-zernio:${post.id}#${indice}`,
    createdBy: params.createdBy ?? null,
    canal: params.canal ?? null,
    // ponytail: sem `textos`, a melhoria fica sem régua de texto (a arte veio pronta e ninguém aqui conhece a copy).
    // Se a IA começar a inventar serviço nessas artes, o caminho é transcrever por visão antes de importar.
  })

  // A coluna do post é a arte do PRIMEIRO slide (e só dele). Só preenche o que está vazio.
  if (indice === 0) {
    await db.socialPost.updateMany({ where: { id: post.id, generationId: null }, data: { generationId: arte.generationId } })
  }
  return { generationId: arte.generationId, url: arte.url, jaEstava: false }
}
