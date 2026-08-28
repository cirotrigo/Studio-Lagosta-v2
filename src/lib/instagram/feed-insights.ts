/**
 * Coleta de métricas do FEED (carrossel, imagem, reel) via Graph API.
 *
 * Preenche dois lugares, de propósito:
 * - `InstagramFeed`, chaveada pelo media id do Instagram: cobre TODO o feed da
 *   conta, inclusive posts publicados fora do Studio (que é a maior parte do
 *   histórico dos clientes). A tabela existia desde sempre para um webhook
 *   externo que nunca disparou — estava vazia em 28/08/2026.
 * - `SocialPost.analytics*`, para posts do Studio casados por
 *   `instagramMediaId` (gravado pelo executor ao publicar): é o que a UI de
 *   analytics por post já lê.
 *
 * Diferente de stories, métricas de feed NÃO expiram — a coleta diária só
 * atualiza números que continuam crescendo. Só alcança projetos com token
 * próprio (Instagram Login): o token global não enxerga as contas dos
 * clientes, que vivem em portfólios separados.
 */
import { db } from '@/lib/db'
import {
  InstagramGraphApiClient,
  type InstagramMediaItem,
} from './graph-api-client'

const TIPOS_VALIDOS = new Set(['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM'])
const PAUSA_ENTRE_INSIGHTS_MS = 120

export interface ResumoColetaProjeto {
  projectId: number
  midias: number
  comInsights: number
  falhasInsights: number
  postsCasados: number
  interrompido: boolean
  erro?: string
}

/**
 * Coleta as mídias de feed de UM projeto e grava métricas.
 *
 * @param prazoMs timestamp absoluto (Date.now()-like) após o qual a coleta
 *   para de puxar mídias novas e devolve `interrompido: true`.
 */
export async function coletarFeedDoProjeto(
  projeto: { id: number; instagramAccessToken: string | null; instagramUsername?: string | null },
  opts?: { sinceDays?: number; max?: number; prazoMs?: number },
): Promise<ResumoColetaProjeto> {
  const resumo: ResumoColetaProjeto = {
    projectId: projeto.id,
    midias: 0,
    comInsights: 0,
    falhasInsights: 0,
    postsCasados: 0,
    interrompido: false,
  }

  if (!projeto.instagramAccessToken) {
    resumo.erro = 'projeto sem token próprio do Instagram'
    return resumo
  }

  const cliente = new InstagramGraphApiClient(projeto.instagramAccessToken)

  let username = projeto.instagramUsername ?? ''
  let contaId = 'me'
  try {
    const conta = await cliente.getOwnAccount()
    username = conta.username || username
    contaId = conta.id || contaId
  } catch {
    // segue com o username do cadastro; o accountPath resolve `me` para IGAA
  }

  const midias = await cliente.getAccountMedia(contaId, {
    sinceDays: opts?.sinceDays ?? 60,
    max: opts?.max ?? 200,
  })
  resumo.midias = midias.length

  const organizationId =
    (
      await db.organizationProject.findFirst({
        where: { projectId: projeto.id },
        select: { organizationId: true },
      })
    )?.organizationId ?? null

  for (const m of midias) {
    if (opts?.prazoMs && Date.now() > opts.prazoMs) {
      resumo.interrompido = true
      break
    }
    if (!TIPOS_VALIDOS.has(m.media_type)) continue

    const likes = m.like_count ?? 0
    const comments = m.comments_count ?? 0

    let insights: { reach: number; saved?: number; shares?: number; views?: number; engagement: number } | null = null
    try {
      insights = await cliente.getMediaInsights(m.id, { likes, comments })
      resumo.comInsights++
    } catch {
      resumo.falhasInsights++
    }
    await new Promise((ok) => setTimeout(ok, PAUSA_ENTRE_INSIGHTS_MS))

    const engagement = insights?.engagement ?? likes + comments
    const agora = new Date()

    // `views` substituiu `impressions`, descontinuada em março/2025 — a coluna
    // guarda views, mesmo precedente do cron de stories.
    const metricas = {
      likes,
      comments,
      engagement,
      ...(insights
        ? {
            impressions: insights.views ?? 0,
            reach: insights.reach ?? 0,
            saved: insights.saved ?? 0,
          }
        : {}),
    }

    await db.instagramFeed.upsert({
      where: { mediaId: m.id },
      create: {
        projectId: projeto.id,
        organizationId,
        mediaId: m.id,
        username,
        mediaType: m.media_type,
        caption: m.caption ?? null,
        mediaUrl: m.media_url ?? m.thumbnail_url ?? m.permalink ?? '',
        thumbnailUrl: m.thumbnail_url ?? null,
        permalink: m.permalink ?? '',
        publishedAt: new Date(m.timestamp),
        capturedAt: agora,
        ...metricas,
      },
      // Sem insights, alcance/salvos anteriores ficam como estão — zerar um
      // número já coletado por causa de uma falha pontual seria regressão.
      update: { ...metricas, capturedAt: agora },
    })

    const casados = await db.socialPost.updateMany({
      where: { projectId: projeto.id, instagramMediaId: m.id },
      data: {
        analyticsLikes: likes,
        analyticsComments: comments,
        analyticsEngagement: engagement,
        ...(insights
          ? {
              analyticsReach: insights.reach ?? 0,
              analyticsImpressions: insights.views ?? 0,
              analyticsShares: insights.shares ?? null,
            }
          : {}),
        analyticsFetchedAt: agora,
      },
    })
    resumo.postsCasados += casados.count
  }

  return resumo
}

/** Coleta todos os projetos ativos com token próprio, respeitando o orçamento. */
export async function coletarFeedDeTodos(opts?: {
  sinceDays?: number
  prazoMs?: number
}): Promise<ResumoColetaProjeto[]> {
  const projetos = await db.project.findMany({
    where: { status: 'ACTIVE', instagramAccessToken: { not: null } },
    select: { id: true, name: true, instagramAccessToken: true, instagramUsername: true },
    orderBy: { id: 'asc' },
  })

  const resumos: ResumoColetaProjeto[] = []
  for (const p of projetos) {
    if (opts?.prazoMs && Date.now() > opts.prazoMs) {
      resumos.push({
        projectId: p.id,
        midias: 0,
        comInsights: 0,
        falhasInsights: 0,
        postsCasados: 0,
        interrompido: true,
        erro: 'orçamento de tempo esgotado antes de começar',
      })
      continue
    }
    try {
      resumos.push(await coletarFeedDoProjeto(p, { sinceDays: opts?.sinceDays, prazoMs: opts?.prazoMs }))
    } catch (error) {
      resumos.push({
        projectId: p.id,
        midias: 0,
        comInsights: 0,
        falhasInsights: 0,
        postsCasados: 0,
        interrompido: false,
        erro: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return resumos
}
