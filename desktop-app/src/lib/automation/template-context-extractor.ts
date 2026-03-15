import { inferSlotBindings } from './slot-binder'
import type {
  KonvaPage,
  KonvaTemplateDocument,
  KonvaTextLayer,
  Layer,
  SlotFieldKey,
} from '@/types/template'
import type { ArtFormat } from '@/types/template'

// Priority classification for slots
export type SlotPriority = 'primary' | 'secondary' | 'tertiary'

// Layout style classification
export type LayoutStyle = 'hero-title' | 'balanced' | 'info-dense' | 'minimal'

// Inferred purpose of the template
export type TemplatePurpose = 'promotional' | 'informational' | 'menu' | 'event' | 'generic'

// Slot with extracted content and metadata
export interface ExtractedSlot {
  fieldKey: SlotFieldKey
  layerName: string
  currentText: string
  fontSize: number
  maxLines: number
  priority: SlotPriority
  textLength: number
  wordCount: number
}

// Visual hierarchy analysis
export interface VisualHierarchy {
  primarySlot: SlotFieldKey | null
  secondarySlots: SlotFieldKey[]
  slotOrder: SlotFieldKey[]
  layoutStyle: LayoutStyle
}

// Complete template context extraction result
export interface TemplateContextExtraction {
  templateId: string
  templateName: string
  format: ArtFormat
  pageId: string
  pageName: string

  // Extracted slots with content
  slots: ExtractedSlot[]

  // Visual analysis
  visualHierarchy: VisualHierarchy

  // Inferred semantics
  inferredPurpose: TemplatePurpose

  // Statistics
  stats: {
    totalSlots: number
    filledSlots: number
    totalWordCount: number
    averageTextLength: number
    textDensity: 'low' | 'medium' | 'high'
  }
}

// Helper to check if layer is a text layer
function isTextLayer(layer: Layer): layer is KonvaTextLayer {
  return layer.type === 'text' || layer.type === 'rich-text'
}

// Get the current/primary page from document
function getCurrentPage(document: KonvaTemplateDocument): KonvaPage | null {
  const currentPageId = document.design.currentPageId
  if (currentPageId) {
    const page = document.design.pages.find((p) => p.id === currentPageId)
    if (page) return page
  }
  return document.design.pages[0] ?? null
}

// Find text layer by ID across all pages
function findTextLayerById(document: KonvaTemplateDocument, layerId: string): KonvaTextLayer | null {
  for (const page of document.design.pages) {
    const layer = page.layers.find((l) => l.id === layerId)
    if (layer && isTextLayer(layer)) {
      return layer
    }
  }
  return null
}

// Determine slot priority based on font size and position
function determineSlotPriority(
  layer: KonvaTextLayer,
  allLayers: KonvaTextLayer[],
  fieldKey: SlotFieldKey,
): SlotPriority {
  // Title is typically primary
  if (fieldKey === 'title') {
    return 'primary'
  }

  // Pre-title and description are typically secondary
  if (fieldKey === 'pre_title' || fieldKey === 'description') {
    return 'secondary'
  }

  // Sort layers by font size to determine relative priority
  const sortedBySize = [...allLayers].sort(
    (a, b) => (b.textStyle?.fontSize ?? 0) - (a.textStyle?.fontSize ?? 0),
  )

  const position = sortedBySize.findIndex((l) => l.id === layer.id)
  const totalLayers = sortedBySize.length

  if (position === 0) return 'primary'
  if (position < totalLayers / 2) return 'secondary'
  return 'tertiary'
}

// Determine layout style based on slot distribution
function determineLayoutStyle(slots: ExtractedSlot[]): LayoutStyle {
  if (slots.length === 0) return 'minimal'

  const totalWordCount = slots.reduce((sum, s) => sum + s.wordCount, 0)
  const primarySlot = slots.find((s) => s.priority === 'primary')
  const secondarySlots = slots.filter((s) => s.priority === 'secondary')

  // Hero-title: one dominant title, few other elements
  if (primarySlot && secondarySlots.length <= 1 && totalWordCount < 15) {
    return 'hero-title'
  }

  // Info-dense: many slots, lots of text
  if (slots.length >= 4 || totalWordCount >= 30) {
    return 'info-dense'
  }

  // Minimal: very few slots, little text
  if (slots.length <= 2 && totalWordCount < 10) {
    return 'minimal'
  }

  // Balanced: moderate distribution
  return 'balanced'
}

// Infer template purpose from content and structure
function inferTemplatePurpose(
  slots: ExtractedSlot[],
  document: KonvaTemplateDocument,
): TemplatePurpose {
  const allText = slots.map((s) => s.currentText.toLowerCase()).join(' ')
  const templateName = document.name.toLowerCase()
  const combinedText = `${allText} ${templateName}`

  // Check for promotional signals
  const promotionalPatterns = [
    /promo[cç]/i,
    /desconto/i,
    /oferta/i,
    /sale/i,
    /off\b/i,
    /\d+%/i,
    /gratis/i,
    /free/i,
    /especial/i,
    /exclusiv/i,
    /imperd/i,
    /aproveite/i,
    /confira/i,
    /reserve/i,
    /compre/i,
  ]

  if (promotionalPatterns.some((p) => p.test(combinedText))) {
    return 'promotional'
  }

  // Check for menu signals
  const menuPatterns = [
    /card[aá]pio/i,
    /menu/i,
    /prato/i,
    /bebida/i,
    /drink/i,
    /sobremesa/i,
    /entrada/i,
    /porç[aã]o/i,
    /combo/i,
    /rodizio/i,
    /buffet/i,
  ]

  if (menuPatterns.some((p) => p.test(combinedText))) {
    return 'menu'
  }

  // Check for event signals
  const eventPatterns = [
    /evento/i,
    /festa/i,
    /show/i,
    /apresenta/i,
    /live/i,
    /ao vivo/i,
    /hor[aá]rio/i,
    /data:/i,
    /dia\s+\d/i,
    /\d+\s*h\b/i,
    /\d+:\d+/i,
    /inscri/i,
    /particip/i,
  ]

  if (eventPatterns.some((p) => p.test(combinedText))) {
    return 'event'
  }

  // Check for informational signals
  const infoPatterns = [
    /institucional/i,
    /sobre n[oó]s/i,
    /quem somos/i,
    /nossa hist/i,
    /miss[aã]o/i,
    /vis[aã]o/i,
    /valores/i,
    /diferencial/i,
    /qualidade/i,
    /tradi[cç][aã]o/i,
  ]

  if (infoPatterns.some((p) => p.test(combinedText))) {
    return 'informational'
  }

  return 'generic'
}

// Calculate text density classification
function calculateTextDensity(slots: ExtractedSlot[]): 'low' | 'medium' | 'high' {
  const totalWords = slots.reduce((sum, s) => sum + s.wordCount, 0)

  if (totalWords <= 8) return 'low'
  if (totalWords <= 20) return 'medium'
  return 'high'
}

// Count words in text
function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length
}

/**
 * Extract comprehensive context from a Konva template document.
 * This context is used to generate smarter AI prompts that understand
 * the template's structure, content, and purpose.
 */
export function extractTemplateContext(
  document: KonvaTemplateDocument,
  pageId?: string,
): TemplateContextExtraction {
  // Get the target page
  const page = pageId
    ? document.design.pages.find((p) => p.id === pageId) ?? getCurrentPage(document)
    : getCurrentPage(document)

  if (!page) {
    // Return empty context if no page found
    return {
      templateId: document.id,
      templateName: document.name,
      format: document.format,
      pageId: '',
      pageName: '',
      slots: [],
      visualHierarchy: {
        primarySlot: null,
        secondarySlots: [],
        slotOrder: [],
        layoutStyle: 'minimal',
      },
      inferredPurpose: 'generic',
      stats: {
        totalSlots: 0,
        filledSlots: 0,
        totalWordCount: 0,
        averageTextLength: 0,
        textDensity: 'low',
      },
    }
  }

  // Get slot bindings (either explicit or inferred)
  const bindings = document.slots.length > 0 ? document.slots : inferSlotBindings(document)

  // Get all text layers for comparison
  const textLayers = page.layers.filter(isTextLayer)

  // Extract slot information with content
  const extractedSlots: ExtractedSlot[] = bindings
    .map((binding) => {
      const layer = findTextLayerById(document, binding.layerId)
      if (!layer) return null

      const currentText = (layer.text ?? '').trim()
      const fontSize = layer.textStyle?.fontSize ?? 24
      const maxLines = binding.constraints?.maxLines ?? layer.textStyle?.maxLines ?? 3

      return {
        fieldKey: binding.fieldKey,
        layerName: layer.name ?? binding.fieldKey,
        currentText,
        fontSize,
        maxLines,
        priority: determineSlotPriority(layer, textLayers, binding.fieldKey),
        textLength: currentText.length,
        wordCount: countWords(currentText),
      }
    })
    .filter((slot): slot is ExtractedSlot => slot !== null)

  // Sort slots by priority and font size
  const sortedSlots = [...extractedSlots].sort((a, b) => {
    const priorityOrder: Record<SlotPriority, number> = {
      primary: 0,
      secondary: 1,
      tertiary: 2,
    }
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return b.fontSize - a.fontSize
  })

  // Build visual hierarchy
  const primarySlot = sortedSlots.find((s) => s.priority === 'primary')?.fieldKey ?? null
  const secondarySlots = sortedSlots
    .filter((s) => s.priority === 'secondary')
    .map((s) => s.fieldKey)
  const slotOrder = sortedSlots.map((s) => s.fieldKey)
  const layoutStyle = determineLayoutStyle(extractedSlots)

  // Infer template purpose
  const inferredPurpose = inferTemplatePurpose(extractedSlots, document)

  // Calculate statistics
  const filledSlots = extractedSlots.filter((s) => s.currentText.length > 0)
  const totalWordCount = extractedSlots.reduce((sum, s) => sum + s.wordCount, 0)
  const averageTextLength =
    filledSlots.length > 0
      ? Math.round(filledSlots.reduce((sum, s) => sum + s.textLength, 0) / filledSlots.length)
      : 0

  return {
    templateId: document.id,
    templateName: document.name,
    format: document.format,
    pageId: page.id,
    pageName: page.name,
    slots: extractedSlots,
    visualHierarchy: {
      primarySlot,
      secondarySlots,
      slotOrder,
      layoutStyle,
    },
    inferredPurpose,
    stats: {
      totalSlots: extractedSlots.length,
      filledSlots: filledSlots.length,
      totalWordCount,
      averageTextLength,
      textDensity: calculateTextDensity(extractedSlots),
    },
  }
}

/**
 * Format template context as a string for inclusion in AI prompts.
 * This provides the AI with structured information about the template.
 */
export function formatContextForPrompt(context: TemplateContextExtraction): string {
  if (context.slots.length === 0) {
    return ''
  }

  const lines: string[] = []

  // Template metadata
  lines.push(`CONTEXTO DO TEMPLATE SELECIONADO:`)
  lines.push(`- Nome: ${context.templateName}`)
  lines.push(`- Formato: ${context.format}`)
  lines.push(`- Propósito inferido: ${translatePurpose(context.inferredPurpose)}`)
  lines.push(`- Estilo de layout: ${translateLayoutStyle(context.visualHierarchy.layoutStyle)}`)
  lines.push(`- Densidade de texto: ${translateDensity(context.stats.textDensity)}`)
  lines.push('')

  // Current content
  const filledSlots = context.slots.filter((s) => s.currentText.length > 0)
  if (filledSlots.length > 0) {
    lines.push(`CONTEÚDO ATUAL (use como referência de tom e densidade):`)
    for (const slot of filledSlots) {
      const priorityLabel = slot.priority === 'primary' ? '(principal)' : slot.priority === 'secondary' ? '(secundário)' : '(terciário)'
      lines.push(`- ${slot.fieldKey} ${priorityLabel}: "${slot.currentText}"`)
    }
    lines.push('')
  }

  // Slot constraints
  lines.push(`RESTRIÇÕES DOS CAMPOS:`)
  for (const slot of context.slots) {
    lines.push(`- ${slot.fieldKey}: máx ${slot.maxLines} linha(s), fonte ${slot.fontSize}px`)
  }

  return lines.join('\n')
}

/**
 * Generate adaptation rules based on template context.
 * These rules guide the AI to maintain consistency with existing content.
 */
export function generateAdaptationRules(context: TemplateContextExtraction): string[] {
  const rules: string[] = []

  // Density rules
  if (context.stats.textDensity === 'low') {
    rules.push('Mantenha textos curtos e impactantes - este template é minimalista')
  } else if (context.stats.textDensity === 'high') {
    rules.push('Este template suporta textos mais detalhados - aproveite o espaço disponível')
  }

  // Layout-specific rules
  switch (context.visualHierarchy.layoutStyle) {
    case 'hero-title':
      rules.push('Priorize um título forte e memorável - ele é o elemento central')
      break
    case 'info-dense':
      rules.push('Distribua as informações entre os campos disponíveis de forma equilibrada')
      break
    case 'minimal':
      rules.push('Use apenas as palavras essenciais - menos é mais neste layout')
      break
    case 'balanced':
      rules.push('Mantenha equilíbrio entre título chamativo e descrição informativa')
      break
  }

  // Purpose-specific rules
  switch (context.inferredPurpose) {
    case 'promotional':
      rules.push('Use linguagem persuasiva e urgente para maximizar conversão')
      break
    case 'menu':
      rules.push('Seja descritivo nos itens, destaque ingredientes ou diferenciais')
      break
    case 'event':
      rules.push('Inclua informações práticas: data, horário, local quando relevante')
      break
    case 'informational':
      rules.push('Mantenha tom profissional e credível')
      break
  }

  // Content consistency rules
  const filledSlots = context.slots.filter((s) => s.currentText.length > 0)
  if (filledSlots.length > 0) {
    const avgWords = Math.round(
      filledSlots.reduce((sum, s) => sum + s.wordCount, 0) / filledSlots.length,
    )
    if (avgWords <= 3) {
      rules.push('Siga o padrão existente: textos com 1-3 palavras por campo')
    } else if (avgWords <= 6) {
      rules.push('Siga o padrão existente: textos com 3-6 palavras por campo')
    } else {
      rules.push('Siga o padrão existente: textos mais descritivos são permitidos')
    }
  }

  return rules
}

// Translation helpers
function translatePurpose(purpose: TemplatePurpose): string {
  const map: Record<TemplatePurpose, string> = {
    promotional: 'Promocional/Vendas',
    informational: 'Institucional',
    menu: 'Cardápio/Menu',
    event: 'Evento/Agenda',
    generic: 'Genérico',
  }
  return map[purpose]
}

function translateLayoutStyle(style: LayoutStyle): string {
  const map: Record<LayoutStyle, string> = {
    'hero-title': 'Título destaque (hero)',
    balanced: 'Balanceado',
    'info-dense': 'Rico em informação',
    minimal: 'Minimalista',
  }
  return map[style]
}

function translateDensity(density: 'low' | 'medium' | 'high'): string {
  const map = {
    low: 'Baixa (textos curtos)',
    medium: 'Média',
    high: 'Alta (textos detalhados)',
  }
  return map[density]
}
