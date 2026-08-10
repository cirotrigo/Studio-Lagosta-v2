/**
 * Escrita de entrada da base de conhecimento como SERVIÇO.
 *
 * Nasceu extraído do handler de `criar-entrada-base` do MCP: com o
 * `virar-regra` passando a mandar regra COM PRAZO para a base (F0.1), a
 * sequência "grava → indexa → desfaz se a indexação falhar → invalida o cache"
 * teria de existir em dois lugares. Tool embrulha serviço; a regra da casa
 * vale também entre dois serviços.
 */

import { db } from '@/lib/db'
import { reindexEntry } from '@/lib/knowledge/indexer'
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
 */
export async function criarEntradaBase(args: CriarEntradaBaseArgs) {
  const entry = await db.knowledgeBaseEntry.create({
    data: {
      projectId: args.projectId,
      category: args.category,
      title: args.title,
      content: args.content,
      tags: args.tags ?? [],
      status: 'ACTIVE',
      expiresAt: args.expiresAt ?? null,
      metadata: args.metadata ?? { origem: 'chat-conector' },
      createdBy: args.autor,
      userId: args.autor,
    },
    select: { id: true, title: true, expiresAt: true },
  })

  try {
    await reindexEntry(entry.id, { projectId: args.projectId, userId: args.autor })
  } catch (erro) {
    await db.knowledgeBaseEntry.delete({ where: { id: entry.id } }).catch(() => {})
    console.error('[knowledge] indexação falhou ao criar entrada — entrada desfeita:', erro)
    throw new CreativeError(
      'FALHA_INDEXACAO',
      'Não consegui indexar a entrada para a busca, então nada foi gravado. Tente de novo em instantes.',
      502,
    )
  }

  await invalidateProjectCache(args.projectId).catch((e) =>
    console.error('[knowledge] invalidateProjectCache falhou:', e))

  return entry
}
