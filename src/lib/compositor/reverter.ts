/**
 * REVERTER a arte para como o compositor a entregou (F4 do plano) — o "git"
 * de uma peça. O snapshot mora em `Generation.fieldValues.layersSnapshot`,
 * gravado no persist; aqui ele volta para a `Page`, e os posts agendados que
 * renderizam dela voltam à fila de render (`invalidateScheduledRenders`).
 */

import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { invalidateScheduledRenders } from '@/lib/posts/invalidate-renders'
import { validarCamadas } from '@/lib/creatives/layer-contract'

export interface ReversaoDeArte {
  generationId: string
  pageId: string
  camadas: number
  invalidados: number
  congelados: string[]
}

export async function reverterCamadasDaArte(generationId: string, opts: { projectId?: number } = {}): Promise<ReversaoDeArte> {
  const gen = await db.generation.findUnique({ where: { id: generationId }, select: { id: true, projectId: true, fieldValues: true } })
  if (!gen) throw new CreativeError('GENERATION_NOT_FOUND', 'Arte não encontrada', 404)
  if (opts.projectId !== undefined && gen.projectId !== opts.projectId) throw new CreativeError('PROJETO_SEM_ACESSO', 'A arte não é deste cliente', 403)

  const fv = (gen.fieldValues && typeof gen.fieldValues === 'object' ? gen.fieldValues : {}) as Record<string, unknown>
  const pageId = typeof fv.pageId === 'string' ? fv.pageId : null
  if (!pageId) throw new CreativeError('SEM_PAGINA', 'Esta arte não tem página editável para reverter', 422)
  const v = validarCamadas(fv.layersSnapshot)
  if (v.camadas.length === 0) throw new CreativeError('SEM_SNAPSHOT', 'Esta arte não guardou o snapshot das camadas (só peças do compositor guardam)', 422)

  const page = await db.page.findUnique({ where: { id: pageId }, select: { id: true, isTemplate: true } })
  if (!page) throw new CreativeError('PAGE_NOT_FOUND', 'A página desta arte não existe mais', 404)
  if (page.isTemplate) throw new CreativeError('PAGINA_E_MODELO', 'A página virou modelo do cliente; reverter apagaria a curadoria', 409)

  const r = await db.$transaction(async (tx) => {
    await tx.page.update({ where: { id: pageId }, data: { layers: JSON.stringify(v.camadas) } })
    return invalidateScheduledRenders(tx, { pageIds: [pageId] })
  })
  return { generationId, pageId, camadas: v.camadas.length, invalidados: r.invalidados, congelados: r.congelados }
}
