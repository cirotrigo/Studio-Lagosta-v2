import stableStringify from 'json-stable-stringify'
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { caminhoAte, itemExecutavel } from './execucao'
import { normalizarStatusDoItem, type StatusDoItem } from './vocabulario'
import type { SpecDePeca } from '@/lib/compositor/spec'
import type { RecuperacaoDaReserva } from '@/lib/lotes/identidade'
import type { Prisma } from '../../../prisma/generated/client'

/** Item, geração e job são um único commit. Nenhum render dentro da transação. */
export async function enfileirarComposicaoDoPlano(
  spec: SpecDePeca,
  data: Prisma.GenerationUncheckedCreateInput,
  decididoPor: string | null,
  autor: string | null,
  itemAtualizadoEm?: Date | string,
) {
  const { reaproveitado: _reaproveitado, ...peca } = await db.$transaction((tx) => enfileirarComposicaoDoPlanoEm(tx, spec, data, decididoPor, autor, itemAtualizadoEm))
  return peca
}

/** Situações em que a peça do item está sendo produzida — não executáveis, mas retomáveis pelo lote. */
const EM_VOO: StatusDoItem[] = ['na-fila', 'gerando']
const JOB_TERMINAL = ['DONE', 'FAILED']

const RECUSA_REVISADO = () =>
  new CreativeError('ITEM_EXECUCAO_CONCORRENTE', 'O item já avançou ou foi revisado. Releia o plano antes de continuar.', 409)

/**
 * O mesmo, dentro de uma transação que já existe — a reserva do item de lote
 * (`src/lib/lotes/reserva.ts`) liga a linha dela à Generation no mesmo commit.
 * `reaproveitado` diz se a Generation devolvida já existia (mesma revisão).
 *
 * `recuperacao` (só o lote manda — revisão R01–R02) é a decisão de que a peça
 * que a linha do lote aponta MORREU (`geracao-e-job`) ou ficou sem job (`job`).
 * Sem ela, o comportamento de sempre.
 */
export async function enfileirarComposicaoDoPlanoEm(
  tx: Prisma.TransactionClient,
  spec: SpecDePeca,
  data: Prisma.GenerationUncheckedCreateInput,
  decididoPor: string | null,
  autor: string | null,
  itemAtualizadoEm?: Date | string,
  recuperacao?: RecuperacaoDaReserva | null,
) {
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
  const jobAnterior = item.generationId ? await tx.generationJob.findUnique({ where: { generationId: item.generationId } }) : null
  const fv = jobAnterior?.payload as { spec?: unknown; planoRevisao?: string } | null
  const mesmaRevisao = fv?.planoRevisao === revisao && stableStringify(fv?.spec) === stableStringify(spec)

  // A peça que o LOTE declarou morta (ou sem job) ainda é a do item: o lote
  // manda na retomada, nunca o reaproveitamento abaixo.
  const retomandoAPecaDoItem = !!recuperacao && item.generationId === recuperacao.generationId
  if (retomandoAPecaDoItem && EM_VOO.includes(status)) {
    return retomarPecaEmVoo(tx, { item, status, anterior, jobAnterior, mesmaRevisao, revisao, spec, data, decididoPor, autor, recuperacao: recuperacao! })
  }

  // Na retomada do lote, Generation aberta com job TERMINAL não é peça viva (R01).
  const jobServe = !!jobAnterior && !(recuperacao && anterior?.status === 'PROCESSING' && JOB_TERMINAL.includes(jobAnterior.status))
  if (!retomandoAPecaDoItem && status !== 'reprovado' && anterior && mesmaRevisao && (anterior.status === 'PROCESSING' || (anterior.status === 'COMPLETED' && anterior.resultUrl))) {
    if (jobServe) return { generationId: anterior.id, jobId: jobAnterior!.id, spec, reaproveitado: true }
  }
  if (!itemExecutavel(status)) throw RECUSA_REVISADO()
  return criarPecaDoItem(tx, item.id, spec, data, revisao, decididoPor, autor)
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
  // A revisão também fica NA Generation: se o job sumir, é o que resta para a
  // retomada conferir que o item não foi revisado (R02).
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

/**
 * A retomada de um item EM VOO (`na-fila`/`gerando`) cuja peça o lote declarou
 * morta ou sem job, sob a trava do item. Ele não é executável — é por isso que
 * o caminho normal o recusava (R02) —, mas a peça dele é a do lote.
 *
 * A guarda de revisão continua: o que foi gravado com a peça tem de ser o item
 * de agora. Com o job, a revisão e a spec do payload (a mesma regra do
 * reaproveitamento); sem o job, a spec e a revisão guardadas na Generation;
 * sem os dois (Generation e job apagados), sobra o vínculo do item — que em voo
 * não é editável.
 */
async function retomarPecaEmVoo(
  tx: Prisma.TransactionClient,
  ctx: {
    item: { id: string }
    status: StatusDoItem
    anterior: { id: string; status: string; fieldValues: unknown } | null
    jobAnterior: { id: string } | null
    mesmaRevisao: boolean
    revisao: string
    spec: SpecDePeca
    data: Prisma.GenerationUncheckedCreateInput
    decididoPor: string | null
    autor: string | null
    recuperacao: RecuperacaoDaReserva
  },
) {
  const { item, status, anterior, jobAnterior, revisao, spec, decididoPor, autor, recuperacao } = ctx
  if (jobAnterior) {
    if (!ctx.mesmaRevisao) throw RECUSA_REVISADO()
  } else if (anterior) {
    const gravado = (anterior.fieldValues && typeof anterior.fieldValues === 'object' ? anterior.fieldValues : {}) as { spec?: unknown; planoRevisao?: string }
    if (gravado.spec !== undefined && stableStringify(gravado.spec) !== stableStringify(spec)) throw RECUSA_REVISADO()
    if (gravado.planoRevisao !== undefined && gravado.planoRevisao !== revisao) throw RECUSA_REVISADO()
  }

  // Só falta o job: a MESMA Generation, um job novo com a revisão do item.
  if (recuperacao.falta === 'job' && anterior?.status === 'PROCESSING' && !jobAnterior) {
    const jobId = await criarJobDoItem(tx, anterior.id, spec, revisao, decididoPor, autor)
    return { generationId: anterior.id, jobId, spec, reaproveitado: false }
  }

  // A peça morreu (Generation apagada ou FAILED, ou job terminal com ela
  // aberta): Generation e job novos, e o item volta a `na-fila` apontando para
  // eles. O caminho é o da tabela de transições (`gerando` passa por `erro`),
  // nunca um atalho — mesma regra de `reapontarItemDoPlano`.
  if (caminhoAte(status, 'na-fila') === null) throw RECUSA_REVISADO()
  return criarPecaDoItem(tx, item.id, spec, ctx.data, revisao, decididoPor, autor)
}
