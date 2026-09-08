/**
 * Os horários em que o cliente costuma publicar, por dia da semana — para o
 * formulário de post oferecer a hora como um toque, em vez de inventar
 * "amanhã 12:00" ou cravar 10:00 no "+" da agenda (era o que acontecia até
 * 05/09/2026: a hora nunca vinha da célula clicada).
 *
 * É a MESMA leitura que `sugerirPosts` faz (cadência v2 sobre os últimos 56
 * dias de POSTED + a grade aprovada da base), sem a parte que aquela função
 * tem de emitir sugestões.
 *
 * 🔴 Nunca chame `sugerirPosts` para isto: ela registra um `LearningSignal`
 * por slot a cada chamada, e este formulário abre dezenas de vezes por dia — o
 * denominador do KPI de sugestão viraria ficção em uma semana.
 */
import { db } from '@/lib/db'
import { calcularCadencia, type PostDoHistorico } from '@/lib/posts/cadencia'
import { fundirGradeComCadencia, lerGradeDasEntradas } from '@/lib/posts/grade-da-base'
import { campanhasEncerradas } from '@/lib/posts/sugerir-posts'

const JANELA_HISTORICO_DIAS = 56
const TETO_POR_DIA = 6

export interface HorariosTipicos {
  /** 0=domingo … 6=sábado → horas 'HH:mm', em ordem, no máximo 6 por dia. */
  porDia: Record<number, string[]>
  /** De onde veio a maior parte: a grade aprovada, o histórico, ou nada. */
  fonte: 'grade' | 'cadencia' | 'vazio'
  postsConsiderados: number
}

export async function horariosTipicosDoProjeto(projectId: number, agora = new Date()): Promise<HorariosTipicos> {
  const inicio = new Date(agora.getTime() - JANELA_HISTORICO_DIAS * 86_400_000)

  const [historico, entradasDaGrade] = await Promise.all([
    db.socialPost.findMany({
      where: {
        projectId,
        status: 'POSTED',
        scheduledDatetime: { gte: inicio, lte: agora },
        learningScope: { not: 'PONTUAL' },
      },
      select: { scheduledDatetime: true, origem: true, learningScope: true, campaignId: true },
    }),
    db.knowledgeBaseEntry
      .findMany({
        where: {
          projectId,
          status: 'ACTIVE',
          category: { in: ['POLITICAS', 'HORARIOS'] },
          OR: [
            { title: { contains: 'Padrões de Postagem', mode: 'insensitive' } },
            { tags: { hasSome: ['grade', 'cadencia'] } },
          ],
        },
        select: { title: true, content: true },
      })
      .catch((erro: unknown) => {
        console.error('[horarios-tipicos] sem a grade da base (seguindo pela cadência):', erro)
        return [] as Array<{ title: string; content: string }>
      }),
  ])

  const encerradas = await campanhasEncerradas(projectId, historico.map((p) => p.campaignId), agora)
  const paraCadencia: PostDoHistorico[] = historico
    .filter((p) => p.scheduledDatetime)
    .map((p) => ({
      quando: p.scheduledDatetime!,
      origem: p.origem as PostDoHistorico['origem'],
      escopo: p.learningScope,
      campaignId: p.campaignId,
      campanhaEncerrada: !!p.campaignId && encerradas.has(p.campaignId),
    }))

  const resultado = calcularCadencia(paraCadencia, { agora })
  const grade = lerGradeDasEntradas(entradasDaGrade)
  const fundido = fundirGradeComCadencia(resultado.slotsPorDia, grade)

  const porDia: Record<number, string[]> = {}
  let daGrade = 0
  let total = 0
  for (const [dia, slots] of fundido) {
    const horas = [...slots]
      .sort((a, b) => a.minutosDoDia - b.minutosDoDia)
      .map((s) => s.hora)
      .filter((h, i, arr) => arr.indexOf(h) === i)
      .slice(0, TETO_POR_DIA)
    if (horas.length) porDia[dia] = horas
    for (const s of slots) {
      total++
      if (s.origem === 'grade') daGrade++
    }
  }

  return {
    porDia,
    fonte: total === 0 ? 'vazio' : daGrade * 2 >= total ? 'grade' : 'cadencia',
    postsConsiderados: resultado.postsConsiderados,
  }
}
