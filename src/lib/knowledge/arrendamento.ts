/**
 * O ARRENDAMENTO de uma entrada da base durante a indexação (PR13-41).
 *
 * Toda operação é leitura → decisão pura (`marca-de-indexado.ts`) →
 * compare-and-set no `updatedAt` lido (e no token, quando há um): duas
 * execuções que leram o mesmo estado não gravam as duas, porque a primeira
 * escrita avança o `updatedAt` (sempre para um instante DIFERENTE do lido).
 * Uma escrita alheia no meio (edição do título, por exemplo) só faz a
 * operação reler e decidir de novo.
 *
 * Garantia: enquanto o arrendamento de A estiver vigente, nenhuma outra
 * execução o adquire; e A só escreve depois de RENOVAR com o próprio token, com
 * cada passo abortado no prazo (`PRAZO_DO_PASSO_MS`) muito antes do fim do
 * arrendamento renovado (`DURACAO_DO_ARRENDAMENTO_MS`). Limite: vale para
 * relógios de processo com desvio menor que a folga entre os dois, e para
 * chamadas que respeitam o aborto; a exclusão dos chunks é, além disso,
 * condicionada ao token no próprio `DELETE`.
 */
import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import {
  ArrendamentoPerdido,
  CICLO_DE_INDEXACAO,
  DURACAO_DO_ARRENDAMENTO_MS,
  EXPIRACAO_DO_CICLO,
  IndexacaoEmAndamento,
  arrendamentoVigenteDe,
  cicloDeIndexacaoDe,
  comArrendamento,
  comMarcaDeIndexado,
  comPrazoRenovado,
  metadataComoObjeto,
  semPrazoDoArrendamento,
  temMarcaDeIndexado,
} from './marca-de-indexado'

const TENTATIVAS = 5

type Lida = { metadata: unknown; updatedAt: Date }

async function ler(entryId: string): Promise<Lida | null> {
  return db.knowledgeBaseEntry.findUnique({ where: { id: entryId }, select: { metadata: true, updatedAt: true } })
}

/** Grava `metadata` só se a linha ainda é a lida (mesmo `updatedAt` e, quando dado, o mesmo token). */
async function gravarSeNaoMudou(entryId: string, lida: Lida, metadata: Record<string, unknown>, cicloLido: string | null): Promise<boolean> {
  const r = await db.knowledgeBaseEntry.updateMany({
    where: { id: entryId, updatedAt: lida.updatedAt, ...(cicloLido ? { metadata: { path: [CICLO_DE_INDEXACAO], equals: cicloLido } } : {}) },
    data: { metadata: metadata as Prisma.InputJsonValue, updatedAt: new Date(Math.max(Date.now(), lida.updatedAt.getTime() + 1)) },
  })
  return r.count === 1
}

export interface ArrendamentoDaEntrada {
  readonly entryId: string
  readonly ciclo: string
  /** A entrada tinha a marca de indexado quando foi adquirida (a aquisição a invalida). */
  readonly tinhaMarcaDeIndexado: boolean
  /** Estende o prazo com o próprio token; LANÇA `ArrendamentoPerdido` se o token não é mais este. */
  renovar(etapa: string): Promise<void>
  /** Publica a marca de indexado por compare-and-set no token; LANÇA `ArrendamentoPerdido` se outra execução assumiu. */
  publicarMarca(em: Date, etapa?: string): Promise<void>
  /** Tira o prazo se o token ainda é este (o token fica como o último ciclo). `false` quando não era mais seu. */
  liberar(): Promise<boolean>
}

/**
 * Adquire a entrada para um ciclo de indexação. Arrendamento vigente de outro
 * token (ou do mesmo, usado duas vezes) → `IndexacaoEmAndamento`, sem escrita.
 * Adquirir invalida a marca de indexado (PR13-36) na mesma escrita.
 */
export async function adquirirArrendamento(entryId: string, ciclo: string): Promise<ArrendamentoDaEntrada> {
  for (let i = 0; i < TENTATIVAS; i++) {
    const lida = await ler(entryId)
    if (!lida) throw new Error('Entry not found')
    const agora = Date.now()
    if (arrendamentoVigenteDe(lida.metadata, agora)) {
      const expira = metadataComoObjeto(lida.metadata)[EXPIRACAO_DO_CICLO]
      throw new IndexacaoEmAndamento(entryId, typeof expira === 'string' ? expira : null)
    }
    if (await gravarSeNaoMudou(entryId, lida, comArrendamento(lida.metadata, ciclo, agora + DURACAO_DO_ARRENDAMENTO_MS), cicloDeIndexacaoDe(lida.metadata))) {
      return arrendamentoDe(entryId, ciclo, temMarcaDeIndexado(lida.metadata))
    }
  }
  throw new Error(`a entrada ${entryId} mudou ${TENTATIVAS} vezes seguidas enquanto o arrendamento da indexação era adquirido: nada foi tocado`)
}

function arrendamentoDe(entryId: string, ciclo: string, tinhaMarcaDeIndexado: boolean): ArrendamentoDaEntrada {
  /** Lê, confere o token e grava o metadata derivado: `perdido` = o token não é mais este; `mudou` = a linha não parou de mudar. */
  async function comOProprioToken(derivar: (metadata: unknown) => Record<string, unknown>): Promise<'gravado' | 'perdido' | 'mudou'> {
    for (let i = 0; i < TENTATIVAS; i++) {
      const lida = await ler(entryId)
      if (!lida || cicloDeIndexacaoDe(lida.metadata) !== ciclo) return 'perdido'
      if (await gravarSeNaoMudou(entryId, lida, derivar(lida.metadata), ciclo)) return 'gravado'
    }
    return 'mudou'
  }
  return {
    entryId,
    ciclo,
    tinhaMarcaDeIndexado,
    async renovar(etapa) {
      // Token ainda este, mesmo com o prazo vencido, prova que ninguém adquiriu no meio (adquirir troca o token).
      // Sem confirmar a posse em TENTATIVAS leituras, o lado seguro é tratar como perdida.
      if ((await comOProprioToken((m) => comPrazoRenovado(m, Date.now() + DURACAO_DO_ARRENDAMENTO_MS))) !== 'gravado') throw new ArrendamentoPerdido(entryId, etapa)
    },
    async publicarMarca(em, etapa = 'repor a marca de indexado') {
      if ((await comOProprioToken((m) => comMarcaDeIndexado(m, em))) !== 'gravado') throw new ArrendamentoPerdido(entryId, etapa)
    },
    async liberar() {
      return (await comOProprioToken((m) => semPrazoDoArrendamento(m))) === 'gravado'
    },
  }
}
