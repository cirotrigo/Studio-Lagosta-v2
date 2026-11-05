/**
 * CP5c/CP5d — o que os PRODUTORES do gate (agendar-leva, ajustar-arte) compartilham sem importar um ao outro: o
 * retorno `revisao` do item/chamada e os prazos da medição sob trava. Módulo PURO (sem `@/lib/db`): nenhum veredito
 * nasce aqui — a decisão é de `decidirEMontarRegistro` (gate-registro.ts).
 */
import type { GateDaArte } from './gate'
import type { RegistroSelado } from './gate-registro'

/**
 * CP5c § 6 — o que o gate do draft-only disse DESTA chamada: `medida` (a peça foi medida e decidida), `sem-vinculo`
 * (a medida não pôde ser vinculada à página — não há veredito), `nao-medida` (recusa antes de medir, prazo, erro, ou
 * uma linha já ligada que esta chamada não mediu). Só no perfil draft-only; o fluxo humano não traz o campo.
 */
export type RevisaoDoItem =
  | { tipo: 'medida'; resultado: GateDaArte['resultado']; rulesVersion: string; versaoDoGate: string; medidoEm: string; naoMedidos: GateDaArte['naoMedidos']; generationId?: string }
  | { tipo: 'sem-vinculo'; motivo: string }
  | { tipo: 'nao-medida'; motivo: string }

/** CP5c § 8.9 (proposta): prazo da cadeia INTEIRA da medição sob trava (contexto + medida + decisão), imposto POR FORA (race). */
export const PRAZO_DA_MEDICAO_MS = 8_000
/** CP5c § 8.9 (proposta): teto de cada download que aceita cancelamento (foto do assunto, fontes). */
export const PRAZO_POR_DOWNLOAD_MS = 4_000

/** O resultado de uma medição sob trava, antes de virar resposta: o que `medirEDecidir` (CP5c) e `medirEDecidirAjuste` (CP5d) devolvem. */
export type ResultadoDaMedicao =
  | { tipo: 'nao-medida'; motivo: string }
  | { tipo: 'sem-vinculo'; motivo: string }
  | { tipo: 'medida'; registro: RegistroSelado; gate: GateDaArte }

/** `revisao`, `achados` e `motivos` a partir do resultado (achados só no tipo `medida` — nunca fabricados). */
export function revisaoDe(r: ResultadoDaMedicao): { revisao: RevisaoDoItem; achados?: GateDaArte['achados']; motivos?: GateDaArte['motivos'] } {
  if (r.tipo !== 'medida') return { revisao: { tipo: r.tipo, motivo: r.motivo } }
  const { gate } = r
  return {
    revisao: { tipo: 'medida', resultado: gate.resultado, rulesVersion: gate.rulesVersion, versaoDoGate: gate.versao, medidoEm: r.registro.medidoEm, naoMedidos: gate.naoMedidos },
    achados: gate.achados,
    motivos: gate.motivos,
  }
}

/** As páginas que a medição lê além da própria: a de assinatura e a página-modelo apontadas pela Generation de origem. */
export function paginasDeReferencia(geracao: { fieldValues: unknown; sourcePageId: string | null } | null): string[] {
  const fv = (geracao?.fieldValues && typeof geracao.fieldValues === 'object' ? geracao.fieldValues : {}) as Record<string, any>
  const assinatura = fv.composicao?.assinatura?.pageId
  return [...new Set([typeof assinatura === 'string' ? assinatura : null, geracao?.sourcePageId ?? null].filter((x): x is string => !!x))]
}

/** Os códigos (Prisma e SQLSTATE) de um erro do banco: P2028 = timeout da transação; 40P01 / P2034 = deadlock. */
export function codigosDoErro(erro: unknown): string[] {
  const e = erro as { code?: unknown; meta?: { code?: unknown } } | null
  return [e?.code, e?.meta?.code].filter((c): c is string => typeof c === 'string')
}
export const ehDeadlock = (erro: unknown) => codigosDoErro(erro).some((c) => c === '40P01' || c === 'P2034') || /40P01|deadlock detected/i.test(erro instanceof Error ? erro.message : '')
export const ehTimeoutDaTransacao = (erro: unknown) => codigosDoErro(erro).includes('P2028')
