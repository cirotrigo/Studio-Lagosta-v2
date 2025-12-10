import { KnowledgeCategory } from '@prisma/client'
import { searchKnowledgeBase } from './search'
import { db } from '@/lib/db'

export interface SimilarEntryMatch {
  entryId: string
  title: string
  content: string
  score: number
  category: KnowledgeCategory
}

export async function findSimilarEntries(
  query: string,
  projectId: number,
  category?: KnowledgeCategory,
  options: {
    topK?: number
    minScore?: number
  } = {}
): Promise<SimilarEntryMatch[]> {
  const { topK = 3, minScore = 0.75 } = options
  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    return []
  }

  const results = await searchKnowledgeBase(
    trimmedQuery,
    { projectId },
    {
      topK,
      minScore,
      categoryFilter: category,
      includeEntryMetadata: true,
    }
  )

  if (results.length === 0) {
    return []
  }

  const entryIds = Array.from(new Set(results.map(r => r.entryId)))
  const entries = await db.knowledgeBaseEntry.findMany({
    where: {
      id: { in: entryIds },
      projectId,
    },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
    },
  })

  const entriesMap = new Map(entries.map(e => [e.id, e]))
  const bestScores = new Map<string, number>()

  for (const result of results) {
    const currentBest = bestScores.get(result.entryId) ?? 0
    if (result.score > currentBest) {
      bestScores.set(result.entryId, result.score)
    }
  }

  return entryIds
    .map(entryId => {
      const entry = entriesMap.get(entryId)
      if (!entry) return null

      const score = bestScores.get(entryId) ?? 0
      return {
        entryId,
        title: entry.title,
        content: entry.content,
        category: entry.category,
        score,
      }
    })
    .filter((m): m is SimilarEntryMatch => m !== null)
    .filter(m => m.score >= minScore)
    .sort((a, b) => b.score - a.score)
}
