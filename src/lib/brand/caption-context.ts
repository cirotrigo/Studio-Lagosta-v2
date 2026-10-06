import {
  fetchProjectWithShares,
  hasProjectReadAccess,
} from '@/lib/projects/access'
import { loadBrandContext } from './brand-context'
import { getProjectPromptKnowledgeContext } from '@/lib/knowledge/search'

/** Autorizar antes de ler Marca/Base; nenhuma cobrança acontece aqui. */
export async function loadCaptionContext(
  projectId: number,
  principal: { userId: string; orgId: string | null },
  query: string
) {
  const project = await fetchProjectWithShares(projectId)
  if (!project || !hasProjectReadAccess(project, principal)) return null
  const brand = await loadBrandContext(projectId)
  if (!brand) return null
  const knowledge = await getProjectPromptKnowledgeContext(
    query,
    { projectId },
    { topKPerCategory: 2, maxTokens: 800, minScore: 0.6 }
  )
  const identity = [brand.voz.texto, brand.voz.regrasDaMarca]
    .filter(Boolean)
    .join('\n\n')
  return { projectName: brand.projectName, identity, knowledge }
}

export function captionBrandInstructions(identity: string): string {
  return identity
    ? `\n\nIDENTIDADE DA MARCA — precedência sobre sugestões genéricas de tom e formato:\n${identity}\n\nCTAs, vocabulário, emojis, urgência e interação seguem esta identidade. A Base fornece fatos, não substitui esta identidade. Sugestões genéricas só valem quando compatíveis; não invente CTA fora da lista aprovada.`
    : ''
}
