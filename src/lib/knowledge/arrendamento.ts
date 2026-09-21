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
 * O ciclo lê o que a linha INDEXA (conteúdo, categoria, status) na MESMA leitura
 * que adquire, e `renovar`/`publicarMarca` recusam publicar se esses campos
 * mudaram (`IndexacaoSuperada`, PR13-42). Quem EDITA esses campos passa por
 * `editarEntradaCoordenada`, recusada enquanto um arrendamento vale.
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
import type { KnowledgeCategory, Prisma } from '@prisma/client'
import {
  ArrendamentoPerdido,
  CICLO_DE_INDEXACAO,
  DURACAO_DO_ARRENDAMENTO_MS,
  EXPIRACAO_DO_CICLO,
  IndexacaoEmAndamento,
  IndexacaoSuperada,
  arrendamentoVigenteDe,
  cicloDeIndexacaoDe,
  comArrendamento,
  comMarcaDeIndexado,
  comPrazoRenovado,
  edicaoMudaIndice,
  metadataComoObjeto,
  metadataDaEdicao,
  semPrazoDoArrendamento,
  temMarcaDeIndexado,
  versaoIndexadaDe,
  type CamposIndexados,
} from './marca-de-indexado'

const TENTATIVAS = 5

type Lida = CamposIndexados & { metadata: unknown; updatedAt: Date; title: string }

async function ler(entryId: string): Promise<Lida | null> {
  return db.knowledgeBaseEntry.findUnique({
    where: { id: entryId },
    select: { metadata: true, updatedAt: true, content: true, title: true, category: true, status: true },
  }) as Promise<Lida | null>
}

/** Sempre um instante DIFERENTE do lido: é o que faz o compare-and-set de quem leu antes falhar. */
function carimboSeguinte(lida: Lida): Date {
  return new Date(Math.max(Date.now(), lida.updatedAt.getTime() + 1))
}

function expiracaoDe(metadata: unknown): string | null {
  const expira = metadataComoObjeto(metadata)[EXPIRACAO_DO_CICLO]
  return typeof expira === 'string' ? expira : null
}

/** Grava `metadata` só se a linha ainda é a lida (mesmo `updatedAt` e, quando dado, o mesmo token). */
async function gravarSeNaoMudou(entryId: string, lida: Lida, metadata: Record<string, unknown>, cicloLido: string | null): Promise<boolean> {
  const r = await db.knowledgeBaseEntry.updateMany({
    where: { id: entryId, updatedAt: lida.updatedAt, ...(cicloLido ? { metadata: { path: [CICLO_DE_INDEXACAO], equals: cicloLido } } : {}) },
    data: { metadata: metadata as Prisma.InputJsonValue, updatedAt: carimboSeguinte(lida) },
  })
  return r.count === 1
}

export interface ArrendamentoDaEntrada {
  readonly entryId: string
  readonly ciclo: string
  /** A entrada tinha a marca de indexado quando foi adquirida (a aquisição a invalida). */
  readonly tinhaMarcaDeIndexado: boolean
  /**
   * O que a linha indexa, lido NA MESMA leitura que adquiriu o arrendamento (PR13-42): é isto que se chunka e se
   * embeda — nunca uma leitura anterior à aquisição, que uma edição no meio já teria superado.
   */
  readonly indexada: CamposIndexados
  /** Estende o prazo com o próprio token; LANÇA `ArrendamentoPerdido` se o token não é mais este, `IndexacaoSuperada` se a linha indexada mudou. */
  renovar(etapa: string): Promise<void>
  /** Publica a marca de indexado por compare-and-set no token (e no `updatedAt` da leitura que conferiu a versão); lança como `renovar`. */
  publicarMarca(em: Date, etapa?: string): Promise<void>
  /** Tira o prazo se o token ainda é este (o token fica como o último ciclo), MESMO com a versão superada. `false` quando não era mais seu. */
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
    if (arrendamentoVigenteDe(lida.metadata, agora)) throw new IndexacaoEmAndamento(entryId, expiracaoDe(lida.metadata))
    if (await gravarSeNaoMudou(entryId, lida, comArrendamento(lida.metadata, ciclo, agora + DURACAO_DO_ARRENDAMENTO_MS), cicloDeIndexacaoDe(lida.metadata))) {
      // O compare-and-set garante que o conteúdo desta leitura é o da linha no instante da aquisição.
      return arrendamentoDe(entryId, ciclo, temMarcaDeIndexado(lida.metadata), { content: lida.content, category: lida.category, status: lida.status })
    }
  }
  throw new Error(`a entrada ${entryId} mudou ${TENTATIVAS} vezes seguidas enquanto o arrendamento da indexação era adquirido: nada foi tocado`)
}

function arrendamentoDe(entryId: string, ciclo: string, tinhaMarcaDeIndexado: boolean, indexada: CamposIndexados): ArrendamentoDaEntrada {
  const versao = versaoIndexadaDe(indexada)
  /**
   * Lê, confere o token (e, quando pedido, a versão indexada) e grava o metadata derivado: `perdido` = o token não é
   * mais este; `superada` = conteúdo, categoria ou status mudaram desde a aquisição; `mudou` = a linha não parou de
   * mudar. A escrita é compare-and-set no `updatedAt` da MESMA leitura que conferiu a versão.
   */
  async function comOProprioToken(derivar: (metadata: unknown) => Record<string, unknown>, conferirVersao: boolean): Promise<'gravado' | 'perdido' | 'superada' | 'mudou'> {
    for (let i = 0; i < TENTATIVAS; i++) {
      const lida = await ler(entryId)
      if (!lida || cicloDeIndexacaoDe(lida.metadata) !== ciclo) return 'perdido'
      if (conferirVersao && versaoIndexadaDe(lida) !== versao) return 'superada'
      if (await gravarSeNaoMudou(entryId, lida, derivar(lida.metadata), ciclo)) return 'gravado'
    }
    return 'mudou'
  }
  function lancarSeNaoGravou(resultado: 'gravado' | 'perdido' | 'superada' | 'mudou', etapa: string): void {
    if (resultado === 'superada') throw new IndexacaoSuperada(entryId, etapa)
    // Sem confirmar a posse em TENTATIVAS leituras, o lado seguro é tratar como perdida.
    if (resultado !== 'gravado') throw new ArrendamentoPerdido(entryId, etapa)
  }
  return {
    entryId,
    ciclo,
    tinhaMarcaDeIndexado,
    indexada,
    async renovar(etapa) {
      // Token ainda este, mesmo com o prazo vencido, prova que ninguém adquiriu no meio (adquirir troca o token).
      lancarSeNaoGravou(await comOProprioToken((m) => comPrazoRenovado(m, Date.now() + DURACAO_DO_ARRENDAMENTO_MS), true), etapa)
    },
    async publicarMarca(em, etapa = 'repor a marca de indexado') {
      lancarSeNaoGravou(await comOProprioToken((m) => comMarcaDeIndexado(m, em), true), etapa)
    },
    async liberar() {
      // Sem conferir a versão: o ciclo superado ainda precisa soltar a entrada, senão a reindexação da edição espera o prazo.
      return (await comOProprioToken((m) => semPrazoDoArrendamento(m), false)) === 'gravado'
    },
  }
}

export interface EdicaoDaEntrada {
  title?: string
  content?: string
  tags?: string[]
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  category?: KnowledgeCategory
  metadata?: Prisma.JsonValue | null
  expiresAt?: Date | null
  updatedBy?: string
}

/**
 * A edição de uma entrada da base COORDENADA com o arrendamento da indexação (PR13-42). Toda porta que edita a
 * entrada (a API, a tool `atualizar-entrada-base`, `updateEntry`) passa por aqui:
 * - edição que troca campo INDEXADO (`CAMPOS_INDEXADOS`) com arrendamento vigente → `IndexacaoEmAndamento` ANTES de
 *   qualquer escrita (a API responde 409). Sem isso a linha ganhava o texto novo, a reindexação dela era recusada
 *   em silêncio e o ciclo em curso publicava chunks, vetores e marca do texto antigo;
 * - a escrita é compare-and-set no `updatedAt` lido: um arrendamento adquirido entre a leitura e a escrita avança o
 *   `updatedAt`, a edição relê e é recusada; e a aquisição que perde para a edição relê o conteúdo novo;
 * - as chaves do sistema (marca, token, prazo) vêm da linha lida, e saem quando o índice muda (`metadataDaEdicao`).
 * Edição só de campo não indexado (tags, validade, metadata da pessoa) segue valendo durante o arrendamento.
 */
export async function editarEntradaCoordenada(entryId: string, edicao: EdicaoDaEntrada): Promise<{ antes: Lida; mudouIndice: boolean }> {
  const { metadata: metadataPedido, ...campos } = edicao
  const camposDefinidos = Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined))
  for (let i = 0; i < TENTATIVAS; i++) {
    const lida = await ler(entryId)
    if (!lida) throw new Error('Entry not found')
    const mudouIndice = edicaoMudaIndice(lida, edicao)
    if (mudouIndice && arrendamentoVigenteDe(lida.metadata, Date.now())) throw new IndexacaoEmAndamento(entryId, expiracaoDe(lida.metadata))
    const metadata = metadataDaEdicao(lida.metadata, metadataPedido, mudouIndice)
    const r = await db.knowledgeBaseEntry.updateMany({
      where: { id: entryId, updatedAt: lida.updatedAt },
      data: { ...camposDefinidos, ...(metadata !== undefined ? { metadata } : {}), updatedAt: carimboSeguinte(lida) } as Prisma.KnowledgeBaseEntryUpdateManyMutationInput,
    })
    if (r.count === 1) return { antes: lida, mudouIndice }
  }
  throw new Error(`a entrada ${entryId} mudou ${TENTATIVAS} vezes seguidas enquanto a edição era gravada: nada foi salvo, tente de novo`)
}
