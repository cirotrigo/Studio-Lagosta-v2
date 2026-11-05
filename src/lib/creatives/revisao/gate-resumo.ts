/**
 * CP5e § 2 — o RESUMO do registro do gate para `auditar-operacao`: só LEITURA (`lerGateDaArte` + `validadeDoGate`, os
 * leitores do CP5b), sobre linhas JÁ LIDAS pelo chamador (número fixo de consultas). Nada aqui mede, decide ou grava — e
 * este módulo é PURO (não importa `@/lib/db` nem o merge): é testável sem banco e entra na barreira do lint como LEITOR
 * (pode ler/validar, nunca `decidirEMontarRegistro` nem `gateDaMedida`).
 *
 * Fail-closed no VÍNCULO antes de ler qualquer registro: post → Generation → `fieldValues.pageId` → `Page.Template.projectId`
 * têm de ser do MESMO projeto e da MESMA página; qualquer divergência ou ausência conta em `registroInvalido` e nenhum
 * resultado é exibido. `coincidente` significa "metadados iguais aos de hoje, com o que NÃO foi conferido listado" —
 * nunca "aprovado agora" (a frase fixa é a do `ver-geracao`).
 */
import { lerGateDaArte, validadeDoGate } from './gate-registro'
import { identidadeDaPagina } from './versao'
import { VERSAO_DO_GATE, type GateDaArte, type PoliticaDoAssunto } from './gate'
import { VERSAO_DAS_REGRAS } from './contrato'
import { POLITICA_DO_ASSUNTO_DO_GATE } from '@/lib/lotes/agendamento'
import { AVISO_DO_GATE } from '@/lib/mcp/catalogo/ver-geracao-retorno'

/** Quantos posts da janela o resumo lê por chamada (acima disso: `parcial: true` e `naoLidos`). */
export const TETO_DE_POSTS_DO_GATE = 200

export type SituacaoDoRegistro = 'coincidente' | 'historico' | 'ilegivel' | 'semRegistro' | 'registroInvalido'

export interface ResumoDoGate {
  posts: number
  /** Registros cuja identidade coincide com a página de HOJE — por veredito gravado; `naoConferido` é a lista fixa de `validadeDoGate`. */
  coincidente: { APTO: number; REVISAO_HUMANA_NECESSARIA: number; naoConferido: readonly string[] }
  historico: number
  ilegivel: number
  semRegistro: number
  registroInvalido: number
  politicaDoAssunto: PoliticaDoAssunto
  aviso: string
}

export interface ResumoDoGateDaCarteira {
  total: ResumoDoGate & { parcial: boolean; naoLidos: number; teto: number }
  porProjeto: Map<number, ResumoDoGate>
}

export interface PostParaOResumo {
  id: string
  projectId: number
  pageId: string | null
  generationId: string | null
}
export interface GenerationParaOResumo {
  id: string
  projectId: number
  fieldValues: unknown
}
export interface PaginaParaOResumo {
  id: string
  name: string
  tags: string[]
  width: number
  height: number
  background?: string | null
  layers: unknown
  copyAutoral?: unknown
  Template: { projectId: number } | null
}

const NAO_CONFERIDO_VAZIO: readonly string[] = []

export function resumoVazio(): ResumoDoGate {
  return {
    posts: 0,
    coincidente: { APTO: 0, REVISAO_HUMANA_NECESSARIA: 0, naoConferido: NAO_CONFERIDO_VAZIO },
    historico: 0,
    ilegivel: 0,
    semRegistro: 0,
    registroInvalido: 0,
    politicaDoAssunto: POLITICA_DO_ASSUNTO_DO_GATE,
    aviso: AVISO_DO_GATE,
  }
}

/** A situação de UM post — pura. */
export function situacaoDoRegistroDoPost(
  post: PostParaOResumo,
  generations: ReadonlyMap<string, GenerationParaOResumo>,
  pages: ReadonlyMap<string, PaginaParaOResumo>,
  permitidos: readonly number[] | null,
): { situacao: SituacaoDoRegistro; resultado?: GateDaArte['resultado']; naoConferido?: readonly string[] } {
  if (permitidos !== null && !permitidos.includes(post.projectId)) return { situacao: 'registroInvalido' }
  if (!post.generationId) return { situacao: 'semRegistro' }
  const g = generations.get(post.generationId)
  if (!g || g.projectId !== post.projectId) return { situacao: 'registroInvalido' }
  const fv = g.fieldValues && typeof g.fieldValues === 'object' && !Array.isArray(g.fieldValues) ? (g.fieldValues as Record<string, unknown>) : null
  if (!post.pageId || fv?.pageId !== post.pageId) return { situacao: 'registroInvalido' }
  const p = pages.get(post.pageId)
  if (!p || !p.Template || p.Template.projectId !== post.projectId) return { situacao: 'registroInvalido' }
  const leitura = lerGateDaArte(fv)
  if (leitura.estado === 'ausente') return { situacao: 'semRegistro' }
  if (leitura.estado === 'invalido') return { situacao: 'ilegivel' }
  const id = identidadeDaPagina({ id: p.id, name: p.name, tags: p.tags, width: p.width, height: p.height, background: p.background ?? null, layers: p.layers, copyAutoral: p.copyAutoral })
  const validade = validadeDoGate(leitura.registro, {
    projectId: post.projectId,
    generationId: g.id,
    pageId: id.pageId,
    formato: id.formato,
    formatoDoCompositor: id.formatoDoCompositor,
    pageVersion: id.pageVersion,
    copyVersion: id.copyVersion,
    rulesVersion: VERSAO_DAS_REGRAS,
    versaoDoGate: VERSAO_DO_GATE,
    politica: POLITICA_DO_ASSUNTO_DO_GATE,
  })
  if (validade.estado === 'ilegivel') return { situacao: 'ilegivel' }
  if (validade.estado === 'historico') return { situacao: 'historico' }
  return { situacao: 'coincidente', resultado: leitura.registro.gate.resultado, naoConferido: validade.naoConferido }
}

/**
 * O resumo da carteira: `posts` já vem na ordem da janela (`scheduledDatetime` asc); só os primeiros `teto` são lidos.
 */
export function resumoDoGateDosPosts(args: {
  posts: readonly PostParaOResumo[]
  generations: readonly GenerationParaOResumo[]
  pages: readonly PaginaParaOResumo[]
  permitidos: readonly number[] | null
  teto?: number
}): ResumoDoGateDaCarteira {
  const teto = args.teto ?? TETO_DE_POSTS_DO_GATE
  const lidos = args.posts.slice(0, teto)
  const generations = new Map(args.generations.map((g) => [g.id, g]))
  const pages = new Map(args.pages.map((p) => [p.id, p]))
  const porProjeto = new Map<number, ResumoDoGate>()
  const total: ResumoDoGateDaCarteira['total'] = { ...resumoVazio(), parcial: args.posts.length > teto, naoLidos: Math.max(0, args.posts.length - teto), teto }
  const somar = (r: ResumoDoGate, s: ReturnType<typeof situacaoDoRegistroDoPost>) => {
    r.posts++
    if (s.situacao === 'coincidente') {
      r.coincidente[s.resultado!]++
      if (s.naoConferido) r.coincidente.naoConferido = s.naoConferido
    } else r[s.situacao]++
  }
  for (const post of lidos) {
    const s = situacaoDoRegistroDoPost(post, generations, pages, args.permitidos)
    const r = porProjeto.get(post.projectId) ?? resumoVazio()
    porProjeto.set(post.projectId, r)
    somar(r, s)
    somar(total, s)
  }
  return { total, porProjeto }
}
