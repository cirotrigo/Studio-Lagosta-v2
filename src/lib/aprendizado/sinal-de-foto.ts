/**
 * O FECHAMENTO do sinal de foto fora da bancada.
 *
 * `buscarNoAcervo` emite a proposta (a lista ranqueada, com o topo como
 * recomendação) em toda busca — inclusive nas que vêm do chat, pela tool
 * `buscar-fotos`. Mas só a bancada devolve o desfecho: o seletor de imagens
 * conhece o `sugestaoId` e o posta para `/aprendizado/desfecho`.
 *
 * No chat e na via de TEMPLATE ninguém carregava esse id de volta, e a
 * proposta ficava pendente para sempre — até a varredura de expiração fechá-la
 * como `expirada`. O registro seria uma MENTIRA: "ninguém decidiu" quando na
 * verdade a foto proposta virou arte. E como a via de template é a mais usada
 * da casa, o corpus nasceria enviesado justamente onde tem mais volume.
 *
 * A saída é a mesma de `sinal-de-modelo.ts`: fechar por RECONCILIAÇÃO. Achado
 * no teste ponta a ponta de 10/08/2026.
 *
 * ⚠️ Nada aqui lança — contrato de `captura.ts`.
 */

import { db } from '@/lib/db'
import { registrarDesfecho } from './captura'
import type { Superficie } from './vocabulario'

/**
 * Mesma janela do sinal de modelo, e pela mesma razão: cobre a conversa
 * inteira entre buscar a foto e criar a arte, sem colar a arte de hoje na
 * busca de ontem.
 */
const JANELA_DE_FECHAMENTO_MS = 6 * 3_600_000

/** Quantas propostas em aberto olhamos para achar a que contém a foto usada. */
const PROPOSTAS_INSPECIONADAS = 5

interface PropostaDeFoto {
  topo?: unknown
  propostas?: unknown
}

/** Os `driveFileId` que a proposta ofereceu, na ordem em que foram ranqueados. */
function idsPropostos(sugerido: unknown): string[] {
  const s = (sugerido ?? {}) as PropostaDeFoto
  if (!Array.isArray(s.propostas)) return []
  return s.propostas
    .map((p) => (p && typeof p === 'object' ? (p as { driveFileId?: unknown }).driveFileId : null))
    .filter((id): id is string => typeof id === 'string')
}

/**
 * Fecha a proposta de foto que a arte de fato consumiu.
 *
 * Conservador de propósito: só fecha proposta EM ABERTO, do mesmo projeto,
 * dentro da janela, **cuja lista ofereceu a foto usada**. Foto que veio de
 * fora da proposta (upload, link direto, busca manual no Drive) não fecha nada
 * — a proposta merece expirar, porque de fato ninguém a seguiu.
 *
 * `aceita-como-veio` quando a arte levou o TOPO da lista; `trocada` quando
 * levou outra da mesma lista — que é o sinal que interessa aprender, porque
 * diz que o rodízio ofereceu a foto errada primeiro.
 */
export async function fecharSugestaoDeFoto(entrada: {
  projectId: number
  /** O `driveFileId` que virou a imagem da arte. */
  driveFileIdUsado: string
  generationId?: string | null
  pageId?: string | null
  decididoPor?: string | null
  superficie?: Superficie
  /** Quando o chamador já sabe qual proposta fechar, pula a reconciliação. */
  sugestaoId?: string | null
}): Promise<void> {
  try {
    if (!entrada.driveFileIdUsado) return

    let sugestaoId = entrada.sugestaoId ?? null
    let eraOTopo = false

    if (!sugestaoId) {
      const abertas = await db.learningSignal.findMany({
        where: {
          projectId: entrada.projectId,
          tipo: 'foto',
          desfecho: null,
          sugeridoEm: { gte: new Date(Date.now() - JANELA_DE_FECHAMENTO_MS) },
        },
        orderBy: { sugeridoEm: 'desc' },
        take: PROPOSTAS_INSPECIONADAS,
        select: { id: true, sugerido: true },
      })

      for (const aberta of abertas) {
        if (!idsPropostos(aberta.sugerido).includes(entrada.driveFileIdUsado)) continue
        sugestaoId = aberta.id
        eraOTopo = (aberta.sugerido as PropostaDeFoto)?.topo === entrada.driveFileIdUsado
        break
      }
    }

    if (!sugestaoId) return

    await registrarDesfecho({
      sugestaoId,
      desfecho: eraOTopo ? 'aceita-como-veio' : 'trocada',
      escolhido: { driveFileId: entrada.driveFileIdUsado },
      generationId: entrada.generationId ?? null,
      pageId: entrada.pageId ?? null,
      decididoPor: entrada.decididoPor ?? null,
      superficie: entrada.superficie ?? 'chat',
    })
  } catch (erro) {
    console.error('[aprendizado] falha ao fechar sugestão de foto (seguindo sem ela):', erro)
  }
}
