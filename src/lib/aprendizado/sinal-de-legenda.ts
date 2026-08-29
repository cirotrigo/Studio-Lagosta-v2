/**
 * O sinal de LEGENDA — a caption do post entra no corpus de aprendizado.
 *
 * O vão que este módulo fecha (achado em 29/08/2026): `registrarCopyDoPost`
 * captura os textos DA ARTE via `slotValues`, mas o post do fluxo de canvas —
 * carrossel de fotos + legenda, o caminho que passa a ser o padrão da carteira
 * — nasce SEM `slotValues`, e a captura de copy encerrava cedo. O corpus das
 * próximas semanas seria quase todo de legendas… que não eram gravadas.
 *
 * Duas entradas:
 *
 *   registrarLegendaDoPost()    — no agendamento: a legenda como foi proposta
 *                                 (escolha absoluta; ninguém sugeriu nada).
 *   registrarEdicaoDeLegenda()  — quando alguém edita a legenda de um rascunho:
 *                                 o lado "antes" é o texto que a produção
 *                                 propôs e o "depois" é o que o humano deixou —
 *                                 o par mais valioso do corpus.
 *
 * A edição REVISA a mesma linha (chave `legenda:post:<id>`), no molde de
 * `feedback-de-arte.ts`: o núcleo (`registrarDecisaoSemSugestao`) faz upsert
 * com `update: {}` de propósito, então a revisão mora aqui no serviço. O
 * desfecho continua `escolha-propria` — a linha segue sem sugestão do outro
 * lado (`exigeSugestao('editada')` é verdadeiro) — e a evidência da edição vai
 * em `diff` + `escolhido.editada`, preservando `legendaOriginal` da PRIMEIRA
 * gravação (mesmo princípio do balde do editor: o lado "antes" mais valioso é
 * o texto que a IA gerou).
 *
 * ⚠️ Nada aqui lança: contrato de `captura.ts`.
 */

import { db } from '@/lib/db'
import { registrarDecisaoSemSugestao } from './captura'
import { chaveDaLegenda } from './sinal-de-agendamento-contrato'
import type { Superficie } from './vocabulario'

export { chaveDaLegenda } from './sinal-de-agendamento-contrato'

/** Legenda acima disso é cortada no Json (o Instagram corta em 2.200 mesmo). */
const TETO_LEGENDA = 3000

function limpar(texto: string | null | undefined): string {
  return (texto ?? '').trim().slice(0, TETO_LEGENDA)
}

export interface LegendaDoPost {
  projectId: number
  postId: string
  legenda: string | null | undefined
  pageId?: string | null
  generationId?: string | null
  campaignId?: string | null
  decididoPor?: string | null
  superficie?: Superficie
}

/**
 * Registra a legenda comprometida no agendamento. Post sem legenda não vira
 * linha — não há texto para aprender.
 */
export async function registrarLegendaDoPost(entrada: LegendaDoPost): Promise<void> {
  const legenda = limpar(entrada.legenda)
  if (!legenda) return

  await registrarDecisaoSemSugestao({
    projectId: entrada.projectId,
    tipo: 'legenda',
    escolhido: { legenda },
    postId: entrada.postId,
    pageId: entrada.pageId ?? null,
    generationId: entrada.generationId ?? null,
    campaignId: entrada.campaignId ?? null,
    decididoPor: entrada.decididoPor ?? null,
    superficie: entrada.superficie ?? 'chat',
    chave: chaveDaLegenda(entrada.postId),
  })
}

export interface EdicaoDeLegenda {
  projectId: number
  postId: string
  /** O texto ANTES da edição (o que estava gravado no post). */
  antes: string | null | undefined
  /** O texto que ficou. */
  depois: string | null | undefined
  decididoPor?: string | null
  superficie?: Superficie
}

/**
 * Registra que a legenda foi EDITADA depois de comprometida.
 *
 * - Texto igual (após trim) é no-op — mover um post de horário não é editar a
 *   legenda.
 * - Linha existente é revisada: `escolhido.legenda` passa a ser o texto novo,
 *   `legendaOriginal` preserva a primeira proposta, `diff` guarda o par
 *   antes→depois desta edição e `revisoes` conta as reescritas.
 * - Post anterior ao recurso (sem linha) ganha uma completa, já com o par —
 *   corpus do mesmo jeito.
 */
export async function registrarEdicaoDeLegenda(entrada: EdicaoDeLegenda): Promise<void> {
  try {
    const antes = limpar(entrada.antes)
    const depois = limpar(entrada.depois)
    if (antes === depois) return

    const chave = chaveDaLegenda(entrada.postId)
    const existente = await db.learningSignal.findUnique({
      where: { chave },
      select: { id: true, escolhido: true },
    })

    if (!existente) {
      await registrarDecisaoSemSugestao({
        projectId: entrada.projectId,
        tipo: 'legenda',
        escolhido: { legenda: depois, legendaOriginal: antes, editada: true, revisoes: 1 },
        diff: { legenda: { antes, depois } },
        postId: entrada.postId,
        decididoPor: entrada.decididoPor ?? null,
        superficie: entrada.superficie ?? 'agenda',
        chave,
      })
      return
    }

    const atual = (existente.escolhido ?? {}) as Record<string, unknown>
    const legendaOriginal =
      typeof atual.legendaOriginal === 'string'
        ? atual.legendaOriginal
        : typeof atual.legenda === 'string'
          ? atual.legenda
          : antes
    const revisoes = (typeof atual.revisoes === 'number' ? atual.revisoes : 0) + 1

    await db.learningSignal.update({
      where: { id: existente.id },
      data: {
        escolhido: { legenda: depois, legendaOriginal, editada: true, revisoes },
        diff: { legenda: { antes, depois } },
        decididoEm: new Date(),
        ...(entrada.decididoPor ? { decididoPor: entrada.decididoPor } : {}),
        superficie: entrada.superficie ?? 'agenda',
      },
    })
  } catch (erro) {
    console.error('[aprendizado] falha ao registrar edição de legenda (seguindo sem ela):', erro)
  }
}
