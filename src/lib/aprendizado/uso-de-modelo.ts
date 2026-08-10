/**
 * Contador de uso de página-modelo — o espelho colunar do que hoje só existe
 * dentro de `Generation.fieldValues`.
 *
 * `fieldValues` é Json SEM índice: descobrir "qual modelo este cliente mais
 * usa" exige varrer a tabela de artes inteira por path. `Page.usedCount` e
 * `Page.lastUsedAt` respondem isso com um índice — e é o mesmo par que a
 * curadoria de modelos (F0.4) teve de reconstruir na mão em 10/08.
 *
 * Precedente idêntico na casa: `Generation.styleRefAt` / `styleRefUsedAt`,
 * criados para o rodízio de referências de estilo.
 *
 * ⚠️ Este módulo só INCREMENTA — a LEITURA dos dois livros-caixa históricos
 * (que é outra pergunta, e mais suja) vive em `historico-de-artes.ts`.
 *
 * Quem já conta: `createArteRapida` e o `finalize` do gerar-criativo. O
 * contador é PROSPECTIVO — ele nasce zerado e não conhece o passado; para
 * "quanto este modelo foi usado até hoje" é `lerUsosDeModelo` que responde.
 */

import { db } from '@/lib/db'
import type { Prisma } from '../../../prisma/generated/client'

/**
 * Registra que a página foi usada como base de uma arte.
 *
 * Nunca lança: contagem de uso é telemetria, e uma linha a menos no contador
 * não pode impedir alguém de criar a arte.
 *
 * `updateMany` (e não `update`) porque página apagada entre a leitura e aqui
 * é normal — `update` lançaria por not-found.
 */
export async function registrarUsoDeModelo(pageId: string | null | undefined): Promise<void> {
  if (!pageId) return
  try {
    await db.page.updateMany({
      where: { id: pageId },
      data: { usedCount: { increment: 1 }, lastUsedAt: new Date() },
    })
  } catch (erro) {
    console.error(`[aprendizado] falha ao contar uso do modelo ${pageId}:`, erro)
  }
}

/**
 * Ordenação canônica de "menos usado primeiro", para quem for montar rodízio
 * de modelo em cima destas colunas.
 *
 * 🔴 Em Postgres, `ORDER BY … ASC` é **NULLS LAST**: sem o `nulls: 'first'`
 * explícito, o modelo JÁ USADO (que tem timestamp) vem antes do NUNCA USADO
 * (que é NULL) — o oposto do pretendido. Foi exatamente esse defeito que fez a
 * mesma referência de estilo sair cinco vezes seguidas em 10/08.
 */
export const MENOS_USADO_PRIMEIRO: Prisma.PageOrderByWithRelationInput[] = [
  { lastUsedAt: { sort: 'asc', nulls: 'first' } },
  { usedCount: 'asc' },
]
