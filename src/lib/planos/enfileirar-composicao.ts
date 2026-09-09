import stableStringify from 'json-stable-stringify'
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { itemExecutavel } from './execucao'
import { normalizarStatusDoItem } from './vocabulario'
import type { SpecDePeca } from '@/lib/compositor/spec'
import type { Prisma } from '../../../prisma/generated/client'

/** Item, geração e job são um único commit. Nenhum render dentro da transação. */
export async function enfileirarComposicaoDoPlano(
  spec: SpecDePeca,
  data: Prisma.GenerationUncheckedCreateInput,
  decididoPor: string | null,
  autor: string | null,
  itemAtualizadoEm?: Date | string,
) {
  return db.$transaction(async (tx) => {
    // Serializa reenvios do mesmo item, inclusive de invocações diferentes.
    await tx.$queryRaw`SELECT id FROM "ItemDePlano" WHERE id = ${spec.itemDePlanoId} AND "projectId" = ${spec.projectId} FOR UPDATE`
    const item = await tx.itemDePlano.findFirst({ where: {
      id: spec.itemDePlanoId, projectId: spec.projectId,
      ...(spec.planoId ? { planoId: spec.planoId } : {}),
    } })
    if (!item) throw new CreativeError('ITEM_NAO_ENCONTRADO', 'Item não encontrado neste plano.', 404)
    const status = normalizarStatusDoItem(item.status) ?? 'proposto'
    if (itemExecutavel(status) && itemAtualizadoEm && new Date(itemAtualizadoEm).getTime() !== item.updatedAt.getTime()) {
      throw new CreativeError('ITEM_EXECUCAO_CONCORRENTE', 'O item foi alterado durante a preparação. Releia o plano.', 409)
    }
    const anterior = item.generationId
      ? await tx.generation.findUnique({ where: { id: item.generationId } }) : null
    // Revisão de conteúdo, independente de transições/updatedAt e da ordem das chaves JSON.
    const revisao = stableStringify({
      candidatas: item.fotoCandidatas, copy: item.copyProposta, foto: [item.fotoDriveId, item.fotoUrl], formato: item.formato,
      quando: item.quando, tema: item.tema, legenda: item.legenda, via: item.via,
      modelo: item.sourcePageId, direcao: item.direcao, ajuste: item.ajusteDaFoto,
      referencias: item.referencias, cliente: item.clienteProjectId,
      escopo: item.escopo, campanha: item.campaignId,
    })
    const jobAnterior = anterior ? await tx.generationJob.findUnique({ where: { generationId: anterior.id } }) : null
    const fv = jobAnterior?.payload as { spec?: unknown; planoRevisao?: string } | null
    const mesmaRevisao = fv?.planoRevisao === revisao && stableStringify(fv?.spec) === stableStringify(spec)
    if (status !== 'reprovado' && anterior && mesmaRevisao && (anterior.status === 'PROCESSING' || (anterior.status === 'COMPLETED' && anterior.resultUrl))) {
      if (jobAnterior) return { generationId: anterior.id, jobId: jobAnterior.id, spec }
    }
    if (!itemExecutavel(status)) {
      throw new CreativeError('ITEM_EXECUCAO_CONCORRENTE', 'O item já avançou ou foi revisado. Releia o plano antes de continuar.', 409)
    }
    const generation = await tx.generation.create({ data, select: { id: true } })
    const payload = JSON.parse(JSON.stringify({ generationId: generation.id, projectId: spec.projectId, spec, decididoPor, autor, planoRevisao: revisao }))
    const job = await tx.generationJob.create({ data: {
      generationId: generation.id, projectId: spec.projectId, kind: 'COMPOR', maxAttempts: 3, payload,
    }, select: { id: true } })
    await tx.itemDePlano.update({ where: { id: item.id }, data: {
      status: 'na-fila', generationId: generation.id, pageId: null, erro: null,
    } })
    return { generationId: generation.id, jobId: job.id, spec }
  })
}
