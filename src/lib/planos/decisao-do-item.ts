/**
 * A decisão do caminho do ITEM DE PLANO — módulo PURO (sem Prisma), com a
 * tabela inteira testada combinação a combinação em
 * `__tests__/decisao-do-item.test.ts`.
 *
 * PR 11 de "Marca simples, copy melhor", revisão FINAL (R05–R06, 12/09/2026).
 * Três rodadas de revisão na retomada do item de plano (R01–R02, R03–R04,
 * R05–R06) nasceram do mesmo desenho: ramos por caso, cada um conferindo uma
 * parte das guardas, e a decisão do LOTE (tomada antes da trava do item)
 * decidindo se a guarda de revisão rodava. Aqui a decisão é UMA, tomada sob a
 * trava do item, sobre o estado RELIDO, para toda entrada no caminho do plano —
 * com ou sem lote, com ou sem a linha do lote já ligada à peça. O vínculo da
 * linha não é entrada: o que decide é o item e a peça dele agora.
 *
 * Entradas (todas lidas sob a trava):
 *  - `status` do item;
 *  - `ficha`: o `itemAtualizadoEm` de quem chamou contra o do item;
 *  - `peca`: o estado da Generation e do job que o item aponta
 *    (`classificarPecaDoItem`);
 *  - `pedido`, `projeto`, `revisao`: a spec e a revisão de agora contra as
 *    GRAVADAS com a peça — no payload do job e, sem ele, nos `fieldValues` da
 *    Generation (`confrontarComOGravado`); com lote, a spec pela normalização
 *    do hash do lote;
 *  - `comLote`.
 * Saída: reaproveitar, refazer só o job, peça nova, ou recusar (409, sem
 * escrever nada).
 *
 * Por que `comLote` muda uma linha só (item executável cuja peça não serve):
 * sem lote a spec é montada DO ITEM ATUAL por quem chama (a bancada, o
 * `executar-plano`), então peça de outra revisão significa "produza a nova".
 * Com lote a spec é o payload da chamada ORIGINAL que o hash aceitou; se o
 * pedido é o mesmo da peça e a revisão do item divergiu (ou não dá para
 * conferir), produzir agora reproduz a copy antiga sob o item editado (R06).
 */

import stableStringify from 'json-stable-stringify'
import { itemExecutavel } from './execucao'
import type { StatusDoItem } from './vocabulario'
import { mesmoPedidoDoLote } from '@/lib/lotes/identidade'

export type EstadoDaPecaDoItem =
  | 'nenhuma' // o item não aponta Generation
  | 'sumiu' // aponta, e a Generation não existe mais
  | 'falhou' // Generation FAILED
  | 'job-terminal' // Generation PROCESSING com o job DONE/FAILED
  | 'sem-job' // Generation PROCESSING sem job
  | 'viva' // Generation PROCESSING com job vivo
  | 'pronta' // Generation COMPLETED com resultUrl
  | 'pronta-sem-arquivo' // Generation COMPLETED sem resultUrl

export const ESTADOS_DA_PECA_DO_ITEM: EstadoDaPecaDoItem[] = ['nenhuma', 'sumiu', 'falhou', 'job-terminal', 'sem-job', 'viva', 'pronta', 'pronta-sem-arquivo']

export type Confronto = 'igual' | 'diferente' | 'desconhecido'
export type ConfrontoDoProjeto = 'confere' | 'diverge' | 'desconhecido'
export type FichaDoItem = 'ausente' | 'confere' | 'diverge'

export const CONFRONTOS: Confronto[] = ['igual', 'diferente', 'desconhecido']
export const CONFRONTOS_DO_PROJETO: ConfrontoDoProjeto[] = ['confere', 'diverge', 'desconhecido']
export const FICHAS_DO_ITEM: FichaDoItem[] = ['ausente', 'confere', 'diverge']

export interface EntradaDaDecisaoDoItem {
  status: StatusDoItem
  ficha: FichaDoItem
  peca: EstadoDaPecaDoItem
  pedido: Confronto
  projeto: ConfrontoDoProjeto
  revisao: Confronto
  comLote: boolean
}

export type MotivoDaRecusaDoItem = 'reprovado' | 'ficha' | 'avancou' | 'revisado'

export type DecisaoDoItem =
  | { acao: 'reaproveitar' }
  | { acao: 'refazer-job' }
  | { acao: 'nova-peca' }
  | { acao: 'recusar'; motivo: MotivoDaRecusaDoItem }

/** O que a Generation e o job que o item aponta dizem da peça. */
export function classificarPecaDoItem(entrada: {
  generationId: string | null
  geracao: { status: string; resultUrl?: string | null } | null
  job: { status: string } | null
}): EstadoDaPecaDoItem {
  if (!entrada.generationId) return 'nenhuma'
  const { geracao, job } = entrada
  if (!geracao) return 'sumiu'
  if (geracao.status === 'COMPLETED') return geracao.resultUrl ? 'pronta' : 'pronta-sem-arquivo'
  if (geracao.status === 'FAILED') return 'falhou'
  if (!job) return 'sem-job'
  if (job.status === 'DONE' || job.status === 'FAILED') return 'job-terminal'
  return 'viva'
}

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/**
 * A spec gravada com a peça é o pedido de agora?
 *
 * Com identidade de lote, pela MESMA normalização do hash do lote (revisão
 * R03): os carimbos `copyAutoral.origem.em` e `revisoes[].em` não são
 * diferença. O projeto é conferido À PARTE, porque o hash o deixa de fora. Sem
 * lote, a comparação crua de sempre.
 */
export function mesmaSpecDaPeca(gravada: unknown, spec: { projectId?: number }, comLote: boolean): boolean {
  if (!comLote) return stableStringify(gravada) === stableStringify(spec)
  if (!gravada || typeof gravada !== 'object' || Array.isArray(gravada)) return false
  if ((gravada as { projectId?: unknown }).projectId !== spec.projectId) return false
  return mesmoPedidoDoLote(gravada, spec)
}

/**
 * A spec, o projeto e a revisão de agora contra os GRAVADOS com a peça. O job
 * vem primeiro: é o pedido como foi enfileirado. A Generation COMPLETED pode
 * guardar a spec RESOLVIDA (a foto escolhida entre as candidatas), e só é lida
 * quando não há job. Nada gravado → `desconhecido`, nunca "igual".
 */
export function confrontarComOGravado(entrada: {
  // `strict: false`: o `SpecDePeca` do zod chega com toda chave opcional.
  spec: { projectId?: number }
  revisao: string
  comLote: boolean
  geracao: { fieldValues?: unknown } | null
  job: { payload?: unknown } | null
}): { pedido: Confronto; projeto: ConfrontoDoProjeto; revisao: Confronto } {
  const doJob = objeto(entrada.job?.payload)
  const daGeracao = objeto(entrada.geracao?.fieldValues)
  const specGravada = doJob && doJob.spec !== undefined && doJob.spec !== null ? doJob.spec : daGeracao?.spec
  const revisaoGravada = typeof doJob?.planoRevisao === 'string' ? doJob.planoRevisao : typeof daGeracao?.planoRevisao === 'string' ? daGeracao.planoRevisao : undefined

  const gravada = objeto(specGravada)
  const pedido: Confronto = !gravada
    ? 'desconhecido'
    : (entrada.comLote ? mesmoPedidoDoLote(gravada, entrada.spec) : stableStringify(gravada) === stableStringify(entrada.spec))
      ? 'igual'
      : 'diferente'
  const projeto: ConfrontoDoProjeto = !gravada || gravada.projectId === undefined ? 'desconhecido' : gravada.projectId === entrada.spec.projectId ? 'confere' : 'diverge'
  const revisao: Confronto = revisaoGravada === undefined ? 'desconhecido' : revisaoGravada === entrada.revisao ? 'igual' : 'diferente'
  return { pedido, projeto, revisao }
}

const EM_VOO: StatusDoItem[] = ['na-fila', 'gerando']

/**
 * A tabela. A forma escrita dela (linhas em ordem, a primeira que casa vence)
 * está no CLAUDE.md e no teste; esta é a mesma decisão em código corrido, e o
 * teste confere as duas em todas as combinações.
 */
export function decidirNoItemDoPlano(e: EntradaDaDecisaoDoItem): DecisaoDoItem {
  if (e.status === 'reprovado') return { acao: 'recusar', motivo: 'reprovado' }
  const executavel = itemExecutavel(e.status)
  if (executavel && e.ficha === 'diverge') return { acao: 'recusar', motivo: 'ficha' }

  const outroPedido = e.pedido === 'diferente' || e.projeto === 'diverge'
  const mesmoPedido = !outroPedido && e.pedido === 'igual'
  const pecaViva = e.peca === 'viva' || e.peca === 'pronta'
  if (pecaViva && mesmoPedido && e.revisao === 'igual') return { acao: 'reaproveitar' }

  if (EM_VOO.includes(e.status)) {
    // Em voo o item não é editável: só se retoma a PRÓPRIA peça, e só quando
    // ela está morta ou sem job e nada gravado contradiz o pedido e a revisão.
    if (e.peca === 'nenhuma' || pecaViva) return { acao: 'recusar', motivo: 'avancou' }
    if (outroPedido || e.revisao === 'diferente') return { acao: 'recusar', motivo: 'revisado' }
    return e.peca === 'sem-job' ? { acao: 'refazer-job' } : { acao: 'nova-peca' }
  }

  // `pronto` e `agendado`: só o reaproveitamento acima.
  if (!executavel) return { acao: 'recusar', motivo: 'avancou' }

  if (e.peca === 'nenhuma' || !e.comLote || outroPedido || e.revisao === 'igual') return { acao: 'nova-peca' }
  return { acao: 'recusar', motivo: 'revisado' }
}
