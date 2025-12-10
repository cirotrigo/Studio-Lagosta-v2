import { KnowledgeCategory } from '@prisma/client'
import { classifyIntent, type UserIntent } from './classify-intent'
import { classifyCategory } from './classify-category'
import { extractKnowledgeData } from './extract-knowledge-data'
import { findSimilarEntries, type SimilarEntryMatch } from './find-similar-entries'

export type MatchType = 'none' | 'single' | 'multiple' | 'duplicate_warning'

export interface TrainingPreview {
  operation: Exclude<UserIntent, 'QUERY'>
  category: KnowledgeCategory
  title: string
  content: string
  tags: string[]
  metadata?: Record<string, unknown>
  targetEntryId?: string
  matchType?: MatchType
  matches?: SimilarEntryMatch[]
}

export async function processTrainingInput(
  userMessage: string,
  projectId: number
): Promise<TrainingPreview | null> {
  const intent = await classifyIntent(userMessage)

  if (intent === 'QUERY') {
    return null
  }

  const category = await classifyCategory(userMessage)
  const extracted = await extractKnowledgeData(userMessage, category)

  // Base preview
  const basePreview: TrainingPreview = {
    operation: intent,
    category,
    title: extracted.title,
    content: extracted.content,
    tags: extracted.tags,
    metadata: extracted.metadata || undefined,
  }

  // Deduplicação para CREATE
  if (intent === 'CREATE') {
    const similarEntries = await findSimilarEntries(
      extracted.content,
      projectId,
      category,
      {
        topK: 3,
        minScore: 0.8,
      }
    )

    if (similarEntries.length > 0) {
      return {
        ...basePreview,
        matchType: 'duplicate_warning',
        matches: similarEntries,
      }
    }

    return {
      ...basePreview,
      matchType: 'single',
    }
  }

  // Para UPDATE/REPLACE/DELETE, buscar matches semânticos
  const matches = await findSimilarEntries(userMessage, projectId, category, {
    topK: 5,
    minScore: 0.7,
  })

  let matchType: MatchType = 'none'
  let targetEntryId: string | undefined

  if (matches.length === 1) {
    matchType = 'single'
    targetEntryId = matches[0].entryId
  } else if (matches.length > 1) {
    matchType = 'multiple'
  }

  return {
    ...basePreview,
    matchType,
    matches,
    targetEntryId,
  }
}

export function formatPreviewMessage(preview: TrainingPreview): string {
  const emojis: Record<TrainingPreview['operation'], string> = {
    CREATE: '📝',
    UPDATE: '✏️',
    REPLACE: '🔄',
    DELETE: '🗑️',
  }

  const categoryLabels: Record<KnowledgeCategory, string> = {
    ESTABELECIMENTO_INFO: 'Informações Gerais',
    HORARIOS: 'Horários',
    CARDAPIO: 'Cardápio',
    DELIVERY: 'Delivery',
    POLITICAS: 'Políticas',
    TOM_DE_VOZ: 'Tom de Voz',
    CAMPANHAS: 'Campanhas',
    DIFERENCIAIS: 'Diferenciais',
    FAQ: 'FAQ',
  }

  // Caso de duplicata detectada
  if (preview.matchType === 'duplicate_warning' && preview.matches?.length) {
    return `
⚠️ **Atenção: Informação similar já existe!**

**Você está tentando criar:**
**${preview.title}**
Categoria: ${categoryLabels[preview.category]}

\`\`\`
${preview.content}
\`\`\`

**Já existe na base:**
${preview.matches
        .map(
          (m, i) => `
**${i + 1}. ${m.title}** (${Math.round(m.score * 100)}% similar)
\`\`\`
${m.content.substring(0, 200)}${m.content.length > 200 ? '...' : ''}
\`\`\`
`
        )
        .join('\n')}

Escolha se deseja criar uma nova entrada ou atualizar uma das existentes.
    `.trim()
  }

  // Sem match encontrado para operações destrutivas
  if (preview.operation !== 'CREATE' && preview.matchType === 'none') {
    return `
⚠️ **Não encontrei informação similar para ${preview.operation === 'DELETE' ? 'deletar' : 'atualizar'}.**

Categoria: ${categoryLabels[preview.category]}

Você pode criar uma nova entrada com os dados abaixo:

\`\`\`
${preview.content}
\`\`\`
    `.trim()
  }

  // Múltiplos matches — precisa desambiguar
  if (preview.operation !== 'CREATE' && preview.matchType === 'multiple' && preview.matches?.length) {
    return `
⚠️ **Encontrei múltiplas informações similares.**

Especifique qual você quer ${preview.operation === 'UPDATE' ? 'atualizar' : 'deletar'}:

${preview.matches
        .map(
          (m, i) => `
**${i + 1}. ${m.title}** (${Math.round(m.score * 100)}% similar)
\`\`\`
${m.content.substring(0, 150)}${m.content.length > 150 ? '...' : ''}
\`\`\`
`
        )
        .join('\n')}
    `.trim()
  }

  // DELETE com match único
  if (preview.operation === 'DELETE' && preview.matches?.[0]) {
    const match = preview.matches[0]
    return `
${emojis.DELETE} **Confirmar exclusão**

**Entry encontrada:** ${match.title}
Categoria: ${categoryLabels[preview.category]}

**Conteúdo atual:**
\`\`\`
${match.content}
\`\`\`

⚠️ Esta ação não pode ser desfeita.
    `.trim()
  }

  // UPDATE ou REPLACE com match único
  if ((preview.operation === 'UPDATE' || preview.operation === 'REPLACE') && preview.matches?.[0]) {
    const match = preview.matches[0]
    return `
${emojis[preview.operation]} **Vou ${preview.operation === 'UPDATE' ? 'atualizar' : 'substituir'} esta informação**

**Entry encontrada:** ${match.title} (${Math.round(match.score * 100)}% similar)
Categoria: ${categoryLabels[preview.category]}

**Conteúdo ATUAL:**
\`\`\`
${match.content}
\`\`\`

**Novo conteúdo:**
\`\`\`
${preview.content}
\`\`\`

**Tags:** ${preview.tags.join(', ')}

${preview.metadata ? `**Dados Estruturados:**\n\`\`\`json\n${JSON.stringify(preview.metadata, null, 2)}\n\`\`\`` : ''}
    `.trim()
  }

  // CREATE padrão
  return `
${emojis.CREATE} **Vou criar na base de conhecimento:**

**Categoria:** ${categoryLabels[preview.category]}
**Título:** ${preview.title}

**Conteúdo:**
\`\`\`
${preview.content}
\`\`\`

**Tags:** ${preview.tags.join(', ')}

${preview.metadata ? `**Dados Estruturados:**\n\`\`\`json\n${JSON.stringify(preview.metadata, null, 2)}\n\`\`\`` : ''}
  `.trim()
}
