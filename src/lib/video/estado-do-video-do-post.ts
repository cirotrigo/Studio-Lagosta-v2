/**
 * O estado do VÍDEO de um post da agenda: se a página mudou depois dele
 * (`videoDesatualizado`) e como anda a substituição pedida pelo editor.
 *
 * Lido no GET do post e na faixa da página (`agenda-das-paginas`), pela mesma
 * função — a agenda e o editor dizem a mesma coisa sobre o mesmo post.
 */
import { db } from '@/lib/db'
import { lerVideoDaPagina, type ResultadoDoDestino } from './destino-do-video'
import { versaoDoVideo } from './versao-do-video'

export type Substituicao =
  | { estado: 'em-producao'; generationId: string; desde: string }
  | { estado: 'feita'; generationId: string; em: string }
  | { estado: 'recusada' | 'falhou'; generationId: string; em: string | null; motivo: string }

export interface EstadoDoVideo {
  /** A página de agora não é a que o vídeo gravou. Sem como saber (vídeo antigo), `false`. */
  videoDesatualizado: boolean
  /** A substituição mais recente deste post (últimos 14 dias), ou nenhuma. */
  substituicao: Substituicao | null
}

export const JANELA_DA_SUBSTITUICAO_MS = 14 * 24 * 60 * 60_000

interface LinhaDeSubstituicao {
  id: string
  status: string
  createdAt: Date
  errorMessage?: string | null
  video: unknown
}

/** Puro: a linha mais recente (a lista vem em ordem decrescente) diz o estado. */
export function estadoDaSubstituicao(linha: LinhaDeSubstituicao | undefined): Substituicao | null {
  if (!linha) return null
  const video = lerVideoDaPagina({ videoDaPagina: linha.video })
  const resultado: ResultadoDoDestino | undefined = video?.resultado
  if (resultado?.ok === true) return { estado: 'feita', generationId: linha.id, em: resultado.em }
  if (resultado && resultado.ok === false) {
    return { estado: 'recusada', generationId: linha.id, em: resultado.em, motivo: resultado.motivo }
  }
  if (linha.status === 'FAILED') {
    return {
      estado: 'falhou',
      generationId: linha.id,
      em: null,
      motivo: linha.errorMessage || 'O vídeo novo não ficou pronto.',
    }
  }
  return { estado: 'em-producao', generationId: linha.id, desde: linha.createdAt.toISOString() }
}

interface PostDoVideo {
  id: string
  pageId: string | null
  generationId: string | null
}

export async function estadoDoVideoDosPosts(
  projectId: number,
  posts: PostDoVideo[],
): Promise<Map<string, EstadoDoVideo>> {
  const resultado = new Map<string, EstadoDoVideo>()
  if (posts.length === 0) return resultado

  const pageIds = [...new Set(posts.map((p) => p.pageId).filter((id): id is string => !!id))]
  const genIds = [...new Set(posts.map((p) => p.generationId).filter((id): id is string => !!id))]

  const [paginas, geracoes, substituicoes] = await Promise.all([
    pageIds.length
      ? db.page.findMany({
          where: { id: { in: pageIds }, Template: { projectId } },
          select: { id: true, width: true, height: true, background: true, layers: true, audio: true },
        })
      : [],
    // Só a chave do vídeo: `fieldValues` inteiro traria o `designData` do export.
    genIds.length
      ? db.$queryRaw<Array<{ id: string; video: unknown }>>`
          SELECT g.id, g."fieldValues"->'videoDaPagina' AS video
          FROM "Generation" g
          WHERE g.id = ANY(${genIds}) AND g."projectId" = ${projectId}
        `
      : [],
    db.$queryRaw<Array<LinhaDeSubstituicao & { postId: string }>>`
      SELECT g.id, g.status::text AS status, g."createdAt",
             g."fieldValues"->>'errorMessage' AS "errorMessage",
             g."fieldValues"->'videoDaPagina' AS video,
             g."fieldValues"->'videoDaPagina'->'destino'->>'postId' AS "postId"
      FROM "Generation" g
      WHERE g."projectId" = ${projectId}
        AND g."createdAt" >= ${new Date(Date.now() - JANELA_DA_SUBSTITUICAO_MS)}
        AND g."fieldValues"->'videoDaPagina'->'destino'->>'tipo' = 'substituir'
        AND g."fieldValues"->'videoDaPagina'->'destino'->>'postId' = ANY(${posts.map((p) => p.id)})
      ORDER BY g."createdAt" DESC
    `,
  ])

  const versaoDaPaginaAtual = new Map<string, string | null>()
  for (const p of paginas as Array<{ id: string } & Parameters<typeof versaoDoVideo>[0]>) {
    versaoDaPaginaAtual.set(p.id, versaoDoVideo(p))
  }
  const versaoDoVideoGravado = new Map<string, string | null>()
  for (const g of geracoes as Array<{ id: string; video: unknown }>) {
    versaoDoVideoGravado.set(g.id, lerVideoDaPagina({ videoDaPagina: g.video })?.versao ?? null)
  }

  for (const post of posts) {
    const gravada = post.generationId ? versaoDoVideoGravado.get(post.generationId) ?? null : null
    const atual = post.pageId ? versaoDaPaginaAtual.get(post.pageId) ?? null : null
    resultado.set(post.id, {
      videoDesatualizado: gravada !== null && atual !== null && gravada !== atual,
      substituicao: estadoDaSubstituicao(substituicoes.find((s) => s.postId === post.id)),
    })
  }
  return resultado
}
