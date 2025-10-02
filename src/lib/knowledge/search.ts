/**
 * Semantic search service for knowledge base retrieval
 * Implements RAG context retrieval
 */

import { generateEmbedding } from './embeddings'
import { queryVectors, type TenantKey } from './vector-client'
import { prisma } from '@/lib/db'
import type { EntryStatus } from '@prisma/client'

export interface SearchResult {
  entryId: string
  chunkId: string
  content: string
  score: number
  ordinal: number
  entry?: {
    id: string
    title: string
    tags: string[]
  }
}

/**
 * Search knowledge base by semantic similarity
 * @param query User query text
 * @param tenant Tenant isolation keys
 * @param options Search configuration
 * @returns Ranked search results
 */
export async function searchKnowledgeBase(
  query: string,
  tenant: TenantKey,
  options: {
    topK?: number
    includeStatuses?: EntryStatus[]
    includeEntryMetadata?: boolean
    minScore?: number
  } = {}
): Promise<SearchResult[]> {
  const {
    topK = parseInt(process.env.RAG_TOP_K || '5', 10),
    includeStatuses = ['ACTIVE'],
    includeEntryMetadata = true,
    minScore = 0.7,
  } = options

  if (!query.trim()) {
    return []
  }

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query)

  // Query vectors with tenant filter
  const vectorResults = await queryVectors(queryEmbedding, tenant, {
    topK,
    includeStatuses,
  })

  // Filter by minimum score
  const filteredResults = vectorResults.filter(r => r.score >= minScore)

  if (filteredResults.length === 0) {
    return []
  }

  // Get chunk details from database
  const chunkIds = filteredResults.map(r => r.id)
  const chunks = await prisma.knowledgeChunk.findMany({
    where: {
      vectorId: { in: chunkIds },
    },
    include: includeEntryMetadata
      ? {
          entry: {
            select: {
              id: true,
              title: true,
              tags: true,
            },
          },
        }
      : undefined,
  })

  // Map results
  const results: SearchResult[] = filteredResults.map(vectorResult => {
    const chunk = chunks.find(c => c.vectorId === vectorResult.id)

    if (!chunk) {
      return null
    }

    return {
      entryId: chunk.entryId,
      chunkId: chunk.id,
      content: chunk.content,
      score: vectorResult.score,
      ordinal: chunk.ordinal,
      entry: includeEntryMetadata && 'entry' in chunk ? chunk.entry : undefined,
    }
  }).filter((r): r is SearchResult => r !== null)

  return results
}

/**
 * Format search results into RAG context
 * Deduplicates and merges chunks from same entry
 * @param results Search results
 * @param options Formatting options
 * @returns Formatted context string
 */
export function formatContextFromResults(
  results: SearchResult[],
  options: {
    maxTokens?: number
    includeTitles?: boolean
    includeScores?: boolean
  } = {}
): string {
  const { maxTokens = 2000, includeTitles = true, includeScores = false } = options

  if (results.length === 0) {
    return ''
  }

  // Group by entry
  const entriesMap = new Map<string, SearchResult[]>()

  for (const result of results) {
    const existing = entriesMap.get(result.entryId) || []
    existing.push(result)
    entriesMap.set(result.entryId, existing)
  }

  // Format each entry
  const sections: string[] = []
  let totalTokens = 0

  for (const [entryId, entryResults] of entriesMap) {
    // Sort chunks by ordinal to maintain reading order
    const sortedChunks = entryResults.sort((a, b) => a.ordinal - b.ordinal)

    let section = ''

    // Add title if available
    if (includeTitles && sortedChunks[0].entry) {
      section += `### ${sortedChunks[0].entry.title}\n\n`
    }

    // Add chunks
    for (const chunk of sortedChunks) {
      const chunkText = includeScores
        ? `${chunk.content} [score: ${chunk.score.toFixed(2)}]`
        : chunk.content

      section += chunkText + '\n\n'
    }

    // Estimate tokens (4 chars ≈ 1 token)
    const sectionTokens = Math.ceil(section.length / 4)

    if (totalTokens + sectionTokens > maxTokens) {
      break
    }

    sections.push(section)
    totalTokens += sectionTokens
  }

  return sections.join('---\n\n')
}

/**
 * Get context for RAG injection
 * High-level function that searches and formats in one call
 * @param query User query
 * @param tenant Tenant keys
 * @param options Search and format options
 * @returns Formatted context string ready for injection
 */
export async function getRAGContext(
  query: string,
  tenant: TenantKey,
  options: {
    topK?: number
    maxTokens?: number
  } = {}
): Promise<string> {
  const { topK = 5, maxTokens = 2000 } = options

  const results = await searchKnowledgeBase(query, tenant, {
    topK,
    includeEntryMetadata: true,
  })

  if (results.length === 0) {
    return ''
  }

  return formatContextFromResults(results, {
    maxTokens,
    includeTitles: true,
    includeScores: false,
  })
}
