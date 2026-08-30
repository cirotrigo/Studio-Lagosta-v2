/**
 * Coleta de avaliações do Google Meu Negócio via Windsor.ai → `AvaliacaoGoogle`.
 *
 * Upsert pela chave natural (`reviewId`). O update toca só o que o GOOGLE é
 * dono (nota, texto, resposta publicada, datas) — nunca `respostaSugerida`
 * nem `avisadaEm`, que são NOSSOS (rascunho da equipe e trava de aviso).
 *
 * O texto é gravado SEM o sufixo "(Translated by Google)": a tradução
 * duplica o conteúdo e só atrapalha rascunho e UI.
 */
import { db } from '@/lib/db'
import { GMB_POR_PROJETO } from './contas'
import { isWindsorConfigured, texto, windsorGet } from './client'

const ESTRELAS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }

const FIELDS = [
  'account_id',
  'account_name',
  'review_id',
  'review_reviewer',
  'review_star_rating',
  'review_comment',
  'review_create_time',
  'review_update_time',
  'review_reply_comment',
  'review_reply_update_time',
]

export function limparTextoDeAvaliacao(t: string | null): string | null {
  if (!t) return null
  const i = t.indexOf('\n\n(Translated by Google)')
  const limpo = (i > -1 ? t.slice(0, i) : t).trim()
  return limpo.length ? limpo : null
}

export interface ResumoColetaAvaliacoes {
  configurado: boolean
  linhasDaApi: number
  gravadas: number
  porProjeto: Array<{ projectId: number; nome: string; avaliacoes: number }>
  erro?: string
}

export async function coletarAvaliacoesViaWindsor(opts?: {
  sinceDays?: number
  dryRun?: boolean
}): Promise<ResumoColetaAvaliacoes> {
  const resumo: ResumoColetaAvaliacoes = { configurado: isWindsorConfigured(), linhasDaApi: 0, gravadas: 0, porProjeto: [] }
  if (!resumo.configurado) return resumo

  let linhas: Array<Record<string, unknown>>
  try {
    linhas = await windsorGet('google_my_business', {
      fields: FIELDS,
      datePreset: `last_${opts?.sinceDays ?? 30}d`,
    })
  } catch (erro) {
    resumo.erro = erro instanceof Error ? erro.message : String(erro)
    return resumo
  }
  resumo.linhasDaApi = linhas.length

  const porProjeto = new Map<number, { projectId: number; nome: string; avaliacoes: number }>()
  const agora = new Date()

  for (const linha of linhas) {
    const reviewId = texto(linha.review_id)
    const local = GMB_POR_PROJETO.find((g) => g.accountName === texto(linha.account_name))
    const estrelas = ESTRELAS[texto(linha.review_star_rating) ?? '']
    const criadaEm = texto(linha.review_create_time) ? new Date(linha.review_create_time as string) : null
    if (!reviewId || !local || !estrelas || !criadaEm || Number.isNaN(criadaEm.getTime())) continue

    let r = porProjeto.get(local.projectId)
    if (!r) {
      r = { projectId: local.projectId, nome: local.nome, avaliacoes: 0 }
      porProjeto.set(local.projectId, r)
    }
    r.avaliacoes++
    if (opts?.dryRun) continue

    const textoResposta = limparTextoDeAvaliacao(texto(linha.review_reply_comment))
    const doGoogle = {
      estrelas,
      autor: texto(linha.review_reviewer),
      texto: limparTextoDeAvaliacao(texto(linha.review_comment)),
      atualizadaEm: texto(linha.review_update_time) ? new Date(linha.review_update_time as string) : null,
      textoResposta,
      respondidaEm:
        textoResposta && texto(linha.review_reply_update_time)
          ? new Date(linha.review_reply_update_time as string)
          : null,
      capturedAt: agora,
    }

    try {
      await db.avaliacaoGoogle.upsert({
        where: { reviewId },
        create: {
          projectId: local.projectId,
          locationId: local.locationId,
          reviewId,
          criadaEm,
          ...doGoogle,
        },
        update: doGoogle,
      })
      resumo.gravadas++
    } catch (erro) {
      console.error(`[avaliacoes] upsert falhou (${reviewId}):`, erro)
    }
  }

  resumo.porProjeto = [...porProjeto.values()]
  return resumo
}
