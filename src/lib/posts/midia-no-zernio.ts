/**
 * Trocar a arte de um post que JÁ ESTÁ no Zernio, no mesmo post de lá.
 *
 * Até 11/11/2026 `laterPostId` não nulo significava arte intocável: o que vai ao
 * ar é a cópia do Zernio, e trocar `mediaUrls` aqui só faria a agenda mentir.
 * Isso continua verdade para quem escreve SÓ no banco. Este módulo é a porta
 * que escreve no Zernio primeiro: quem troca a arte de post entregue passa por
 * aqui, confere a resposta, e só então grava o banco com o que o Zernio devolveu.
 *
 * Sem `@/lib/db` de propósito (regra da casa para módulo testável).
 */

import { getLaterClient, LaterNotFoundError } from '@/lib/later'
import { CreativeError } from '@/lib/creatives/errors'
import { isVideoUrl } from '@/lib/media-type'
import { FREEZE_WINDOW_MS } from './freeze-window'

export interface PostNoZernio {
  laterPostId?: string | null
  lateStatus?: string | null
  scheduledDatetime?: Date | string | null
}

export interface RecusaNoZernio {
  codigo: string
  mensagem: string
  status: number
}

const formatarBRT = (data: Date) =>
  data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

/**
 * A arte deste post (que tem `laterPostId`) ainda pode ser trocada no Zernio? `null` = pode.
 *
 * Rascunho de lá pode sempre: não publica enquanto ninguém aprovar. Agendado pode
 * até a janela de congelamento (5 min antes): depois disso o Zernio pode já
 * estar publicando, e a troca seria uma corrida que a agenda perderia calada.
 */
export function recusaDeArteNoZernio(post: PostNoZernio, agora: Date = new Date()): RecusaNoZernio | null {
  if (post.lateStatus === 'draft') return null
  if (post.lateStatus !== 'scheduled') {
    return {
      codigo: 'POST_SAINDO',
      mensagem: 'Este post já saiu para publicação e a arte dele não muda mais.',
      status: 409,
    }
  }
  const quando = post.scheduledDatetime ? new Date(post.scheduledDatetime) : null
  if (quando && quando.getTime() - agora.getTime() <= FREEZE_WINDOW_MS) {
    return {
      codigo: 'POST_CONGELADO',
      mensagem: `Este post publica em instantes (${formatarBRT(quando)}) e a arte dele não muda mais.`,
      status: 409,
    }
  }
  return null
}

const urlsDe = (post: any): string[] => (post?.media ?? []).map((m: any) => m?.url).filter(Boolean)

/**
 * Troca UMA mídia do post no Zernio e devolve a lista de URLs que o Zernio passou a ter.
 *
 * Lê o post de lá antes de escrever: os outros slides voltam exatamente como
 * estão (ordem, tipo e URL), e o estado conferido é o de lá, não o do banco.
 * Lança `CreativeError` quando não troca; nesse caso nada mudou no Zernio, salvo
 * `ZERNIO_NAO_CONFIRMOU`, em que o Zernio aceitou a chamada e devolveu outra coisa.
 */
export async function trocarMidiaNoZernio(params: {
  laterPostId: string
  /** Posição a trocar (0 = a primeira). */
  indice: number
  /** A arte nova, em host público (o Blob do Studio). */
  url: string
  /** Quantas mídias o Studio acha que o post tem. Divergiu de lá: recusa. */
  totalEsperado: number
}): Promise<string[]> {
  const { laterPostId, indice, url, totalEsperado } = params
  const client = getLaterClient()

  const falha = (error: unknown, oQue: string): never => {
    if (error instanceof LaterNotFoundError) {
      throw new CreativeError(
        'ESTADO_INDEFINIDO',
        'Este post sumiu da fila de publicação e não dá para saber se chegou a publicar. Aguarde alguns minutos a sincronização e confira a agenda (e o Instagram) antes de mexer nele.',
        409,
      )
    }
    console.error(`[MIDIA_NO_ZERNIO] Falha ao ${oQue} o post ${laterPostId}:`, error)
    throw new CreativeError('ZERNIO_INDISPONIVEL', 'Não foi possível trocar a arte no Zernio. Tente de novo em instantes.', 502)
  }

  let atual: any
  try {
    atual = await client.getPost(laterPostId)
  } catch (error) {
    falha(error, 'ler')
  }

  const recusa = recusaDeArteNoZernio({ lateStatus: atual.status, scheduledDatetime: atual.publishAt })
  if (recusa) throw new CreativeError(recusa.codigo, recusa.mensagem, recusa.status)

  const midias: Array<{ type?: string; url: string }> = (atual.media ?? []).filter((m: any) => m?.url)
  if (midias.length !== totalEsperado || indice >= midias.length) {
    throw new CreativeError(
      'POST_MUDOU_NO_MEIO',
      `No Zernio este post tem ${midias.length} mídia(s), e na agenda ${totalEsperado}. Aguarde alguns minutos a sincronização e peça de novo.`,
      409,
    )
  }

  const mediaItems = midias.map((m, i) =>
    i === indice
      ? { type: 'image' as const, url }
      : { type: (m.type === 'video' || isVideoUrl(m.url) ? 'video' : 'image') as 'image' | 'video', url: m.url },
  )

  let depois: any
  try {
    depois = await client.updatePost(laterPostId, { mediaItems })
  } catch (error) {
    falha(error, 'atualizar')
  }

  // O Zernio descarta o que não entende em vez de recusar: sem conferir, "não
  // lançou" passaria por "trocou". Estado e quantidade têm de ser os de antes.
  const urls = urlsDe(depois)
  if (depois.status !== atual.status || urls.length !== midias.length) {
    throw new CreativeError(
      'ZERNIO_NAO_CONFIRMOU',
      `O Zernio não confirmou a troca da arte (o post ficou como "${depois.status ?? 'desconhecido'}", com ${urls.length} mídia(s)). Confira o post no Zernio antes de tentar de novo.`,
      502,
    )
  }
  return urls
}
