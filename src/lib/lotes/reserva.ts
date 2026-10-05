/**
 * A reserva do item de LOTE — o serviço com banco da identidade durável (PR 11
 * de "Marca simples, copy melhor", 12/09/2026). A decisão mora no módulo puro
 * `identidade.ts`; aqui só a ordem das escritas, que é o que impede a duplicata.
 *
 * 1. **Reserva ANTES de tudo**: `create` com a chave única composta
 *    `(projectId, loteId, itemId)`. Quem perde a corrida toma a violação de
 *    unicidade (P2002) e lê a linha do vencedor. Ela é um comando próprio, fora
 *    de transação, de propósito: dentro de uma transação interativa do
 *    Postgres a violação aborta a transação inteira e não dá para ler depois.
 * 2. **Decisão sem trava** sobre a linha lida: conflito sai aqui (409, sem
 *    escrever nada) e a repetição de uma peça viva devolve a MESMA Generation e
 *    o MESMO job — a leva repetida inteira custa leituras, nenhuma escrita.
 * 3. **Criar sob a trava da linha**: `SELECT … FOR UPDATE`, relê, decide DE
 *    NOVO e só então cria Generation + job (e reaponta a linha) na MESMA
 *    transação. Duas chamadas concorrentes que passaram pelo passo 2 com a linha
 *    ainda sem Generation se serializam aqui: a segunda relê a linha já ligada e
 *    reaproveita.
 *
 * O estado intermediário possível é a linha `reservado` SEM Generation (o
 * processo morreu entre o passo 1 e o 3, ou a criação lançou e a transação
 * voltou atrás). Ele é retomável pela mesma chamada: a próxima repetição cai no
 * passo 3 e cria só o que falta. Nunca existe Generation criada por este
 * caminho sem a linha apontando para ela — as duas escritas são um commit só.
 */

import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import type { Prisma } from '../../../prisma/generated/client'
import {
  decidirReserva,
  hashDoPayload,
  recuperacaoDaDecisao,
  situacaoDaPeca,
  type DecisaoDaReserva,
  type DesfechoDoItemDeLote,
  type IdentidadeDeLote,
  type RecuperacaoDaReserva,
  type SituacaoDaPecaDoLote,
} from './identidade'

export type ClienteDaTransacao = Prisma.TransactionClient

export interface EntradaDaReserva {
  projectId: number
  identidade: IdentidadeDeLote
  /** O payload canônico (`payloadParaHash(spec)`) — vira o hash e fica guardado na linha. */
  payload: Record<string, unknown>
  /**
   * A revisão do item de plano que a CHAMADA declara ter lido ao montar a spec
   * (o `itemRevisao` do `ver-plano`; pré-revisões C11-1 e C11-1a). Gravada na
   * linha quando ela nasce e junto de cada vínculo — nunca lida do servidor,
   * que não sabe de qual leitura a spec saiu. Sem item de plano, ausente.
   */
  planoRevisao?: string | null
  /** Trabalho FORA da transação, só quando é preciso criar (a pasta da semana, por exemplo). */
  preparar?: () => Promise<void>
  /**
   * Cria (ou obtém) a Generation e o job DENTRO da transação que segura a linha.
   * `recuperacao` é a decisão da retomada (a peça que a linha aponta morreu, ou
   * ficou sem job) e o criador tem de honrá-la — ver `RecuperacaoDaReserva`.
   * Ela vale sob a trava DESTA linha: criador que toma outra trava (o item de
   * plano) decide de novo sobre o que relê sob ela (R04; desde a revisão final,
   * pela tabela `decidirNoItemDoPlano`, que nem usa a `recuperacao`), e compara
   * specs com `mesmoPedidoDoLote`, nunca cru (R03). `retomado` diz que a peça
   * que o item JÁ tinha MORREU e foi refeita — inclusive quando esta linha
   * acabou de nascer e adotou a peça (R05). Peça viva ou pronta substituída por
   * outro pedido não é retomada: a linha nova que a substitui é `criado`.
   */
  criar: (tx: ClienteDaTransacao, contexto: { recuperacao: RecuperacaoDaReserva | null }) => Promise<{ generationId: string; jobId: string; reaproveitado?: boolean; retomado?: boolean }>
  /**
   * Cria só o job para uma Generation PROCESSING que ficou sem ele. Ausente,
   * a retomada cai em `criar` COM `recuperacao.falta === 'job'` (é o caso do
   * item de plano, cujo job carrega a revisão do item e só o caminho do plano
   * sabe montá-lo — sob a trava do item).
   */
  criarJob?: (tx: ClienteDaTransacao, generationId: string) => Promise<string>
}

export interface ResultadoDaReserva {
  generationId: string
  jobId: string
  loteId: string
  itemId: string
  desfecho: DesfechoDoItemDeLote
  situacao: SituacaoDaPecaDoLote
}

const SELECAO = { id: true, hashDoPayload: true, payload: true, generationId: true, jobId: true } as const

type LeitorDoVinculo = Pick<ClienteDaTransacao, 'generation' | 'generationJob'>

function violouUnicidade(erro: unknown): boolean {
  return String((erro as { code?: string } | null)?.code) === 'P2002'
}

/**
 * A Generation e o job que a linha aponta. Em série: dentro da transação as
 * consultas não se paralelizam. O job ANTES da Generation: o runner fecha a
 * Generation e só depois o job, então nesta ordem uma peça que acaba de ficar
 * pronta entre as duas leituras nunca parece "Generation aberta com job
 * terminado" (que a decisão retomaria com peça nova).
 */
async function lerVinculo(cliente: LeitorDoVinculo, generationId: string | null) {
  if (!generationId) return { geracao: null, job: null }
  const job = await cliente.generationJob.findUnique({ where: { generationId }, select: { id: true, status: true } })
  // `resultUrl` junto do status: COMPLETED sem arquivo não é peça pronta (PR11-F02).
  const geracao = await cliente.generation.findUnique({ where: { id: generationId }, select: { status: true, resultUrl: true } })
  return { geracao, job }
}

function erroDeConflito(identidade: IdentidadeDeLote, decisao: Extract<DecisaoDaReserva, { acao: 'conflito' }>, generationId: string | null): CreativeError {
  const onde = decisao.diferencas.length > 0 ? decisao.diferencas.join(', ') : 'o conteúdo'
  return new CreativeError(
    'LOTE_ITEM_CONFLITO',
    `O item "${identidade.itemId}" do lote "${identidade.loteId}" já foi pedido com outro conteúdo (difere em: ${onde}). Nada foi alterado — repita o pedido original para reaproveitar a peça, ou use outro itemId para uma peça nova.`,
    409,
    { loteId: identidade.loteId, itemId: identidade.itemId, diferencas: decisao.diferencas, generationId },
  )
}

/**
 * Reserva o item e devolve a peça dele: criada agora, reaproveitada ou retomada.
 * Lança `LOTE_ITEM_CONFLITO` (409) quando a chave já existe com outro payload.
 */
export async function reservarItemDeLote(entrada: EntradaDaReserva): Promise<ResultadoDaReserva> {
  const { projectId, identidade, payload } = entrada
  const { loteId, itemId } = identidade
  const hash = hashDoPayload(payload)
  const resultado = (generationId: string, jobId: string, desfecho: DesfechoDoItemDeLote, geracao: { status: string; resultUrl: string | null } | null | undefined): ResultadoDaReserva => ({
    generationId, jobId, loteId, itemId, desfecho, situacao: situacaoDaPeca(geracao?.status, geracao?.resultUrl),
  })

  // 1. A reserva.
  let criadaAgora = false
  let registro: { id: string; hashDoPayload: string; payload: unknown; generationId: string | null; jobId: string | null } | null
  try {
    registro = await db.itemDeLote.create({
      data: { projectId, loteId, itemId, hashDoPayload: hash, payload: payload as never, situacao: 'reservado', planoRevisao: entrada.planoRevisao ?? null },
      select: SELECAO,
    })
    criadaAgora = true
  } catch (erro) {
    if (!violouUnicidade(erro)) throw erro
    registro = await db.itemDeLote.findUnique({ where: { projectId_loteId_itemId: { projectId, loteId, itemId } }, select: SELECAO })
    // Apagada entre a violação e a leitura: falha esta chamada, a repetição recria.
    if (!registro) throw erro
  }
  const reservaId = registro.id

  // 2. Decisão sem trava — o caminho de toda repetição.
  if (!criadaAgora) {
    const vinculo = await lerVinculo(db, registro.generationId)
    const decisao = decidirReserva({ registro, hash, payload, ...vinculo })
    if (decisao.acao === 'conflito') throw erroDeConflito(identidade, decisao, registro.generationId)
    if (decisao.acao === 'reaproveitar') {
      return resultado(registro.generationId!, vinculo.job?.id ?? registro.jobId ?? '', 'reaproveitado', vinculo.geracao)
    }
  }

  // 3. Criar exige preparo (pasta) fora da transação, e depois a trava da linha.
  await entrada.preparar?.()

  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ItemDeLote" WHERE id = ${reservaId} FOR UPDATE`
      const atual = await tx.itemDeLote.findUnique({ where: { id: reservaId }, select: SELECAO })
      if (!atual) {
        throw new CreativeError('LOTE_ITEM_SUMIU', `A reserva do item "${itemId}" do lote "${loteId}" foi apagada durante o pedido. Repita a chamada.`, 409, { loteId, itemId })
      }
      const vinculo = await lerVinculo(tx, atual.generationId)
      const decisao = decidirReserva({ registro: atual, hash, payload, ...vinculo })
      if (decisao.acao === 'conflito') throw erroDeConflito(identidade, decisao, atual.generationId)
      // Outra chamada criou enquanto esta esperava a trava.
      if (decisao.acao === 'reaproveitar') {
        return resultado(atual.generationId!, vinculo.job?.id ?? atual.jobId ?? '', 'reaproveitado', vinculo.geracao)
      }

      let generationId: string
      let jobId: string
      let reaproveitado = false
      let retomado = false
      const recuperacao = recuperacaoDaDecisao(decisao, atual.generationId)
      if (recuperacao?.falta === 'job' && entrada.criarJob) {
        generationId = recuperacao.generationId
        jobId = await entrada.criarJob(tx, generationId)
      } else {
        const criado = await entrada.criar(tx, { recuperacao })
        generationId = criado.generationId
        jobId = criado.jobId
        reaproveitado = criado.reaproveitado === true
        retomado = criado.retomado === true
      }

      const novaGeracao = generationId !== atual.generationId
      const ligado = await tx.itemDeLote.updateMany({
        where: { id: atual.id, generationId: atual.generationId },
        // Peça pronta reaproveitada sem job devolve jobId vazio: grava nulo, nunca ''.
        // A revisão declarada pela chamada que ligou a peça vai junto (C11-1a).
        data: {
          generationId, jobId: jobId || null, situacao: 'enfileirado',
          ...(entrada.planoRevisao != null ? { planoRevisao: entrada.planoRevisao } : {}),
          ...(novaGeracao && !reaproveitado ? { tentativas: { increment: 1 } } : {}),
        },
      })
      // Com a trava isto não acontece; se acontecer, a transação volta atrás
      // inteira e nenhuma Generation fica sem a linha apontando para ela.
      if (ligado.count !== 1) {
        throw new CreativeError('LOTE_ITEM_CONCORRENTE', `O item "${itemId}" do lote "${loteId}" mudou durante o pedido. Repita a chamada.`, 409, { loteId, itemId })
      }
      if (decisao.acao === 'retomar' && !(criadaAgora && !atual.generationId)) {
        console.warn(`[lote] ${loteId}/${itemId} (projeto ${projectId}) retomado: ${decisao.motivo}`)
      } else if (retomado) {
        console.warn(`[lote] ${loteId}/${itemId} (projeto ${projectId}) retomado: a peça que o item de plano já tinha foi refeita`)
      }

      const geracao = reaproveitado
        ? await tx.generation.findUnique({ where: { id: generationId }, select: { status: true, resultUrl: true } })
        : { status: 'PROCESSING', resultUrl: null }
      const desfecho: DesfechoDoItemDeLote = reaproveitado ? 'reaproveitado' : criadaAgora && !atual.generationId && !retomado ? 'criado' : 'retomado'
      return resultado(generationId, jobId, desfecho, geracao)
    },
    // A espera pela trava conta no tempo da transação; o trabalho sob ela é curto.
    { maxWait: 10_000, timeout: 20_000 },
  )
}
