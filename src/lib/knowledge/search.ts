/**
 * Semantic search service for knowledge base retrieval
 * Implements RAG context retrieval with Redis caching
 */

import { generateEmbedding } from './embeddings'
import { queryVectors, type TenantKey } from './vector-client'
import { db } from '@/lib/db'
import { KnowledgeCategory, type EntryStatus } from '@prisma/client'
import { getCachedResults, setCachedResults } from './cache'

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
    projectId: number
    category: KnowledgeCategory
    status: EntryStatus
  }
}

const PROMPT_CONTEXT_PRIORITY: KnowledgeCategory[] = [
  KnowledgeCategory.CAMPANHAS,
  KnowledgeCategory.HORARIOS,
  KnowledgeCategory.CARDAPIO,
  KnowledgeCategory.DIFERENCIAIS,
]

export interface ProjectPromptKnowledgeHit {
  entryId: string
  title: string
  category: KnowledgeCategory
  content: string
  score: number
  source: 'rag' | 'fallback-db'
}

export interface ProjectPromptKnowledgeContext {
  context: string
  hits: ProjectPromptKnowledgeHit[]
  categoriesUsed: KnowledgeCategory[]
  warnings: string[]
  conflicts: string[]
}

function extractPromptKeywords(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= 4),
    ),
  ).slice(0, 8)
}

function stripDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function extractCriticalFacts(text: string) {
  const normalized = stripDiacritics(text)
  const times = normalized.match(/\b\d{1,2}(?:h|:\d{2})\b/g) ?? []
  const prices = normalized.match(/r\$\s?\d+(?:[.,]\d{1,2})?/g) ?? []
  const weekdays =
    normalized.match(/\b(?:segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo)\b/g) ?? []
  const addressHints =
    normalized.match(/\b(?:rua|avenida|av|rodovia|rod)\s+[^\n,.;]+/g) ?? []

  return {
    times: Array.from(new Set(times)),
    prices: Array.from(new Set(prices)),
    weekdays: Array.from(new Set(weekdays)),
    addressHints: Array.from(new Set(addressHints)),
  }
}

function detectPromptKnowledgeConflicts(prompt: string, knowledgeHits: ProjectPromptKnowledgeHit[]): string[] {
  const promptFacts = extractCriticalFacts(prompt)
  const contextFacts = extractCriticalFacts(knowledgeHits.map((hit) => hit.content).join('\n'))
  const conflicts: string[] = []

  if (
    promptFacts.times.length > 0 &&
    contextFacts.times.length > 0 &&
    !promptFacts.times.some((time) => contextFacts.times.includes(time))
  ) {
    conflicts.push('Prompt informa horario explicito diferente da base; revisar antes de aprovar.')
  }

  if (
    promptFacts.prices.length > 0 &&
    contextFacts.prices.length > 0 &&
    !promptFacts.prices.some((price) => contextFacts.prices.includes(price))
  ) {
    conflicts.push('Prompt informa preco explicito diferente da base; revisar antes de aprovar.')
  }

  if (
    promptFacts.weekdays.length > 0 &&
    contextFacts.weekdays.length > 0 &&
    !promptFacts.weekdays.some((day) => contextFacts.weekdays.includes(day))
  ) {
    conflicts.push('Prompt informa dia explicito diferente da base; revisar antes de aprovar.')
  }

  if (
    promptFacts.addressHints.length > 0 &&
    contextFacts.addressHints.length > 0 &&
    !promptFacts.addressHints.some((address) => contextFacts.addressHints.includes(address))
  ) {
    conflicts.push('Prompt informa endereco explicito diferente da base; revisar antes de aprovar.')
  }

  return conflicts
}

function formatPromptKnowledgeContext(
  hits: ProjectPromptKnowledgeHit[],
  maxTokens: number,
): string {
  if (hits.length === 0) {
    return ''
  }

  let totalTokens = 0
  const sections: string[] = []

  for (const category of PROMPT_CONTEXT_PRIORITY) {
    const categoryHits = hits.filter((hit) => hit.category === category)
    if (categoryHits.length === 0) continue

    for (const hit of categoryHits) {
      const section = [
        `[${category}] ${hit.title}`,
        hit.content.trim(),
      ].filter(Boolean).join('\n')

      const estimatedTokens = Math.ceil(section.length / 4)
      if (totalTokens + estimatedTokens > maxTokens) {
        return sections.join('\n\n---\n\n')
      }

      sections.push(section)
      totalTokens += estimatedTokens
    }
  }

  return sections.join('\n\n---\n\n')
}

async function getFallbackProjectKnowledgeHits(
  projectId: number,
  query: string,
): Promise<ProjectPromptKnowledgeHit[]> {
  const keywords = extractPromptKeywords(query)
  const now = new Date()
  const hits: ProjectPromptKnowledgeHit[] = []

  for (const category of PROMPT_CONTEXT_PRIORITY) {
    const entries = await db.knowledgeBaseEntry.findMany({
      where: {
        projectId,
        category,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        title: true,
        content: true,
        tags: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    })

    const ranked = entries
      .map((entry) => {
        const haystack = stripDiacritics(
          [entry.title, entry.content, ...(entry.tags ?? [])].join(' '),
        )
        const keywordMatches = keywords.filter((keyword) => haystack.includes(keyword)).length
        return {
          entry,
          score: keywordMatches > 0 ? 0.82 + keywordMatches * 0.02 : 0.58,
        }
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 1)

    for (const { entry, score } of ranked) {
      hits.push({
        entryId: entry.id,
        title: entry.title,
        category,
        content: entry.content,
        score,
        source: 'fallback-db',
      })
    }
  }

  return hits
}

export async function getProjectPromptKnowledgeContext(
  query: string,
  tenant: TenantKey,
  options: {
    topKPerCategory?: number
    maxTokens?: number
    minScore?: number
  } = {},
): Promise<ProjectPromptKnowledgeContext> {
  const { topKPerCategory = 2, maxTokens = 1200, minScore = 0.62 } = options

  if (!tenant?.projectId || !query.trim()) {
    return {
      context: '',
      hits: [],
      categoriesUsed: [],
      warnings: [],
      conflicts: [],
    }
  }

  const warnings: string[] = []
  const dedupedHits = new Map<string, ProjectPromptKnowledgeHit>()

  try {
    for (const category of PROMPT_CONTEXT_PRIORITY) {
      const results = await searchKnowledgeBase(query, tenant, {
        topK: topKPerCategory,
        minScore,
        includeEntryMetadata: true,
        categoryFilter: category,
      })

      for (const result of results) {
        const key = `${result.entryId}:${result.chunkId}`
        if (dedupedHits.has(key)) continue

        dedupedHits.set(key, {
          entryId: result.entryId,
          title: result.entry?.title || 'Conhecimento do projeto',
          category: result.entry?.category || category,
          content: result.content,
          score: result.score,
          source: 'rag',
        })
      }
    }
  } catch (error) {
    console.warn('[knowledge/search] Falling back to DB context for prompt pipeline:', error)
    warnings.push('Busca semantica indisponivel; usando fallback textual da base do projeto.')
  }

  if (dedupedHits.size === 0) {
    const fallbackHits = await getFallbackProjectKnowledgeHits(tenant.projectId, query)
    for (const hit of fallbackHits) {
      dedupedHits.set(`${hit.entryId}:${hit.category}`, hit)
    }
  }

  const hits = Array.from(dedupedHits.values()).sort((left, right) => {
    const categoryDiff =
      PROMPT_CONTEXT_PRIORITY.indexOf(left.category) - PROMPT_CONTEXT_PRIORITY.indexOf(right.category)
    if (categoryDiff !== 0) return categoryDiff
    return right.score - left.score
  })

  if (hits.length === 0) {
    warnings.push('Nenhum contexto relevante encontrado na base do projeto para este prompt.')
  }

  return {
    context: formatPromptKnowledgeContext(hits, maxTokens),
    hits,
    categoriesUsed: Array.from(new Set(hits.map((hit) => hit.category))),
    warnings,
    conflicts: detectPromptKnowledgeConflicts(query, hits),
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
    includeStatuses?: ('ACTIVE' | 'DRAFT' | 'ARCHIVED')[]
    includeEntryMetadata?: boolean
    minScore?: number
    categoryFilter?: KnowledgeCategory
    useCache?: boolean
  } = {}
): Promise<SearchResult[]> {
  const telemetryEnabled =
    process.env.RAG_TELEMETRY === '1' ||
    process.env.RAG_TELEMETRY === 'true' ||
    process.env.RAG_DEBUG === '1' ||
    process.env.RAG_DEBUG === 'true'

  const {
    topK = parseInt(process.env.RAG_TOP_K || '5', 10),
    includeStatuses = ['ACTIVE'],
    includeEntryMetadata = true,
    minScore = 0.7,
    categoryFilter,
    useCache = true,
  } = options

  if (!tenant?.projectId) {
    throw new Error('projectId is required for knowledge search')
  }

  if (!query.trim()) {
    return []
  }

  const overallStart = Date.now()

  // Try cache first (only for ACTIVE status queries)
  if (useCache && includeStatuses.length === 1 && includeStatuses[0] === 'ACTIVE') {
    const cacheStart = Date.now()
    const cached = await getCachedResults(query, tenant.projectId, categoryFilter, {
      topK,
      minScore,
      includeEntryMetadata,
    })
    if (cached != null) {
      if (telemetryEnabled) {
        console.log('[RAG]', {
          event: 'cache_hit',
          projectId: tenant.projectId,
          category: categoryFilter ?? null,
          topK,
          minScore,
          results: cached.length,
          ms: Date.now() - overallStart,
          cacheMs: Date.now() - cacheStart,
        })
      }
      return cached
    }
    if (telemetryEnabled) {
      console.log('[RAG]', {
        event: 'cache_miss',
        projectId: tenant.projectId,
        category: categoryFilter ?? null,
        topK,
        minScore,
        ms: Date.now() - overallStart,
        cacheMs: Date.now() - cacheStart,
      })
    }
  }

  // Generate query embedding
  const embeddingStart = Date.now()
  const queryEmbedding = await generateEmbedding(query)
  const embeddingMs = Date.now() - embeddingStart

  // Query vectors with tenant filter
  const vectorStart = Date.now()
  const vectorResults = await queryVectors(queryEmbedding, tenant, {
    topK,
    includeStatuses,
    category: categoryFilter,
  })
  const vectorMs = Date.now() - vectorStart

  // Filter by minimum score
  const filteredResults = vectorResults.filter(r => r.score >= minScore)

  if (filteredResults.length === 0) {
    if (useCache && includeStatuses.length === 1 && includeStatuses[0] === 'ACTIVE') {
      await setCachedResults(query, tenant.projectId, [], categoryFilter, undefined, {
        topK,
        minScore,
        includeEntryMetadata,
      })
    }
    if (telemetryEnabled) {
      console.log('[RAG]', {
        event: 'no_results',
        projectId: tenant.projectId,
        category: categoryFilter ?? null,
        topK,
        minScore,
        vectorResults: vectorResults.length,
        filtered: 0,
        embeddingMs,
        vectorMs,
        ms: Date.now() - overallStart,
      })
    }
    return []
  }

  // Get chunk details from database
  const dbStart = Date.now()
  const chunkIds = filteredResults.map(r => String(r.id))
  const chunks = await db.knowledgeChunk.findMany({
    where: {
      vectorId: { in: chunkIds },
      entry: {
        projectId: tenant.projectId,
        status: { in: includeStatuses },
        ...(categoryFilter ? { category: categoryFilter } : {}),
        // Filtrar entradas expiradas (ou que ainda não expiraram)
        OR: [
          { expiresAt: null }, // Sem expiração
          { expiresAt: { gt: new Date() } }, // Ainda não expirou
        ],
      },
    },
    include: includeEntryMetadata
      ? {
          entry: {
            select: {
              id: true,
              title: true,
              tags: true,
              projectId: true,
              category: true,
              status: true,
            },
          },
        }
      : undefined,
  })
  const dbMs = Date.now() - dbStart

  // Map results
  const results: SearchResult[] = filteredResults
    .map(vectorResult => {
      const chunk = chunks.find(c => c.vectorId === String(vectorResult.id))

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
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  // Cache results if enabled (only for ACTIVE status queries; includes empty result caching)
  if (useCache && includeStatuses.length === 1 && includeStatuses[0] === 'ACTIVE') {
    await setCachedResults(query, tenant.projectId, results, categoryFilter, undefined, {
      topK,
      minScore,
      includeEntryMetadata,
    })
  }

  if (telemetryEnabled) {
    console.log('[RAG]', {
      event: 'search_complete',
      projectId: tenant.projectId,
      category: categoryFilter ?? null,
      topK,
      minScore,
      vectorResults: vectorResults.length,
      filtered: filteredResults.length,
      chunks: chunks.length,
      results: results.length,
      embeddingMs,
      vectorMs,
      dbMs,
      ms: Date.now() - overallStart,
    })
  }

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

  for (const [_entryId, entryResults] of entriesMap) {
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

  const { context } = await getRAGContextWithResults(query, tenant, {
    topK,
    maxTokens,
  })

  return context
}

/**
 * Get context plus raw results for downstream metadata/telemetry
 */
export async function getRAGContextWithResults(
  query: string,
  tenant: TenantKey,
  options: {
    topK?: number
    maxTokens?: number
  } = {}
): Promise<{ context: string; results: SearchResult[] }> {
  const { topK = 5, maxTokens = 2000 } = options

  const results = await searchKnowledgeBase(query, tenant, {
    topK,
    includeEntryMetadata: true,
  })

  if (results.length === 0) {
    return { context: '', results: [] }
  }

  const context = formatContextFromResults(results, {
    maxTokens,
    includeTitles: true,
    includeScores: false,
  })

  return { context, results }
}
