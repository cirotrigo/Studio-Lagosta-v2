/**
 * Coleta de métricas de FEED via Windsor.ai — para os clientes SEM token
 * próprio do Instagram (o buraco medido em 30/08/2026: Real, Bacana e By
 * Rock invisíveis para o relatório e para a aba Métricas).
 *
 * Grava nas MESMAS casas do coletor por token (`feed-insights.ts`), de
 * propósito — o Windsor é segunda FONTE, nunca segunda VERDADE:
 * - `InstagramFeed` chaveada por mediaId (o media id real do Instagram, o
 *   mesmo que a Graph API devolve);
 * - `SocialPost.analytics*` para posts do Studio casados por
 *   `instagramMediaId`.
 *
 * Regra de precedência: TOKEN VENCE. Projeto com `instagramAccessToken` fica
 * fora desta coleta — as duas fontes escrevendo na mesma linha divergiriam
 * por minutos de defasagem, e a Graph API direta é a mais fresca. O Windsor
 * preenche só quem não tem token E tem a conta conectada lá.
 *
 * Uma requisição cobre TODAS as contas (as linhas vêm com `account_name` =
 * username); o corte por projeto é feito aqui. `media_type` do Windsor traz
 * "REELS", que a Graph API chama de VIDEO — o enum do banco só tem
 * IMAGE/VIDEO/CAROUSEL_ALBUM, então REELS vira VIDEO no mapeamento.
 */
import { db } from '@/lib/db'
import type { InstagramMediaType } from '@prisma/client'
import { isWindsorConfigured, num, texto, windsorGet } from './client'

const FIELDS_FEED = [
  'account_name',
  'media_id',
  'media_type',
  'media_caption',
  'media_url',
  'media_thumbnail_url',
  'media_permalink',
  'timestamp',
  'media_like_count',
  'media_comments_count',
  'media_engagement',
  'media_reach',
  'media_saved',
  'media_views',
]

/** REELS → VIDEO (paridade com a Graph API); fora do enum → null (pula). */
function tipoDoBanco(mediaType: string | null): InstagramMediaType | null {
  if (mediaType === 'IMAGE' || mediaType === 'VIDEO' || mediaType === 'CAROUSEL_ALBUM') return mediaType
  if (mediaType === 'REELS') return 'VIDEO'
  return null
}

export interface ResumoWindsorProjeto {
  projectId: number
  username: string
  midias: number
  gravadas: number
  postsCasados: number
  erro?: string
}

export interface ResumoColetaWindsor {
  configurado: boolean
  linhasDaApi: number
  /** Usernames vindos do Windsor sem projeto elegível (com token, ou sem cadastro). */
  ignorados: string[]
  porProjeto: ResumoWindsorProjeto[]
  erro?: string
}

/**
 * Coleta o feed dos clientes sem token via Windsor e grava.
 *
 * `dryRun` monta tudo e não escreve nada — é o modo do script de validação.
 */
export async function coletarFeedViaWindsor(opts?: {
  sinceDays?: number
  dryRun?: boolean
}): Promise<ResumoColetaWindsor> {
  const resumo: ResumoColetaWindsor = { configurado: isWindsorConfigured(), linhasDaApi: 0, ignorados: [], porProjeto: [] }
  if (!resumo.configurado) return resumo

  const projetos = await db.project.findMany({
    where: { status: 'ACTIVE', instagramAccessToken: null, instagramUsername: { not: null } },
    select: { id: true, name: true, instagramUsername: true },
  })
  if (!projetos.length) return resumo

  const porUsername = new Map(projetos.map((p) => [p.instagramUsername as string, p]))

  let linhas: Array<Record<string, unknown>>
  try {
    linhas = await windsorGet('instagram', {
      fields: FIELDS_FEED,
      datePreset: `last_${opts?.sinceDays ?? 60}d`,
    })
  } catch (erro) {
    resumo.erro = erro instanceof Error ? erro.message : String(erro)
    return resumo
  }
  resumo.linhasDaApi = linhas.length

  const orgs = await db.organizationProject.findMany({
    where: { projectId: { in: projetos.map((p) => p.id) } },
    select: { projectId: true, organizationId: true },
  })
  const orgDe = new Map(orgs.map((o) => [o.projectId, o.organizationId]))

  const porProjeto = new Map<number, ResumoWindsorProjeto>()
  const ignorados = new Set<string>()
  const agora = new Date()

  for (const linha of linhas) {
    const username = texto(linha.account_name)
    const mediaId = texto(linha.media_id)
    if (!username || !mediaId) continue

    const projeto = porUsername.get(username)
    if (!projeto) {
      ignorados.add(username)
      continue
    }

    const tipo = tipoDoBanco(texto(linha.media_type))
    const publishedAt = texto(linha.timestamp) ? new Date(linha.timestamp as string) : null
    if (!tipo || !publishedAt || Number.isNaN(publishedAt.getTime())) continue

    let r = porProjeto.get(projeto.id)
    if (!r) {
      r = { projectId: projeto.id, username, midias: 0, gravadas: 0, postsCasados: 0 }
      porProjeto.set(projeto.id, r)
    }
    r.midias++
    if (opts?.dryRun) continue

    const metricas = {
      likes: num(linha.media_like_count),
      comments: num(linha.media_comments_count),
      engagement: num(linha.media_engagement),
      reach: num(linha.media_reach),
      saved: num(linha.media_saved),
      // `views` substituiu `impressions` (descontinuada em 03/2025) — a coluna
      // guarda views, mesmo precedente do coletor por token.
      impressions: num(linha.media_views),
    }
    const permalink = texto(linha.media_permalink) ?? ''

    try {
      await db.instagramFeed.upsert({
        where: { mediaId },
        create: {
          projectId: projeto.id,
          organizationId: orgDe.get(projeto.id) ?? null,
          mediaId,
          username,
          mediaType: tipo,
          caption: texto(linha.media_caption),
          mediaUrl: texto(linha.media_url) ?? texto(linha.media_thumbnail_url) ?? permalink,
          thumbnailUrl: texto(linha.media_thumbnail_url),
          permalink,
          publishedAt,
          capturedAt: agora,
          ...metricas,
        },
        // Mesmo contrato do coletor por token: falha pontual de um número não
        // zera o que já foi coletado — aqui os campos vêm juntos, então o
        // update é integral, mas mantém capturedAt como marca da rodada.
        update: { ...metricas, capturedAt: agora },
      })
      r.gravadas++

      const casados = await db.socialPost.updateMany({
        where: { projectId: projeto.id, instagramMediaId: mediaId },
        data: {
          analyticsLikes: metricas.likes,
          analyticsComments: metricas.comments,
          analyticsEngagement: metricas.engagement,
          analyticsReach: metricas.reach,
          analyticsImpressions: metricas.impressions,
          analyticsFetchedAt: agora,
        },
      })
      r.postsCasados += casados.count
    } catch (erro) {
      r.erro = erro instanceof Error ? erro.message : String(erro)
    }
  }

  resumo.ignorados = [...ignorados].sort()
  resumo.porProjeto = [...porProjeto.values()]
  return resumo
}
