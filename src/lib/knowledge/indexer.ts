/**
 * Knowledge base indexing service
 * Handles creating, updating, and deleting indexed entries
 */

import { prisma } from '@/lib/db'
import { chunkText, parseFileContent } from './chunking'
import { generateEmbeddings } from './embeddings'
import { upsertVectors, deleteVectorsByEntry, type TenantKey } from './vector-client'
import type { EntryStatus } from '@prisma/client'

export interface IndexEntryInput {
  title: string
  content: string
  tags?: string[]
  status?: EntryStatus
  tenant: TenantKey
}

export interface IndexFileInput {
  title: string
  filename: string
  fileContent: string
  tags?: string[]
  status?: EntryStatus
  tenant: TenantKey
}

/**
 * Index a new knowledge base entry from text content
 * @param input Entry data
 * @returns Created entry with chunks
 */
export async function indexEntry(input: IndexEntryInput) {
  const { title, content, tags = [], status = 'ACTIVE', tenant } = input

  // Create entry in database
  const entry = await prisma.knowledgeBaseEntry.create({
    data: {
      title,
      content,
      tags,
      status,
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
    chunks.map((chunk, index) =>
      prisma.knowledgeChunk.create({
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
      entryId: chunk.entryId,
      ordinal: chunk.ordinal,
      embedding: embeddings[index],
      status: entry.status,
    })),
    tenant
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
export async function reindexEntry(entryId: string, tenant: TenantKey) {
  // Get entry
  const entry = await prisma.knowledgeBaseEntry.findUnique({
    where: { id: entryId },
    include: { chunks: true },
  })

  if (!entry) {
    throw new Error('Entry not found')
  }

  // Verify tenant ownership
  if (entry.userId !== tenant.userId || entry.workspaceId !== tenant.workspaceId) {
    throw new Error('Unauthorized access to entry')
  }

  // Delete old chunks and vectors
  await prisma.knowledgeChunk.deleteMany({
    where: { entryId },
  })

  await deleteVectorsByEntry(entryId, tenant)

  // Re-chunk content
  const chunks = chunkText(entry.content)

  if (chunks.length === 0) {
    throw new Error('Content is too short to create chunks')
  }

  // Generate new embeddings
  const embeddings = await generateEmbeddings(chunks.map(c => c.content))

  // Create new chunks
  const createdChunks = await Promise.all(
    chunks.map((chunk, index) =>
      prisma.knowledgeChunk.create({
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
  await upsertVectors(
    createdChunks.map((chunk, index) => ({
      id: chunk.vectorId,
      entryId: chunk.entryId,
      ordinal: chunk.ordinal,
      embedding: embeddings[index],
      status: entry.status,
    })),
    tenant
  )

  return {
    entry,
    chunks: createdChunks,
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
    status?: EntryStatus
  },
  tenant: TenantKey
) {
  // Get existing entry
  const existing = await prisma.knowledgeBaseEntry.findUnique({
    where: { id: entryId },
  })

  if (!existing) {
    throw new Error('Entry not found')
  }

  // Verify tenant ownership
  if (existing.userId !== tenant.userId || existing.workspaceId !== tenant.workspaceId) {
    throw new Error('Unauthorized access to entry')
  }

  // Update entry
  const entry = await prisma.knowledgeBaseEntry.update({
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
  const entry = await prisma.knowledgeBaseEntry.findUnique({
    where: { id: entryId },
  })

  if (!entry) {
    throw new Error('Entry not found')
  }

  // Verify tenant ownership
  if (entry.userId !== tenant.userId || entry.workspaceId !== tenant.workspaceId) {
    throw new Error('Unauthorized access to entry')
  }

  // Delete vectors
  await deleteVectorsByEntry(entryId, tenant)

  // Delete entry (chunks cascade delete via Prisma schema)
  await prisma.knowledgeBaseEntry.delete({
    where: { id: entryId },
  })

  return { success: true }
}
