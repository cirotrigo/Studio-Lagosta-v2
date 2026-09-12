import { randomUUID } from 'node:crypto'
/**
 * Knowledge base indexing service
 * Handles creating, updating, and deleting indexed entries
 */

import { db } from '@/lib/db'
import { chunkText, parseFileContent } from './chunking'
import { generateEmbeddings } from './embeddings'
import { upsertVectors, deleteVectorsByEntry, type TenantKey } from './vector-client'
import { lancarSeAbortado } from './aborto'
import { CICLO_DE_INDEXACAO, comCicloDeIndexacao, comMarcaDeIndexado, temMarcaDeIndexado } from './marca-de-indexado'
import type { KnowledgeCategory, Prisma } from '@prisma/client'

export interface IndexEntryInput {
  title: string
  content: string
  tags?: string[]
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  metadata?: Prisma.JsonValue
  category: KnowledgeCategory
  createdBy: string
  updatedBy?: string
  /** Prazo de validade (F0.1). Ausente/null = vale para sempre. */
  expiresAt?: Date | null
  tenant: TenantKey
}

export interface IndexFileInput {
  title: string
  filename: string
  fileContent: string
  tags?: string[]
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  metadata?: Prisma.JsonValue
  category: KnowledgeCategory
  createdBy: string
  updatedBy?: string
  expiresAt?: Date | null
  tenant: TenantKey
}

/**
 * Index a new knowledge base entry from text content
 * @param input Entry data
 * @returns Created entry with chunks
 */
export async function indexEntry(input: IndexEntryInput) {
  const {
    title,
    content,
    tags = [],
    status = 'ACTIVE',
    metadata,
    category,
    createdBy,
    updatedBy,
    expiresAt,
    tenant,
  } = input

  // Create entry in database
  const entry = await db.knowledgeBaseEntry.create({
    data: {
      projectId: tenant.projectId,
      category,
      title,
      content,
      tags,
      status,
      expiresAt: expiresAt ?? null,
      metadata: metadata ?? undefined,
      createdBy,
      updatedBy,
      userId: tenant.userId,
      workspaceId: tenant.workspaceId,
    },
  })

  // Chunk the content
  const chunks = chunkText(content)

  if (chunks.length === 0) {
    throw new Error('Content is too short to create chunks')
  }

  // Generate embeddings for all chunks
  const embeddings = await generateEmbeddings(chunks.map(c => c.content))

  // Create chunks in database
  const createdChunks = await Promise.all(
    chunks.map((chunk) =>
      db.knowledgeChunk.create({
        data: {
          entryId: entry.id,
          ordinal: chunk.ordinal,
          content: chunk.content,
          tokens: chunk.tokens,
          vectorId: `${entry.id}:${chunk.ordinal}`,
        },
      })
    )
  )

  // Upsert vectors to Upstash
  await upsertVectors(
    createdChunks.map((chunk, index) => ({
      id: chunk.vectorId,
      vector: embeddings[index],
      metadata: {
        entryId: chunk.entryId,
        ordinal: chunk.ordinal,
        projectId: tenant.projectId,
        category,
        status: entry.status,
        userId: tenant.userId,
        workspaceId: tenant.workspaceId,
      },
    }))
  )

  return {
    entry,
    chunks: createdChunks,
  }
}

/**
 * Index a knowledge base entry from uploaded file
 * @param input File upload data
 * @returns Created entry with chunks
 */
export async function indexFile(input: IndexFileInput) {
  const { filename, fileContent, ...rest } = input

  // Parse file content based on extension
  const parsedContent = parseFileContent(filename, fileContent)

  return indexEntry({
    ...rest,
    content: parsedContent,
  })
}

/**
 * Reindex an existing entry (update chunks and vectors)
 * @param entryId Entry ID to reindex
 * @param tenant Tenant keys
 */
/**
 * `opcoes.signal`: aborto cooperativo — conferido antes de cada escrita
 * (apagar chunks/vetores, gravar chunks, subir vetores). Quem segura uma
 * exclusão externa (a migração da voz) dispara o sinal ao perdê-la, e a
 * reindexação para sem tocar em nada que outra aplicação possa ter retomado.
 */
export async function reindexEntry(entryId: string, tenant: TenantKey, opcoes: { signal?: AbortSignal; ciclo?: string } = {}) {
  const { signal } = opcoes
  // O token DESTE ciclo (PR13-39): carimbado antes de apagar, conferido por compare-and-set ao repor a marca.
  const ciclo = opcoes.ciclo ?? randomUUID()
  // Get entry
  const entry = await db.knowledgeBaseEntry.findUnique({
    where: { id: entryId },
    include: { chunks: true },
  })

  if (!entry) {
    throw new Error('Entry not found')
  }

  // Verify tenant ownership by project (project is the isolation boundary)
  if (entry.projectId !== tenant.projectId) {
    throw new Error('Unauthorized access to entry')
  }

  // A marca durável de indexado (`metadata.indexadoEm`, a que a migração da voz lê) atesta chunks e vetores que
  // vão ser APAGADOS já já. Se a reindexação cair depois das exclusões (embeddings fora do ar) e a marca ficar, a
  // retomada da migração lê `completo` e a voz é ativada sem os chunks da busca (PR13-36). Por isso ela é
  // INVALIDADA antes de apagar — preservando `chaveDoFato` e o resto do metadata — e REPOSTA só depois de subir os
  // vetores. Entrada sem a marca (a criação normal, ou a retomada de uma linha incompleta) não ganha marca aqui:
  // quem a grava é quem sabe que a indexação inteira fechou (`marcarFatoIndexado`, depois deste retorno).
  // E SEMPRE carimba o ciclo (PR13-39): a marca só volta — aqui ou em `marcarFatoIndexado` — se o ciclo ainda for
  // este; outra indexação que começou no meio (a API de reindex não participa da trava da migração) troca o token
  // e a execução atrasada não publica marca sobre chunks que não são mais os dela.
  const tinhaMarcaDeIndexado = temMarcaDeIndexado(entry.metadata)
  lancarSeAbortado(signal, 'invalidar a marca de indexado')
  await db.knowledgeBaseEntry.update({ where: { id: entryId }, data: { metadata: comCicloDeIndexacao(entry.metadata, ciclo) as Prisma.InputJsonValue } })

  // Delete old chunks and vectors
  lancarSeAbortado(signal, 'apagar chunks antigos')
  await db.knowledgeChunk.deleteMany({
    where: { entryId },
  })

  // O sinal pode ter disparado enquanto o `deleteMany` esperava (PR13-22): confere de novo antes da exclusão
  // vetorial — e ela mesma confere outra vez entre a consulta e o `delete`.
  lancarSeAbortado(signal, 'apagar vetores antigos')
  await deleteVectorsByEntry(entryId, tenant, { signal })

  // Re-chunk content
  const chunks = chunkText(entry.content)

  if (chunks.length === 0) {
    throw new Error('Content is too short to create chunks')
  }

  // Generate new embeddings
  const embeddings = await generateEmbeddings(chunks.map(c => c.content))

  // Os embeddings demoram: é AQUI que a posse externa costuma ter se perdido (PR13-20).
  lancarSeAbortado(signal, 'gravar chunks')
  // Create new chunks
  const createdChunks = await Promise.all(
    chunks.map((chunk) =>
      db.knowledgeChunk.create({
        data: {
          entryId: entry.id,
          ordinal: chunk.ordinal,
          content: chunk.content,
          tokens: chunk.tokens,
          vectorId: `${entry.id}:${chunk.ordinal}`,
        },
      })
    )
  )

  // Upsert new vectors
  lancarSeAbortado(signal, 'subir vetores')
  await upsertVectors(
    createdChunks.map((chunk, index) => ({
      id: chunk.vectorId,
      vector: embeddings[index],
      metadata: {
        entryId: chunk.entryId,
        ordinal: chunk.ordinal,
        projectId: tenant.projectId,
        category: entry.category,
        status: entry.status,
        userId: tenant.userId,
        workspaceId: tenant.workspaceId,
      },
    }))
  )

  // Chunks e vetores novos no lugar: a marca volta, sobre o metadata COMO ESTÁ AGORA (outra escrita pode ter
  // mexido nele no meio). Quem perdeu a posse externa não a repõe (PR13-23): a marca de uma execução abortada
  // faria a retomada ler `completo` uma linha que outra aplicação ainda reindexa.
  if (tinhaMarcaDeIndexado) {
    lancarSeAbortado(signal, 'repor a marca de indexado')
    const atual = await db.knowledgeBaseEntry.findUnique({ where: { id: entryId }, select: { metadata: true } })
    lancarSeAbortado(signal, 'repor a marca de indexado')
    // Compare-and-set no CICLO: se outra indexação assumiu a entrada no meio, o token mudou e a marca NÃO é reposta
    // por esta execução (PR13-39) — a linha fica incompleta, para quem detém o ciclo fechar (ou a retomada refazer).
    const reposta = await db.knowledgeBaseEntry.updateMany({
      where: { id: entryId, metadata: { path: [CICLO_DE_INDEXACAO], equals: ciclo } },
      data: { metadata: comMarcaDeIndexado(atual?.metadata, new Date()) as Prisma.InputJsonValue },
    })
    if (reposta.count === 0) throw new Error(`outra indexação assumiu a entrada ${entryId} durante esta reindexação: a marca de indexado não é reposta por esta execução`)
  }

  return {
    entry,
    chunks: createdChunks,
    ciclo,
  }
}

/**
 * Update entry metadata (title, tags, status) and reindex if content changed
 * @param entryId Entry ID
 * @param updates Fields to update
 * @param tenant Tenant keys
 */
export async function updateEntry(
  entryId: string,
  updates: {
    title?: string
    content?: string
    tags?: string[]
    status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
    category?: KnowledgeCategory
    metadata?: Prisma.JsonValue | null
    updatedBy?: string
  },
  tenant: TenantKey
) {
  // Get existing entry
  const existing = await db.knowledgeBaseEntry.findUnique({
    where: { id: entryId },
  })

  if (!existing) {
    throw new Error('Entry not found')
  }

  // Verify tenant ownership
  if (existing.projectId !== tenant.projectId) {
    throw new Error('Unauthorized access to entry')
  }

  // Update entry
  const entry = await db.knowledgeBaseEntry.update({
    where: { id: entryId },
    data: updates,
  })

  // If content changed, reindex
  if (updates.content && updates.content !== existing.content) {
    await reindexEntry(entryId, tenant)
  }

  return entry
}

/**
 * Delete entry and all associated chunks/vectors
 * @param entryId Entry ID to delete
 * @param tenant Tenant keys
 */
export async function deleteEntry(entryId: string, tenant: TenantKey) {
  // Get entry to verify ownership
  const entry = await db.knowledgeBaseEntry.findUnique({
    where: { id: entryId },
  })

  if (!entry) {
    throw new Error('Entry not found')
  }

  // Verify tenant ownership
  if (entry.projectId !== tenant.projectId) {
    throw new Error('Unauthorized access to entry')
  }

  // Delete vectors
  await deleteVectorsByEntry(entryId, tenant)

  // Delete entry (chunks cascade delete via Prisma schema)
  await db.knowledgeBaseEntry.delete({
    where: { id: entryId },
  })

  return { success: true }
}
