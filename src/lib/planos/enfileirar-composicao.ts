import stableStringify from 'json-stable-stringify'
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { normalizarStatusDoItem } from './vocabulario'
import {
  classificarPecaDoItem,
  confrontarComOGravado,
  confrontarRevisaoDaLinha,
  decidirNoItemDoPlano,
  type FichaDoItem,
  type MotivoDaRecusaDoItem,
} from './decisao-do-item'
import type { SpecDePeca } from '@/lib/compositor/spec'
import type { RecuperacaoDaReserva } from '@/lib/lotes/identidade'
import type { Prisma } from '../../../prisma/generated/client'

export { mesmaSpecDaPeca } from './decisao-do-item'

/** Item, geração e job são um único commit. Nenhum render dentro da transação. */
export async function enfileirarComposicaoDoPlano(
  spec: SpecDePeca,
  data: Prisma.GenerationUncheckedCreateInput,
  decididoPor: string | null,
  autor: string | null,
  itemAtualizadoEm?: Date | string,
) {
  const { reaproveitado: _reaproveitado, retomado: _retomado, planoRevisao: _planoRevisao, ...peca } = await db.$transaction((tx) => enfileirarComposicaoDoPlanoEm(tx, spec, data, decididoPor, autor, itemAtualizadoEm))
  return peca
}

const MENSAGEM_DA_RECUSA: Record<MotivoDaRecusaDoItem, string> = {
  reprovado: 'O item foi reprovado. Devolva-o à fila antes de produzir.',
  ficha: 'O item foi alterado durante a preparação. Releia o plano.',
  avancou: 'O item já avançou. Releia o plano antes de continuar.',
  revisado: 'O item foi revisado depois deste pedido. Releia o plano antes de continuar.',
}

/** A revisão de CONTEÚDO do item, independente de transições/updatedAt e da ordem das chaves JSON. */
function revisaoDoItem(item: {
  fotoCandidatas: unknown; copyProposta: unknown; fotoDriveId: unknown; fotoUrl: unknown; formato: unknown
  quando: unknown; tema: unknown; legenda: unknown; via: unknown; sourcePageId: unknown; direcao: unknown
  ajusteDaFoto: unknown; referencias: unknown; clienteProjectId: unknown; escopo: unknown; campaignId: unknown
}): string {
  return stableStringify({
    candidatas: item.fotoCandidatas, copy: item.copyProposta, foto: [item.fotoDriveId, item.fotoUrl], formato: item.formato,
    quando: item.quando, tema: item.tema, legenda: item.legenda, via: item.via,
    modelo: item.sourcePageId, direcao: item.direcao, ajuste: item.ajusteDaFoto,
    referencias: item.referencias, cliente: item.clienteProjectId,
    escopo: item.escopo, campanha: item.campaignId,
  })
}

/**
 * A revisão do item AGORA, lida sem trava — a reserva do lote a grava na linha
 * quando ela nasce (C11-1): é a revisão sob a qual o pedido chegou. Quem decide
 * é a trava do item, que confere de novo. Item que não existe devolve `null` (o
 * caminho do plano recusa com 404 sob a trava).
 */
export async function revisaoDoItemParaAReserva(spec: SpecDePeca): Promise<string | null> {
  const item = await db.itemDePlano.findFirst({ where: {
    id: spec.itemDePlanoId, projectId: spec.projectId,
    ...(spec.planoId ? { planoId: spec.planoId } : {}),
  } })
  return item ? revisaoDoItem(item) : null
}

function fichaDoItem(itemAtualizadoEm: Date | string | undefined, atualizadoEm: unknown): FichaDoItem {
  if (!itemAtualizadoEm) return 'ausente'
  return new Date(itemAtualizadoEm).getTime() === new Date(atualizadoEm as Date).getTime() ? 'confere' : 'diverge'
}

/**
 * O mesmo, dentro de uma transação que já existe — a reserva do item de lote
 * (`src/lib/lotes/reserva.ts`) liga a linha dela à Generation no mesmo commit.
 *
 * Toda entrada passa pela MESMA decisão (`decidirNoItemDoPlano`, revisão final
 * R05–R06), tomada sob a trava do item sobre o estado relido: com ou sem lote,
 * com ou sem a linha do lote ligada à peça. `lote` liga as comparações do
 * lote e traz `revisaoDaLinha`, a revisão do item gravada na linha (lida sob a
 * trava DELA): com lote, só se produz quando ela é a revisão do item agora
 * (C11-1). `lote.recuperacao` (o que a linha decidiu antes desta trava) não
 * entra na decisão — a linha fresca que adota uma peça sem job (R05) e a linha
 * ligada que a declarou morta chegam à mesma resposta pelo estado.
 *
 * `reaproveitado` diz se a peça devolvida já existia; `retomado`, se a peça
 * que o item tinha foi refeita (job novo, ou Generation nova no lugar dela);
 * `planoRevisao`, a revisão do item sob a qual a peça vale — a reserva a grava
 * na linha junto do vínculo.
 */
export async function enfileirarComposicaoDoPlanoEm(
  tx: Prisma.TransactionClient,
  spec: SpecDePeca,
  data: Prisma.GenerationUncheckedCreateInput,
  decididoPor: string | null,
  autor: string | null,
  itemAtualizadoEm?: Date | string,
  lote?: { recuperacao: RecuperacaoDaReserva | null; revisaoDaLinha?: string | null } | null,
) {
  const comLote = !!lote
  // Serializa reenvios do mesmo item, inclusive de invocações diferentes.
  await tx.$queryRaw`SELECT id FROM "ItemDePlano" WHERE id = ${spec.itemDePlanoId} AND "projectId" = ${spec.projectId} FOR UPDATE`
  const item = await tx.itemDePlano.findFirst({ where: {
    id: spec.itemDePlanoId, projectId: spec.projectId,
    ...(spec.planoId ? { planoId: spec.planoId } : {}),
  } })
  if (!item) throw new CreativeError('ITEM_NAO_ENCONTRADO', 'Item não encontrado neste plano.', 404)
  const status = normalizarStatusDoItem(item.status) ?? 'proposto'
  // O job ANTES da Generation: o runner fecha a Generation e só depois o job,
  // então ler nesta ordem nunca vê "Generation aberta com job já terminado" de
  // uma peça que acabou de ficar pronta entre as duas leituras.
  const jobAnterior = item.generationId ? await tx.generationJob.findUnique({ where: { generationId: item.generationId } }) : null
  const anterior = item.generationId
    ? await tx.generation.findUnique({ where: { id: item.generationId } }) : null
  const revisao = revisaoDoItem(item)
  const peca = classificarPecaDoItem({ generationId: item.generationId, geracao: anterior, job: jobAnterior })

  const decisao = decidirNoItemDoPlano({
    status,
    ficha: fichaDoItem(itemAtualizadoEm, item.updatedAt),
    peca,
    ...confrontarComOGravado({ spec, revisao, comLote, geracao: anterior, job: jobAnterior }),
    linha: confrontarRevisaoDaLinha({ comLote, revisaoDaLinha: lote?.revisaoDaLinha, revisao }),
  })

  switch (decisao.acao) {
    case 'reaproveitar':
      return { generationId: anterior!.id, jobId: jobAnterior?.id ?? '', spec, reaproveitado: true, retomado: false, planoRevisao: revisao }
    case 'refazer-job': {
      // A MESMA Generation, um job novo com a revisão do item; o item fica onde está.
      const jobId = await criarJobDoItem(tx, anterior!.id, spec, revisao, decididoPor, autor)
      return { generationId: anterior!.id, jobId, spec, reaproveitado: false, retomado: true, planoRevisao: revisao }
    }
    case 'nova-peca': {
      // A tabela só produz peça nova onde o item tem caminho até `na-fila`
      // (executável, ou em voo) — o teste da tabela confere isso.
      const criada = await criarPecaDoItem(tx, item.id, spec, data, revisao, decididoPor, autor)
      return { ...criada, retomado: peca !== 'nenhuma', planoRevisao: revisao }
    }
    default:
      throw new CreativeError('ITEM_EXECUCAO_CONCORRENTE', MENSAGEM_DA_RECUSA[decisao.motivo], 409, { motivo: decisao.motivo })
  }
}

/** Generation (com a revisão gravada), job e o vínculo do item — sempre juntos. */
async function criarPecaDoItem(
  tx: Prisma.TransactionClient,
  itemId: string,
  spec: SpecDePeca,
  data: Prisma.GenerationUncheckedCreateInput,
  revisao: string,
  decididoPor: string | null,
  autor: string | null,
) {
  // A revisão também fica NA Generation: se o job sumir, é o que resta para
  // conferir que o item não foi revisado (R02).
  const fieldValues = data.fieldValues && typeof data.fieldValues === 'object' && !Array.isArray(data.fieldValues)
    ? { ...(data.fieldValues as Record<string, unknown>), planoRevisao: revisao } : data.fieldValues
  const generation = await tx.generation.create({ data: { ...data, fieldValues: fieldValues as never }, select: { id: true } })
  const jobId = await criarJobDoItem(tx, generation.id, spec, revisao, decididoPor, autor)
  await tx.itemDePlano.update({ where: { id: itemId }, data: {
    status: 'na-fila', generationId: generation.id, pageId: null, erro: null,
  } })
  return { generationId: generation.id, jobId, spec, reaproveitado: false }
}

async function criarJobDoItem(tx: Prisma.TransactionClient, generationId: string, spec: SpecDePeca, revisao: string, decididoPor: string | null, autor: string | null) {
  const payload = JSON.parse(JSON.stringify({ generationId, projectId: spec.projectId, spec, decididoPor, autor, planoRevisao: revisao }))
  const job = await tx.generationJob.create({ data: {
    generationId, projectId: spec.projectId, kind: 'COMPOR', maxAttempts: 3, payload,
  }, select: { id: true } })
  return job.id
}
