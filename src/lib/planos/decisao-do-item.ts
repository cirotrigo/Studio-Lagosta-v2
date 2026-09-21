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
 * com ou sem lote, com ou sem a linha do lote já ligada à peça. O VÍNCULO da
 * linha (a peça que ela aponta) não é entrada: o que decide é o item e a peça
 * dele agora — e, com lote, a revisão que a CHAMADA declara ter lido ao montar
 * a spec (pré-revisões C11-1 e C11-1a).
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
 *  - `chamada`: a revisão do item que a CHAMADA declara ter lido ao montar a
 *    spec (o `itemRevisao` do `ver-plano`) contra a do item agora
 *    (`confrontarRevisaoDaChamada`); sem lote, `sem-lote`.
 * Saída: reaproveitar, refazer só o job, peça nova, ou recusar (409, sem
 * escrever nada).
 *
 * Por que a revisão da chamada é entrada: sem lote a spec é montada DO ITEM
 * ATUAL por quem chama (a bancada, o `executar-plano`), então peça de outra
 * revisão significa "produza a nova". Com lote a spec é o payload que o chat
 * montou numa leitura ANTERIOR do plano, e nada no servidor sabe de qual:
 * comparar com a peça atual não distingue o pedido mais novo que ela do pedido
 * vencido (C11-1, R06), e a revisão lida pelo servidor na hora da reserva
 * também não, quando a edição chega antes da chamada (C11-1a). Por isso quem
 * montou a spec declara a revisão, e com lote produzir exige que ela seja a do
 * item agora — e, com a declaração certa, produzir não depende mais da revisão
 * gravada na peça (a antiga linha 14, que recusava a saída do C11-1b).
 *
 * Decisão do Ciro (13/09/2026) — "peça superada no plano": quando o item já
 * tem OUTRA arte, viva ou pronta, que não é este pedido, a recusa tem motivo
 * próprio (`superada`) em vez do genérico `avancou`. Nada muda no que se
 * produz — continua não criando nada —, só o que a resposta diz: qual é a arte
 * atual do item (`arteAtualDoItem`) e que o chat conta à pessoa e pergunta se
 * ela quer manter essa arte ou refazer com o conteúdo atual do item.
 */

import stableStringify from 'json-stable-stringify'
import { itemExecutavel } from './execucao'
import type { StatusDoItem } from './vocabulario'
import { mesmoPedidoDoLote } from '@/lib/lotes/identidade'
import { confrontarRevisaoGravada, type ConteudoDaRevisaoDoItem } from './revisao-do-item'

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

/**
 * A revisão que a CHAMADA declara (o `itemRevisao` lido no `ver-plano`) contra a
 * do item agora (C11-1a). `desconhecido` é a chamada com lote sem declaração —
 * nunca vale "igual".
 */
export type RevisaoDaChamada = 'sem-lote' | 'igual' | 'diferente' | 'desconhecido'
export const REVISOES_DA_CHAMADA: RevisaoDaChamada[] = ['sem-lote', 'igual', 'diferente', 'desconhecido']

export interface EntradaDaDecisaoDoItem {
  status: StatusDoItem
  ficha: FichaDoItem
  peca: EstadoDaPecaDoItem
  pedido: Confronto
  projeto: ConfrontoDoProjeto
  revisao: Confronto
  chamada: RevisaoDaChamada
}

export type MotivoDaRecusaDoItem = 'reprovado' | 'ficha' | 'avancou' | 'superada' | 'revisado' | 'chamada-vencida'

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

/** Como a arte atual do item está, em palavras de quem cuida da agenda — nunca o enum do banco. */
export type SituacaoDaArteAtual = 'pronta' | 'em produção' | 'falhou' | 'sem arquivo' | 'apagada'

/** A arte que o item do plano aponta AGORA, como a resposta a mostra ao chat (decisão do Ciro, 13/09/2026). */
export interface ArteAtualDoItem {
  generationId: string
  pageId: string | null
  /** ISO; nulo quando não se sabe. */
  feitaEm: string | null
  /** "dd/mm/aaaa, hh:mm" em Brasília; nulo quando não se sabe. */
  feitaEmBrasilia: string | null
  situacao: SituacaoDaArteAtual
}

const FORMATO_BRASILIA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

/**
 * A arte atual do item, descrita. Sem `generationId` não há arte para mostrar
 * (`null`). A página vem do item e, sem ela, dos `fieldValues` da peça pronta.
 */
export function descreverArteAtualDoItem(entrada: {
  generationId: string | null
  pageIdDoItem?: string | null
  geracao: { status: string; resultUrl?: string | null; createdAt?: Date | string | null; fieldValues?: unknown } | null
}): ArteAtualDoItem | null {
  if (!entrada.generationId) return null
  const { geracao } = entrada
  const quando = geracao?.createdAt ? new Date(geracao.createdAt) : null
  const valida = quando && !Number.isNaN(quando.getTime()) ? quando : null
  const pageIdDaPeca = objeto(geracao?.fieldValues)?.pageId
  const situacao: SituacaoDaArteAtual = !geracao
    ? 'apagada'
    : geracao.status === 'COMPLETED'
      ? geracao.resultUrl ? 'pronta' : 'sem arquivo'
      : geracao.status === 'FAILED' ? 'falhou' : 'em produção'
  return {
    generationId: entrada.generationId,
    pageId: entrada.pageIdDoItem ?? (typeof pageIdDaPeca === 'string' ? pageIdDaPeca : null),
    feitaEm: valida ? valida.toISOString() : null,
    feitaEmBrasilia: valida ? FORMATO_BRASILIA.format(valida) : null,
    situacao,
  }
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
 *
 * `item` é o conteúdo do item AGORA: é com ele que a revisão LEGADA (a que a
 * main gravava antes do PR 11) é conferida campo a campo (PR11-F01,
 * `confrontarRevisaoGravada`). Obrigatório de propósito — sem ele o legado
 * cairia sempre em "desconhecido".
 */
export function confrontarComOGravado(entrada: {
  // `strict: false`: o `SpecDePeca` do zod chega com toda chave opcional.
  spec: { projectId?: number }
  revisao: string
  item: ConteudoDaRevisaoDoItem
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
  const revisao: Confronto = confrontarRevisaoGravada(revisaoGravada, entrada.revisao, entrada.item)
  return { pedido, projeto, revisao }
}

/** A revisão que a chamada declara contra a do item agora. Sem lote não há declaração; sem ela, desconhecido. */
export function confrontarRevisaoDaChamada(entrada: { comLote: boolean; revisaoDaChamada: string | null | undefined; revisao: string }): RevisaoDaChamada {
  if (!entrada.comLote) return 'sem-lote'
  if (typeof entrada.revisaoDaChamada !== 'string' || !entrada.revisaoDaChamada) return 'desconhecido'
  return entrada.revisaoDaChamada === entrada.revisao ? 'igual' : 'diferente'
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

  // Com lote, PRODUZIR (peça nova ou job novo) exige que a chamada tenha
  // montado a spec a partir da revisão do item agora (C11-1a). O
  // reaproveitamento acima não produz nada: a peça devolvida é o pedido e a
  // revisão de agora.
  const comLote = e.chamada !== 'sem-lote'
  const chamadaVencida = comLote && e.chamada !== 'igual'

  if (EM_VOO.includes(e.status)) {
    // Em voo o item não é editável: só se retoma a PRÓPRIA peça, e só quando
    // ela está morta ou sem job e nada gravado contradiz o pedido e a revisão.
    // O item já tem OUTRA arte, viva ou pronta, que não é este pedido (linha 3
    // não casou): a peça deste pedido foi superada no plano (Ciro, 13/09/2026).
    if (pecaViva) return { acao: 'recusar', motivo: 'superada' }
    if (e.peca === 'nenhuma') return { acao: 'recusar', motivo: 'avancou' }
    if (outroPedido || e.revisao === 'diferente') return { acao: 'recusar', motivo: 'revisado' }
    if (chamadaVencida) return { acao: 'recusar', motivo: 'chamada-vencida' }
    return e.peca === 'sem-job' ? { acao: 'refazer-job' } : { acao: 'nova-peca' }
  }

  // `pronto` e `agendado`: só o reaproveitamento acima. Com outra arte viva ou
  // pronta no item, a recusa diz que este pedido foi superado.
  if (!executavel) return { acao: 'recusar', motivo: pecaViva ? 'superada' : 'avancou' }

  // Executável: sem lote a spec é do item atual; com lote, a chamada declarou a
  // revisão de agora. Nos dois casos a peça nova é o pedido certo — inclusive
  // quando a peça que o item tinha é de outra revisão (C11-1b).
  if (chamadaVencida) return { acao: 'recusar', motivo: 'chamada-vencida' }
  return { acao: 'nova-peca' }
}
