/**
 * A COPY sugerida numa leva: a emissão e o fechamento.
 *
 * Até agora a copy da bancada era registrada como **escolha absoluta**
 * (`escolha-propria`), e com razão: não havia dica de copy, então não havia
 * proposta a comparar. Com `propor-semana` isso muda — o sistema PASSA a
 * propor o texto, e a partir daí registrar a mesma copy como escolha própria
 * mentiria duas vezes: some com o denominador do KPI (a proposta nunca teria
 * sido "emitida" para ninguém) e cria dois sinais com sentidos opostos sobre o
 * MESMO texto.
 *
 * É o defeito que a F1 já teve de corrigir uma vez, no slot (`e3236624`): um
 * sinal por proposta, nunca dois com rótulos opostos.
 *
 * ── COMO OS DOIS LADOS SE ACHAM, SEM COLUNA NOVA ──────────────────────────
 * `ItemDePlano` não tem onde guardar o id do sinal de copy, e esta fatia não
 * abre migration. O elo é a CHAVE de idempotência, montada sobre uma âncora
 * estável do item:
 *
 *   âncora = o `sugestaoId` do SLOT que originou o item, quando existe;
 *            senão, o horário proposto em Brasília.
 *
 * A âncora preferida é o sinal de slot porque ele NÃO muda quando alguém
 * antecipa o post no card — e mudar o horário é a edição mais comum da bancada.
 * O horário só entra como plano B (captura de slot que falhou), e aí uma edição
 * de horário custa o elo: o sinal fica pendente e expira, em vez de virar
 * aceitação falsa. Degradar é aceitável; inventar aceitação, não.
 *
 * ⚠️ Nada aqui lança — contrato de `captura.ts`.
 */

import { db } from '@/lib/db'
import { registrarDesfecho, registrarSugestoes, sugestoesJaEmitidas } from './captura'
import { chaveDeSugestao } from './chaves'
import { decidirDesfechoDaCopy } from './fechar-copy-por-pagina-contrato'
import { slotEmBrasilia } from './sinal-de-agendamento'
import type { Superficie } from './vocabulario'

/**
 * A chave de um sinal de copy proposta.
 *
 * A VERSÃO fica no fim de propósito: o fechamento não sabe com que versão da
 * heurística o item foi montado (o plano guarda a sua, mas a dica tem a dela e
 * as duas se movem), então ele acha o sinal pelo PREFIXO — projeto e âncora —
 * e fica com o mais recente. Com a versão no meio, esse prefixo não existiria.
 */
export function chaveDaDicaDeCopy(projectId: number, ancora: string, versao: string): string {
  return chaveDeSugestao('copy', projectId, ancora, versao)
}

/** O prefixo que identifica a copy proposta para uma âncora, em toda versão. */
function prefixoDaDica(projectId: number, ancora: string): string {
  return `${chaveDeSugestao('copy', projectId, ancora)}|`
}

/**
 * A âncora de um item: o sinal de slot que o originou, ou o horário proposto.
 * `null` quando não há nem um nem outro — item sem horário decidido não tem
 * como ser reencontrado, e forçar uma âncora inventada casaria itens diferentes.
 */
export function ancoraDaDica(item: {
  sugestaoId?: string | null
  quando?: Date | string | null
}): string | null {
  const doSlot = item.sugestaoId?.trim()
  if (doSlot) return doSlot
  if (!item.quando) return null
  const quando = item.quando instanceof Date ? item.quando : new Date(item.quando)
  if (Number.isNaN(quando.getTime())) return null
  const brt = slotEmBrasilia(quando)
  return `${brt.data} ${brt.hora}`
}

export interface DicaParaRegistrar {
  /** De `ancoraDaDica` — o que liga esta proposta ao item, depois. */
  ancora: string
  /** Os blocos de texto propostos, na ordem de leitura. */
  blocos: string[]
  legenda?: string | null
  tema?: string | null
  /** "AAAA-MM-DD HH:mm" em Brasília — contexto, não chave. */
  scheduledDatetime?: string | null
  formato?: string | null
  /** De onde a dica tirou o que afirma (base, DNA, perfil). */
  fontes?: string[]
  /** O modelo do cliente que o item vai usar, quando há um. */
  pageId?: string | null
}

/**
 * Registra as dicas EMITIDAS e devolve `âncora → id do sinal`.
 *
 * Idempotente pela chave: montar a semana duas vezes no mesmo dia devolve os
 * mesmos ids e não grava nada de novo — a unidade é a PROPOSTA, não a chamada.
 * A leitura prévia (`sugestoesJaEmitidas`) faz a leva reemitida custar um
 * SELECT e zero escritas.
 */
export async function registrarDicasDeCopy(entrada: {
  projectId: number
  servico: string
  versao: string
  dicas: DicaParaRegistrar[]
}): Promise<Map<string, string>> {
  const porAncora = new Map<string, string>()
  const uteis = entrada.dicas.filter((d) => d.ancora && d.blocos.length > 0)
  if (uteis.length === 0) return porAncora

  const chaves = uteis.map((d) => chaveDaDicaDeCopy(entrada.projectId, d.ancora, entrada.versao))
  const jaEmitidas = await sugestoesJaEmitidas(chaves)

  const novas: number[] = []
  uteis.forEach((d, i) => {
    const id = jaEmitidas.get(chaves[i])
    if (id) porAncora.set(d.ancora, id)
    else novas.push(i)
  })
  if (novas.length === 0) return porAncora

  const ids = await registrarSugestoes(
    novas.map((i) => {
      const d = uteis[i]
      return {
        projectId: entrada.projectId,
        tipo: 'copy' as const,
        servico: entrada.servico,
        versao: entrada.versao,
        chave: chaves[i],
        pageId: d.pageId ?? null,
        sugerido: {
          blocos: d.blocos,
          ...(d.legenda ? { legenda: d.legenda } : {}),
          ...(d.tema ? { tema: d.tema } : {}),
          ...(d.scheduledDatetime ? { scheduledDatetime: d.scheduledDatetime } : {}),
          ...(d.formato ? { formato: d.formato } : {}),
          ...(d.fontes && d.fontes.length > 0 ? { fontes: d.fontes } : {}),
        },
      }
    }),
  )
  novas.forEach((indice, n) => {
    const id = ids[n]
    if (id) porAncora.set(uteis[indice].ancora, id)
  })

  return porAncora
}

/** O que aconteceu com a tentativa de fechar a dica de um item. */
export type ResultadoDoFechamentoDeCopy =
  /** Havia dica e o desfecho foi calculado e gravado. */
  | 'fechada'
  /** Havia dica, mas não deu para comparar os dois lados — fica pendente. */
  | 'indecisa'
  /** Aquele item nunca recebeu dica: quem chama registra a escolha absoluta. */
  | 'sem-dica'
  | 'erro'

/** Os blocos de copy que a bancada manda em `escolhido.blocos`. */
export function blocosDaEscolha(escolhido: unknown): string[] {
  if (Array.isArray(escolhido)) {
    return escolhido.filter((b): b is string => typeof b === 'string' && b.trim() !== '')
  }
  if (!escolhido || typeof escolhido !== 'object') return []
  const blocos = (escolhido as { blocos?: unknown }).blocos
  return Array.isArray(blocos)
    ? blocos.filter((b): b is string => typeof b === 'string' && b.trim() !== '')
    : []
}

/**
 * Fecha a dica de copy de um item de plano, comparando o texto PROPOSTO com o
 * texto FINAL.
 *
 * 🔴 O desfecho é CALCULADO aqui, nunca declarado pela tela — mesma regra de
 * `avaliarSlotSugerido`. Quem está gerando a arte tem todo incentivo a relatar
 * acerto, e o card deixa editar a copy depois de o item ter nascido de uma
 * dica.
 *
 * Diff ILEGÍVEL (ou copy final vazia) devolve `indecisa` e NÃO grava nada: a
 * proposta continua pendente e a varredura de expiração a fecha como
 * `expirada`. "Não sei" nunca vira aceitação — é a regra central de
 * `diff-copy.ts`.
 */
export async function fecharDicaDeCopyDoItem(entrada: {
  projectId: number
  itemDePlanoId: string
  copyFinal: string[]
  decididoPor?: string | null
  superficie?: Superficie
  generationId?: string | null
  postId?: string | null
}): Promise<ResultadoDoFechamentoDeCopy> {
  try {
    const item = await db.itemDePlano.findFirst({
      where: { id: entrada.itemDePlanoId, projectId: entrada.projectId },
      select: { sugestaoId: true, quando: true, campaignId: true, sourcePageId: true },
    })
    if (!item) return 'sem-dica'

    const ancora = ancoraDaDica(item)
    if (!ancora) return 'sem-dica'

    const sinal = await db.learningSignal.findFirst({
      where: {
        projectId: entrada.projectId,
        tipo: 'copy',
        chave: { startsWith: prefixoDaDica(entrada.projectId, ancora) },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, sugerido: true },
    })
    if (!sinal) return 'sem-dica'

    const propostos = (sinal.sugerido as { blocos?: unknown } | null)?.blocos
    const blocos = Array.isArray(propostos)
      ? propostos.filter((b): b is string => typeof b === 'string')
      : null
    // A comparação mora no contrato PURO (`fechar-copy-por-pagina-contrato`),
    // que é o mesmo usado pelo resolvedor por página: duas cópias da regra
    // fariam a mesma edição virar `editada` num caminho e `aceita-como-veio` no
    // outro, conforme a superfície.
    const decisao = decidirDesfechoDaCopy(blocos, entrada.copyFinal)
    if (decisao.acao !== 'fechar') return 'indecisa'

    await registrarDesfecho({
      sugestaoId: sinal.id,
      desfecho: decisao.desfecho,
      escolhido: { blocos: entrada.copyFinal },
      diff: decisao.diff,
      decididoPor: entrada.decididoPor ?? null,
      superficie: entrada.superficie ?? 'bancada',
      generationId: entrada.generationId ?? null,
      postId: entrada.postId ?? null,
      pageId: item.sourcePageId ?? null,
      campaignId: item.campaignId ?? null,
    })
    return 'fechada'
  } catch (erro) {
    console.error('[aprendizado] falha ao fechar a dica de copy (seguindo sem ela):', erro)
    return 'erro'
  }
}
