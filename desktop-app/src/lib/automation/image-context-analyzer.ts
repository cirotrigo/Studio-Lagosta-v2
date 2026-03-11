export interface ImageContextKnowledgeMatch {
  entryId: string
  title: string
  category: 'CARDAPIO' | 'CAMPANHAS'
  score: number
  reason: string
}

export interface ImageContextAnalysis {
  requested: boolean
  applied: boolean
  sourceImageUrl?: string
  summary: string
  sceneType: string
  confidence: number
  dishNameCandidates: string[]
  ingredientsHints: string[]
  matchedKnowledge?: ImageContextKnowledgeMatch
  warnings: string[]
}

export const IMAGE_CONTEXT_AUTO_MATCH_THRESHOLD = 0.68

export function summarizeImageContextAnalysis(analysis?: ImageContextAnalysis | null): string {
  if (!analysis?.applied) {
    return ''
  }

  const parts: string[] = []

  if (analysis.matchedKnowledge?.title) {
    parts.push(`Associado a ${analysis.matchedKnowledge.title}`)
  } else if (analysis.dishNameCandidates.length > 0) {
    parts.push(`Candidatos: ${analysis.dishNameCandidates.slice(0, 2).join(', ')}`)
  }

  if (analysis.sceneType) {
    parts.push(`Cena: ${analysis.sceneType}`)
  }

  if (analysis.ingredientsHints.length > 0) {
    parts.push(`Pistas: ${analysis.ingredientsHints.slice(0, 3).join(', ')}`)
  }

  return parts.join(' • ') || analysis.summary
}

export function formatImageContextConfidence(confidence: number): string {
  if (!Number.isFinite(confidence)) {
    return '0%'
  }

  const bounded = Math.max(0, Math.min(1, confidence))
  return `${Math.round(bounded * 100)}%`
}
