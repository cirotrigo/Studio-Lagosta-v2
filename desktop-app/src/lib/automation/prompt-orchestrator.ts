import { preloadKonvaDocumentFonts } from '@/lib/editor/font-preload'
import { renderPageToDataUrl } from '@/lib/editor/render-page'
import { normalizeKonvaTextValue } from '@/lib/editor/text-normalization'
import { generateAdaptiveLayout } from '@/lib/automation/layout-engine'
import type { BrandAssets } from '@/hooks/use-brand-assets'
import type { ImageContextAnalysis } from '@/lib/automation/image-context-analyzer'
import type { Project } from '@/stores/project.store'
import type { ReviewField } from '@/stores/generation.store'
import type {
  ArtFormat,
  KonvaTemplateDocument,
  SlotFieldKey,
} from '@/types/template'
import {
  analyzeKonvaTemplate,
  applyCopyToKonvaTemplate,
  type SlotBinderInput,
} from './slot-binder'
import {
  extractTemplateContext,
  type TemplateContextExtraction,
} from './template-context-extractor'

type StructuredCopyVariation = Record<SlotFieldKey, string>

export interface PromptKnowledgeHit {
  entryId: string
  title: string
  category: string
  content: string
  score: number
  source: 'rag' | 'fallback-db'
}

export interface PromptKnowledgeResult {
  applied: boolean
  context: string
  categoriesUsed: string[]
  hits: PromptKnowledgeHit[]
}

export type ObjectivePreset = 'promocao' | 'institucional' | 'agenda' | 'oferta' | null
export type TonePreset = 'casual' | 'profissional' | 'urgente' | 'inspirador' | null

export interface PromptOrchestratorInput {
  projectId: number
  prompt: string
  format: ArtFormat
  variations: 1 | 2 | 4
  backgroundMode: 'photo' | 'ai'
  photoUrl?: string
  referenceUrls?: string[]
  manualTemplateId?: string
  selectedPageId?: string // ID of the specific page within the template
  analyzeImageForContext?: boolean
  objective?: ObjectivePreset
  tone?: TonePreset
  includedFields?: SlotFieldKey[]
  templates: KonvaTemplateDocument[]
  project?: Pick<Project, 'id' | 'name' | 'logoUrl'>
  brandAssets?: Pick<
    BrandAssets,
    'name' | 'colors' | 'fonts' | 'logo' | 'titleFontFamily' | 'bodyFontFamily'
  >
}

export interface PreparedPromptVariation {
  id: string
  index: number
  templateId: string
  templateName: string
  fields: ReviewField[]
  fieldValues: StructuredCopyVariation
  warnings: string[]
}

export interface PreparedPromptBatch {
  selectedTemplate: KonvaTemplateDocument
  templateSelection: {
    mode: 'auto' | 'manual'
    templateId: string
    templateName: string
  }
  knowledge: PromptKnowledgeResult
  imageAnalysis?: ImageContextAnalysis
  warnings: string[]
  conflicts: string[]
  variations: PreparedPromptVariation[]
}

export interface RenderedPromptVariation extends PreparedPromptVariation {
  imageUrl: string
  document: KonvaTemplateDocument
}

interface RenderPromptVariationOptions {
  backgroundImageUrl?: string
}

interface GenerateAiTextResponse {
  variacoes: StructuredCopyVariation[]
  knowledge?: PromptKnowledgeResult
  imageAnalysis?: ImageContextAnalysis
  warnings?: string[]
  conflicts?: string[]
}

function normalizeVariation(variation: Partial<StructuredCopyVariation> | undefined): StructuredCopyVariation {
  return {
    pre_title: normalizeKonvaTextValue(variation?.pre_title),
    title: normalizeKonvaTextValue(variation?.title),
    description: normalizeKonvaTextValue(variation?.description),
    cta: normalizeKonvaTextValue(variation?.cta),
    badge: normalizeKonvaTextValue(variation?.badge),
    footer_info_1: normalizeKonvaTextValue(variation?.footer_info_1),
    footer_info_2: normalizeKonvaTextValue(variation?.footer_info_2),
  }
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

function summarizeDensity(variation: StructuredCopyVariation): number {
  return Object.values(variation).reduce((total, value) => total + countWords(value), 0)
}

function inferPromptObjective(prompt: string): 'campaign' | 'menu' | 'branding' | 'generic' {
  const normalized = prompt.toLowerCase()

  if (/(happy hour|promoc|oferta|evento|combo|desconto|rodizio)/i.test(normalized)) {
    return 'campaign'
  }

  if (/(cardapio|menu|prato|bebida|drink|sobremesa)/i.test(normalized)) {
    return 'menu'
  }

  if (/(institucional|manifesto|marca|diferencial|quem somos)/i.test(normalized)) {
    return 'branding'
  }

  return 'generic'
}

function buildFallbackTemplate(input: PromptOrchestratorInput): KonvaTemplateDocument {
  const titleFont =
    input.brandAssets?.titleFontFamily ||
    input.brandAssets?.fonts?.[0]?.fontFamily ||
    'Inter'
  const bodyFont =
    input.brandAssets?.bodyFontFamily ||
    input.brandAssets?.fonts?.[0]?.fontFamily ||
    titleFont
  const primary = input.brandAssets?.colors?.[0] || '#111827'
  const accent = input.brandAssets?.colors?.[1] || '#F59E0B'
  const surface = input.brandAssets?.colors?.[2] || '#FFF9F1'

  const allFields: SlotFieldKey[] = ['pre_title', 'title', 'description', 'cta', 'badge', 'footer_info_1', 'footer_info_2']
  const includedFields = input.includedFields?.length ? input.includedFields : allFields

  const doc = generateAdaptiveLayout({
    format: input.format,
    includedFields,
    photoUrl: input.photoUrl,
    brand: {
      titleFont,
      bodyFont,
      primary,
      accent,
      surface,
      logoUrl: input.brandAssets?.logo?.url || input.project?.logoUrl || undefined,
      projectName: input.brandAssets?.name || input.project?.name,
    },
    projectId: input.projectId,
  })

  // Inject brand fonts into the document identity
  if (input.brandAssets?.fonts?.length) {
    doc.identity.fonts = input.brandAssets.fonts.map((font) => ({
      name: font.name,
      fontFamily: font.fontFamily,
      fileUrl: font.fileUrl,
    }))
  }
  if (input.brandAssets?.colors?.length) {
    doc.identity.colors = input.brandAssets.colors
  }

  return doc
}

function scoreTemplate(template: KonvaTemplateDocument, copies: StructuredCopyVariation[], backgroundMode: 'photo' | 'ai', prompt: string): number {
  const analysis = analyzeKonvaTemplate(template)
  const averageDensity = copies.length > 0
    ? copies.reduce((total, copy) => total + summarizeDensity(copy), 0) / copies.length
    : 0
  const objective = inferPromptObjective(prompt)

  let score = analysis.textCapacityScore + analysis.textLayerCount * 12

  if (averageDensity >= 18) {
    score += analysis.supportsFooter ? 24 : 0
    score += analysis.bindings.length >= 3 ? 18 : 0
  } else {
    score += analysis.bindings.some((binding) => binding.fieldKey === 'title') ? 16 : 0
  }

  if (objective === 'campaign') {
    score += analysis.supportsBadge ? 18 : 0
    score += analysis.supportsCta ? 16 : 0
  }

  if (objective === 'menu') {
    score += analysis.supportsFooter ? 14 : 0
  }

  if (backgroundMode === 'photo' && analysis.hasPhotoSlot) {
    score += 12
  }

  return score
}

function selectTemplate(input: PromptOrchestratorInput, copies: StructuredCopyVariation[]) {
  const formatTemplates = input.templates.filter((template) => template.format === input.format)
  const isManualSelection = Boolean(input.selectedPageId || input.manualTemplateId)
  const selectionMode: 'auto' | 'manual' = isManualSelection ? 'manual' : 'auto'

  // Strategy 1: Find by page ID (Design.id maps to Page.id)
  if (input.selectedPageId) {
    for (const template of formatTemplates) {
      const page = template.design.pages.find((p) => p.id === input.selectedPageId)
      if (page) {
        // Return template with currentPageId set to the selected page
        return {
          mode: selectionMode,
          template: {
            ...template,
            design: {
              ...template.design,
              currentPageId: page.id,
            },
          },
        }
      }
    }
  }

  // Strategy 2: Find by template ID (local ID)
  if (input.manualTemplateId) {
    const manual = formatTemplates.find((template) => template.id === input.manualTemplateId)
    if (manual) {
      return {
        mode: selectionMode,
        template: manual,
      }
    }

    // Strategy 3: Find by server template ID (remoteId)
    const serverTemplateId = Number(input.manualTemplateId)
    if (!isNaN(serverTemplateId)) {
      const byRemoteId = formatTemplates.find((template) => template.meta.remoteId === serverTemplateId)
      if (byRemoteId) {
        return {
          mode: selectionMode,
          template: byRemoteId,
        }
      }
    }
  }

  if (formatTemplates.length === 0) {
    return {
      mode: 'auto' as const,
      template: buildFallbackTemplate(input),
    }
  }

  const sorted = formatTemplates
    .map((template) => ({
      template,
      score: scoreTemplate(template, copies, input.backgroundMode, input.prompt),
    }))
    .sort((left, right) => right.score - left.score)

  return {
    mode: selectionMode,
    template: sorted[0]?.template ?? buildFallbackTemplate(input),
  }
}

function toReviewFields(copy: StructuredCopyVariation): ReviewField[] {
  return [
    { key: 'pre_title', label: 'Pre-title', value: copy.pre_title },
    { key: 'title', label: 'Titulo', value: copy.title },
    { key: 'description', label: 'Descricao', value: copy.description },
    { key: 'badge', label: 'Badge', value: copy.badge },
    { key: 'cta', label: 'CTA', value: copy.cta },
    { key: 'footer_info_1', label: 'Info rodape 1', value: copy.footer_info_1 },
    { key: 'footer_info_2', label: 'Info rodape 2', value: copy.footer_info_2 },
  ].filter((field) => field.value.trim().length > 0)
}

export async function preparePromptBatch(
  input: PromptOrchestratorInput,
): Promise<PreparedPromptBatch> {
  console.log('='.repeat(60))
  console.log('[PromptOrchestrator] ===== PREPARE PROMPT BATCH =====')
  console.log('[PromptOrchestrator] preparePromptBatch called with:', {
    selectedPageId: input.selectedPageId,
    manualTemplateId: input.manualTemplateId,
    format: input.format,
    templatesCount: input.templates.length,
    templateIds: input.templates.map((t) => t.id).slice(0, 5),
  })

  // Try to find the manually selected template first
  let manualTemplate: KonvaTemplateDocument | null = null

  if (input.selectedPageId) {
    console.log('[PromptOrchestrator] Looking for page:', input.selectedPageId)
    // Find template containing the selected page
    for (const template of input.templates) {
      const page = template.design.pages.find((p) => p.id === input.selectedPageId)
      if (page) {
        console.log('[PromptOrchestrator] Found page in template:', {
          templateId: template.id,
          templateName: template.name,
          pageId: page.id,
          pageName: page.name,
        })
        // Set currentPageId to the selected page
        manualTemplate = {
          ...template,
          design: {
            ...template.design,
            currentPageId: page.id,
          },
        }
        break
      }
    }

    // Fallback: page ID from server doesn't match local page IDs
    // Try to find template by remoteId (server template ID)
    if (!manualTemplate && input.manualTemplateId) {
      const serverTemplateId = Number(input.manualTemplateId)
      console.log('[PromptOrchestrator] Page not found, trying remoteId fallback:', serverTemplateId)
      if (!isNaN(serverTemplateId)) {
        const found = input.templates.find((t) => t.meta.remoteId === serverTemplateId)
        if (found) {
          console.log('[PromptOrchestrator] Found template by remoteId:', {
            templateId: found.id,
            templateName: found.name,
            remoteId: found.meta.remoteId,
          })
          manualTemplate = found
        } else {
          console.warn('[PromptOrchestrator] Template not found by remoteId! Available remoteIds:',
            input.templates.map((t) => ({ id: t.id, name: t.name, remoteId: t.meta.remoteId })).slice(0, 10)
          )
        }
      }
    }

    if (!manualTemplate) {
      console.warn('[PromptOrchestrator] Page not found in any template! Available pages:',
        input.templates.flatMap((t) => t.design.pages.map((p) => ({ templateId: t.id, pageId: p.id, pageName: p.name }))).slice(0, 10)
      )
    }
  } else if (input.manualTemplateId) {
    console.log('[PromptOrchestrator] Looking for template:', input.manualTemplateId)
    // Find template by ID
    const found = input.templates.find((t) => t.id === input.manualTemplateId)
    if (found) {
      console.log('[PromptOrchestrator] Found template:', found.name)
      manualTemplate = found
    } else {
      console.warn('[PromptOrchestrator] Template not found!')
    }
  } else {
    console.log('[PromptOrchestrator] No manual selection, will auto-select')
  }

  // Extract template context for smarter prompts (only if manual template found)
  let templateContext: TemplateContextExtraction | undefined
  if (manualTemplate) {
    templateContext = extractTemplateContext(
      manualTemplate,
      input.selectedPageId,
    )
    console.log('[PromptOrchestrator] Template context extracted:', {
      templateId: manualTemplate.id,
      templateName: manualTemplate.name,
      selectedPageId: input.selectedPageId,
      slotsFound: templateContext.slots.length,
      slotFieldKeys: templateContext.slots.map((s) => s.fieldKey),
      inferredPurpose: templateContext.inferredPurpose,
    })
  }

  const copyResponse = await window.electronAPI.generateAIText({
    projectId: input.projectId,
    prompt: input.prompt,
    format: input.format,
    variations: input.variations,
    includeLogo: true,
    usePhoto: input.backgroundMode === 'photo',
    photoUrl: input.photoUrl,
    compositionEnabled: input.backgroundMode === 'ai',
    compositionPrompt: input.backgroundMode === 'ai' ? input.prompt : undefined,
    compositionReferenceUrls: input.referenceUrls,
    analyzeImageForContext: input.analyzeImageForContext === true,
    analysisImageUrl: input.photoUrl || input.referenceUrls?.[0],
    objective: input.objective ?? undefined,
    tone: input.tone ?? undefined,
    includedFields: input.includedFields,
    templateContext: templateContext,
  }) as GenerateAiTextResponse

  const allFieldKeys: SlotFieldKey[] = ['pre_title', 'title', 'description', 'cta', 'badge', 'footer_info_1', 'footer_info_2']
  const copies = copyResponse.variacoes.map((variation) => {
    const normalized = normalizeVariation(variation)
    // Force-clear excluded fields so slot-binder never sees them
    if (input.includedFields?.length) {
      for (const key of allFieldKeys) {
        if (!input.includedFields.includes(key)) {
          normalized[key] = ''
        }
      }
    }
    return normalized
  })

  // Use manual template if found, otherwise auto-select
  const selection = manualTemplate
    ? { mode: 'manual' as const, template: manualTemplate }
    : selectTemplate(input, copies)
  const warnings = [
    ...(copyResponse.warnings ?? []),
  ]

  return {
    selectedTemplate: selection.template,
    templateSelection: {
      mode: selection.mode,
      templateId: selection.template.id,
      templateName: selection.template.name,
    },
    knowledge: {
      applied: copyResponse.knowledge?.applied === true,
      context: copyResponse.knowledge?.context ?? '',
      categoriesUsed: copyResponse.knowledge?.categoriesUsed ?? [],
      hits: copyResponse.knowledge?.hits ?? [],
    },
    imageAnalysis: copyResponse.imageAnalysis,
    warnings,
    conflicts: copyResponse.conflicts ?? [],
    variations: copies.map((copy, index) => ({
      id: crypto.randomUUID(),
      index,
      templateId: selection.template.id,
      templateName: selection.template.name,
      fields: toReviewFields(copy),
      fieldValues: copy,
      warnings: [],
    })),
  }
}

export async function renderPromptVariation(
  input: PromptOrchestratorInput,
  template: KonvaTemplateDocument,
  variation: PreparedPromptVariation,
  options?: RenderPromptVariationOptions,
): Promise<RenderedPromptVariation> {
  console.log('[PromptOrchestrator] renderPromptVariation called:', {
    templateId: template.id,
    templateName: template.name,
    currentPageId: template.design.currentPageId,
    pagesCount: template.design.pages.length,
    fieldValues: variation.fieldValues,
  })

  const binderInput: SlotBinderInput = {
    fieldValues: variation.fieldValues,
    backgroundMode: input.backgroundMode,
    photoUrl: input.photoUrl,
    backgroundImageUrl: options?.backgroundImageUrl,
    brandLogoUrl: input.brandAssets?.logo?.url || input.project?.logoUrl || null,
    brandColors: input.brandAssets?.colors,
  }

  const bound = applyCopyToKonvaTemplate(template, binderInput)
  console.log('[PromptOrchestrator] applyCopyToKonvaTemplate result:', {
    slotBindingsCount: bound.slotBindings.length,
    slotBindings: bound.slotBindings.map((b) => ({ fieldKey: b.fieldKey, layerId: b.layerId })),
    fieldsApplied: bound.fields.map((f) => ({ key: f.key, value: f.value.substring(0, 30) })),
    warnings: bound.warnings,
  })

  const currentPage = bound.document.design.pages.find(
    (page) => page.id === bound.document.design.currentPageId,
  ) ?? bound.document.design.pages[0]

  if (!currentPage) {
    throw new Error('Template Konva sem pagina para renderizar.')
  }

  const preloadResult = await preloadKonvaDocumentFonts({
    document: bound.document,
    brandFonts: input.brandAssets?.fonts,
  })

  if (preloadResult.warnings.length > 0) {
    console.warn('[Prompt Orchestrator] Font preload warnings:', preloadResult.warnings)
  }

  const imageUrl = await renderPageToDataUrl(currentPage, {
    mimeType: 'image/png',
    quality: 0.94,
    preferBlobDownload: true,
  })

  if (!imageUrl) {
    throw new Error('Falha ao renderizar preview da variacao.')
  }

  return {
    ...variation,
    imageUrl,
    document: bound.document,
    fields: bound.fields.length > 0 ? bound.fields : variation.fields,
    warnings: Array.from(new Set([...variation.warnings, ...bound.warnings])),
  }
}
