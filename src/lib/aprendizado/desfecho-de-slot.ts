/**
 * Fecha o desfecho de um SLOT sugerido quando o post nasce.
 *
 * O desfecho é decidido NO SERVIDOR, comparando o horário proposto com o que
 * de fato foi agendado — nunca aceitando o rótulo que a superfície mandou.
 * Quem agenda tem interesse em relatar sucesso, e um "aceitei" declarado pela
 * bancada (ou pelo modelo, no chat) é justamente o viés que a captura existe
 * para evitar. A bancada, aliás, deixa mudar data e hora no card DEPOIS de o
 * item ter nascido de um slot: quem só olhasse o `sugestaoId` contaria essa
 * edição como aceitação.
 *
 * Regra única para as duas vias:
 *
 *   horário igual ao proposto → `aceita-como-veio` (origem `sugerido-aceito`)
 *   horário diferente        → `editada`           (origem `sugerido-editado`)
 *
 * `trocada` fica reservado para substituição de COISA (outra foto, outro
 * modelo); `descartada`, para a proposta jogada fora sem post nenhum.
 *
 * Nada aqui lança: quando isto roda, o post ou já existe ou está prestes a
 * existir, e sinal perdido é barato — post perdido não.
 */

import { db } from '@/lib/db'
import { parseBRT } from '@/lib/creatives/agendar'
import type { OrigemDecisao } from '@/lib/posts/learning-scope'
import { registrarDesfecho } from './captura'
import type { Desfecho, Superficie } from './vocabulario'

/** Tolerância de comparação: um minuto de arredondamento não é edição. */
const TOLERANCIA_MS = 60_000

/** O que a sugestão de slot guarda em `sugerido` (ver `sugerir-posts.ts`). */
interface SlotSugerido {
  scheduledDatetime?: string
}

export interface VereditoDoSlot {
  sugestaoId: string
  desfecho: Extract<Desfecho, 'aceita-como-veio' | 'editada'>
  origem: Extract<OrigemDecisao, 'sugerido-aceito' | 'sugerido-editado'>
  /** Horário proposto, em ms — para o registro do que foi comparado. */
  propostoEm: number
  finalEm: number
}

function paraMs(quando: string | Date | null | undefined): number | null {
  if (!quando) return null
  try {
    const d = quando instanceof Date ? quando : parseBRT(quando)
    const t = d.getTime()
    return Number.isNaN(t) ? null : t
  } catch {
    return null
  }
}

/**
 * Compara o horário agendado com o proposto. `null` quando não dá para
 * concluir — e "não dá para concluir" NUNCA vira aceitação: o sinal fica
 * pendente e a varredura de expiração o fecha como `expirada`. Gravar
 * `aceita-como-veio` no escuro é como a taxa de aceitação vira 100% sozinha.
 */
export async function avaliarSlotSugerido(
  sugestaoId: string | null | undefined,
  quandoFinal: string | Date,
): Promise<VereditoDoSlot | null> {
  const id = sugestaoId?.trim()
  if (!id) return null

  try {
    const sinal = await db.learningSignal.findUnique({
      where: { id },
      select: { sugerido: true },
    })
    if (!sinal) {
      console.warn(`[aprendizado] sugestão ${id} não existe — desfecho de slot descartado`)
      return null
    }

    const proposto = paraMs((sinal.sugerido as SlotSugerido | null)?.scheduledDatetime)
    const final = paraMs(quandoFinal)
    if (proposto === null || final === null) {
      console.warn(`[aprendizado] sugestão ${id} sem horário comparável — desfecho em aberto`)
      return null
    }

    const igual = Math.abs(final - proposto) <= TOLERANCIA_MS
    return {
      sugestaoId: id,
      desfecho: igual ? 'aceita-como-veio' : 'editada',
      origem: igual ? 'sugerido-aceito' : 'sugerido-editado',
      propostoEm: proposto,
      finalEm: final,
    }
  } catch (erro) {
    console.error('[aprendizado] falha ao avaliar o slot sugerido (seguindo sem ele):', erro)
    return null
  }
}

/** Grava o veredito de `avaliarSlotSugerido`, já com o post que nasceu dele. */
export async function fecharDesfechoDoSlot(
  veredito: VereditoDoSlot | null,
  vinculos: {
    postId?: string | null
    generationId?: string | null
    pageId?: string | null
    /** `User.id` INTERNO (cuid), NUNCA o clerkId. */
    decididoPor?: string | null
    superficie?: Superficie
  } = {},
): Promise<void> {
  if (!veredito) return
  await registrarDesfecho({
    sugestaoId: veredito.sugestaoId,
    desfecho: veredito.desfecho,
    escolhido: {
      scheduledDatetime: new Date(veredito.finalEm).toISOString(),
      propostoPara: new Date(veredito.propostoEm).toISOString(),
      ...(vinculos.postId ? { postId: vinculos.postId } : {}),
    },
    postId: vinculos.postId ?? undefined,
    generationId: vinculos.generationId ?? undefined,
    pageId: vinculos.pageId ?? undefined,
    decididoPor: vinculos.decididoPor ?? undefined,
    superficie: vinculos.superficie ?? 'bancada',
  })
}
