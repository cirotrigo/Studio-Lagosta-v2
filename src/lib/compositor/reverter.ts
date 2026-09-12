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
  /** As camadas voltaram, mas o contrato da copy não registrou a volta (histórico cheio) — ficou como estava. */
  avisos?: string[]
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

  // F1: o contrato da página acompanha as camadas restauradas — a reversão é
  // uma revisão do SISTEMA (motivo `reverter-arte`), na mesma transação; sem
  // isso a próxima edição levaria a culpa pelo que a reversão desfez (R09).
  // 🔴 A revisão é calculada sobre a página RELIDA na escrita e a escrita é
  // condicionada a ela (`gravarCamadasComRevisao`, PR3-F01 da revisão FINAL do
  // Codex sobre abac9b34, 18/09/2026): lida antes, um PATCH no meio deixava as
  // camadas do snapshot com o contrato do PATCH e apagava a revisão dele.
  const { gravarCamadasComRevisao } = await import('@/lib/copy-autoral/persistir')
  const camadasDoSnapshot = JSON.stringify(v.camadas)
  const r = await db.$transaction(async (tx) => {
    const g = await gravarCamadasComRevisao(tx, {
      pageId,
      camadas: () => camadasDoSnapshot,
      quem: { autor: 'sistema', motivo: 'reverter-arte (camadas do snapshot)', superficie: 'reverter-arte' },
      // A leitura de hoje sobre as camadas de ANTES é do sistema (PR5-06); a diferença para o snapshot é da reversão.
      reconciliarComAnteriores: true,
    })
    if (!g) throw new CreativeError('PAGE_NOT_FOUND', 'A página desta arte não existe mais', 404)
    const inv = await invalidateScheduledRenders(tx, { pageIds: [pageId] })
    return { ...inv, aviso: g.aviso }
  })
  // Recusa do contrato (histórico cheio, copy que não cabe): a reversão segue, o contrato fica como estava e o motivo sai no retorno.
  const avisos = r.aviso ? [r.aviso] : []
  if (avisos.length > 0) console.warn(`[reverter-arte] ${pageId}: ${avisos[0]}`)
  /**
   * O outro lado da invalidação: a arte CONGELADA desta página (o slide de
   * carrossel) não volta para a fila de render, então reverter as camadas não
   * chegaria ao post. Fora da transação, porque o job precisa enxergar a
   * página já gravada. Ver `recompor.ts`.
   */
  const { pedirRecomposicaoDaArteCongelada } = await import('./recompor')
  await pedirRecomposicaoDaArteCongelada([pageId])
  return { generationId, pageId, camadas: v.camadas.length, invalidados: r.invalidados, congelados: r.congelados, ...(avisos.length > 0 ? { avisos } : {}) }
}
