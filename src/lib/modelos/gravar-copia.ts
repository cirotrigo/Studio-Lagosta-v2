/**
 * S4 — grava a cópia de um modelo (`copiarPaginaDeModelo`) no fim da pasta de destino, numa transação, com as DUAS
 * invalidações do AGENTS (página nova: ali são no-ops, e nunca são dispensadas por isso — precedente: o T5).
 * Quem chama já conferiu projeto, acesso e que o destino não é a Assinatura.
 */
import { db } from '@/lib/db'
import { pedirRecomposicaoDaArteCongelada } from '@/lib/compositor/recompor'
import { invalidateScheduledRenders } from '@/lib/posts/invalidate-renders'
import type { PaginaCopiada } from './copiar-pagina'

export async function gravarCopiaDoModelo(args: {
  origemId: string
  destinoTemplateId: number
  copia: PaginaCopiada
  /** "Usar" conta um uso do modelo; "Duplicar" não é uso. */
  contarUso: boolean
}): Promise<{ pageId: string }> {
  const { origemId, destinoTemplateId, copia, contarUso } = args
  const pageId = await db.$transaction(async (tx) => {
    const ultima = await tx.page.findFirst({ where: { templateId: destinoTemplateId }, orderBy: { order: 'desc' }, select: { order: true } })
    const nova = await tx.page.create({
      data: { ...copia, order: (ultima?.order ?? -1) + 1, templateId: destinoTemplateId },
      select: { id: true },
    })
    if (contarUso) await tx.page.update({ where: { id: origemId }, data: { usedCount: { increment: 1 }, lastUsedAt: new Date() } })
    await invalidateScheduledRenders(tx, { pageIds: [nova.id] })
    return nova.id
  })
  await pedirRecomposicaoDaArteCongelada([pageId])
  return { pageId }
}

export const urlDoEditor = (templateId: number, pageId: string) => `/templates/${templateId}/editor?pageId=${encodeURIComponent(pageId)}`
