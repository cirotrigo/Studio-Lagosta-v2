/**
 * Escrita de entrada da base de conhecimento como SERVIÇO.
 *
 * Nasceu extraído do handler de `criar-entrada-base` do MCP: com o
 * `virar-regra` passando a mandar regra COM PRAZO para a base (F0.1), a
 * sequência "grava → indexa → desfaz se a indexação falhar → invalida o cache"
 * teria de existir em dois lugares. Tool embrulha serviço; a regra da casa
 * vale também entre dois serviços.
 */

import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { reindexEntry } from '@/lib/knowledge/indexer'
import { foiAbortada, lancarSeAbortado } from '@/lib/knowledge/aborto'
import { ArrendamentoPerdido, CICLO_DE_INDEXACAO, ehIndexacaoEmAndamento, metadataComoObjeto, perdeuOArrendamento } from '@/lib/knowledge/marca-de-indexado'
import { invalidateProjectCache } from '@/lib/knowledge/cache'
import { CreativeError } from '@/lib/creatives/errors'
import type { KnowledgeCategory, Prisma } from '@prisma/client'

export interface CriarEntradaBaseArgs {
  projectId: number
  category: KnowledgeCategory
  title: string
  content: string
  tags?: string[]
  /** Prazo de validade. `null`/omitido = vale para sempre. */
  expiresAt?: Date | null
  metadata?: Prisma.InputJsonValue
  /** Autor: id INTERNO do User (não o clerkId). */
  autor: string
}

/**
 * Grava e indexa como uma coisa só: se a indexação falhar, a entrada é
 * desfeita. Sem isso, o erro voltaria a quem chamou enquanto a entrada já
 * estaria valendo — e o retry natural criaria uma duplicata.
 *
 * `opcoes.ciclo` vai para `reindexEntry` em vez de ele gerar outro, e o ciclo
 * EFETIVO volta no retorno (PR13-40): quem publica a marca de indexado depois
 * (`marcarFatoIndexado`) precisa do MESMO token que a indexação carimbou —
 * com o token descartado, todo fato novo da migração caía num falso conflito.
 *
 * O token é RETIDO desde a criação (PR13-43): nasce aqui, vai carimbado na
 * própria linha e condiciona a compensação. Sem ele a compensação apagava por
 * `id` a linha que outra execução tinha assumido e recuperado.
 */
export async function criarEntradaBase(args: CriarEntradaBaseArgs, opcoes: { signal?: AbortSignal; ciclo?: string } = {}) {
  const { signal } = opcoes
  const cicloProprio = opcoes.ciclo ?? randomUUID()
  lancarSeAbortado(signal, 'criar a entrada')
  const entry = await db.knowledgeBaseEntry.create({
    data: {
      projectId: args.projectId,
      category: args.category,
      title: args.title,
      content: args.content,
      tags: args.tags ?? [],
      status: 'ACTIVE',
      expiresAt: args.expiresAt ?? null,
      metadata: { ...metadataComoObjeto(args.metadata ?? { origem: 'chat-conector' }), [CICLO_DE_INDEXACAO]: cicloProprio } as Prisma.InputJsonValue,
      createdBy: args.autor,
      userId: args.autor,
    },
    select: { id: true, title: true, expiresAt: true },
  })

  let ciclo: string
  try {
    const indexada = await reindexEntry(entry.id, { projectId: args.projectId, userId: args.autor }, { signal, ciclo: cicloProprio })
    ciclo = indexada.ciclo
  } catch (erro) {
    // Abortada por quem PERDEU a posse (a migração da voz): a compensação NÃO roda — outra aplicação pode ter
    // retomado esta mesma linha (a chave do fato) e apagá-la agora destruiria o trabalho dela (PR13-20). A linha
    // fica como o retomador a encontrar: sem a marca de indexado, ele a reindexa pelo mesmo id. O mesmo vale quando
    // OUTRA execução detém ou tomou o arrendamento da entrada (PR13-41): a linha é dela agora, não se apaga.
    if (foiAbortada(erro) || signal?.aborted || ehIndexacaoEmAndamento(erro) || perdeuOArrendamento(erro)) throw erro
    // Erro COMUM não prova a posse (PR13-43): os embeddings podem ter demorado até o arrendamento vencer, outra
    // execução (a reindexação administrativa, a retomada da migração) ter assumido e recuperado a linha, e só então
    // a chamada rejeitar — sem passar pela renovação que lançaria `ArrendamentoPerdido`. Por isso a compensação só
    // apaga a linha que AINDA é deste ciclo, no próprio DELETE; ciclo trocado preserva a linha (e, por cascata, os
    // chunks da outra execução) e a perda de posse vira erro explícito.
    const desfeita = await db.knowledgeBaseEntry
      .deleteMany({ where: { id: entry.id, metadata: { path: [CICLO_DE_INDEXACAO], equals: cicloProprio } } })
      .catch((e) => {
        console.error('[knowledge] não consegui desfazer a entrada depois da falha da indexação:', e)
        return null
      })
    if (desfeita && desfeita.count === 0) {
      console.error(`[knowledge] indexação falhou ao criar a entrada ${entry.id}, mas o ciclo ${cicloProprio} não é mais o dela — nada foi desfeito:`, erro)
      throw new ArrendamentoPerdido(entry.id, 'desfazer a entrada depois da falha da indexação')
    }
    console.error('[knowledge] indexação falhou ao criar entrada — entrada desfeita:', erro)
    throw new CreativeError(
      'FALHA_INDEXACAO',
      'Não consegui indexar a entrada para a busca, então nada foi gravado. Tente de novo em instantes.',
      502,
    )
  }

  await invalidateProjectCache(args.projectId).catch((e) =>
    console.error('[knowledge] invalidateProjectCache falhou:', e))

  return { ...entry, ciclo }
}
