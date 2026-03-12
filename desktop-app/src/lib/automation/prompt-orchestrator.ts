import { createBlankPage } from '@/lib/editor/document'
import { preloadKonvaDocumentFonts } from '@/lib/editor/font-preload'
import { renderPageToDataUrl } from '@/lib/editor/render-page'
import { normalizeKonvaTextValue } from '@/lib/editor/text-normalization'
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
  analyzeImageForContext?: boolean
  objective?: ObjectivePreset
  tone?: TonePreset
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
  const page = createBlankPage(input.format, 0, {
    background: input.brandAssets?.colors?.[0] || '#111827',
  })

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

  const backgroundLayerId = crypto.randomUUID()
  const badgeLayerId = crypto.randomUUID()
  const preTitleLayerId = crypto.randomUUID()
  const titleLayerId = crypto.randomUUID()
  const descriptionLayerId = crypto.randomUUID()
  const footerLayerId = crypto.randomUUID()
  const ctaLayerId = crypto.randomUUID()
  const logoLayerId = crypto.randomUUID()

  page.layers = [
    {
      id: backgroundLayerId,
      type: 'image',
      name: 'Fundo',
      role: 'background',
      x: 0,
      y: 0,
      width: page.width,
      height: page.height,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      draggable: true,
      src: input.photoUrl ?? '',
      fit: 'cover',
    },
    {
      id: crypto.randomUUID(),
      type: 'shape',
      name: 'Card inferior',
      x: Math.round(page.width * 0.065),
      y: Math.round(page.height * 0.55),
      width: Math.round(page.width * 0.87),
      height: Math.round(page.height * 0.31),
      rotation: 0,
      opacity: 0.96,
      visible: true,
      locked: false,
      draggable: true,
      shape: 'rounded-rectangle',
      fill: surface,
      stroke: accent,
      strokeWidth: 2,
      cornerRadius: 42,
    },
    {
      id: badgeLayerId,
      type: 'text',
      name: 'Badge',
      x: Math.round(page.width * 0.1),
      y: Math.round(page.height * 0.59),
      width: Math.round(page.width * 0.44),
      height: 52,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      draggable: true,
      text: '',
      textStyle: {
        fontFamily: bodyFont,
        fontSize: 26,
        fontWeight: '700',
        lineHeight: 1.1,
        fill: accent,
        maxLines: 1,
        overflowBehavior: 'ellipsis',
      },
    },
    {
      id: preTitleLayerId,
      type: 'text',
      name: 'Pre-title',
      x: Math.round(page.width * 0.1),
      y: Math.round(page.height * 0.63),
      width: Math.round(page.width * 0.7),
      height: 50,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      draggable: true,
      text: '',
      textStyle: {
        fontFamily: bodyFont,
        fontSize: 24,
        fontWeight: '600',
        textTransform: 'uppercase',
        lineHeight: 1.1,
        fill: primary,
        maxLines: 1,
        overflowBehavior: 'ellipsis',
      },
    },
    {
      id: titleLayerId,
      type: 'text',
      name: 'Titulo',
      x: Math.round(page.width * 0.1),
      y: Math.round(page.height * 0.67),
      width: Math.round(page.width * 0.72),
      height: 220,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      draggable: true,
      text: '',
      textStyle: {
        fontFamily: titleFont,
        fontSize: input.format === 'STORY' ? 62 : 54,
        fontWeight: '800',
        lineHeight: 1.02,
        fill: primary,
        maxLines: 3,
        minFontSize: 26,
        maxFontSize: input.format === 'STORY' ? 62 : 54,
        overflowBehavior: 'autoScale',
      },
    },
    {
      id: descriptionLayerId,
      type: 'text',
      name: 'Descricao',
      x: Math.round(page.width * 0.1),
      y: Math.round(page.height * 0.79),
      width: Math.round(page.width * 0.72),
      height: 170,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      draggable: true,
      text: '',
      textStyle: {
        fontFamily: bodyFont,
        fontSize: 28,
        fontWeight: '500',
        lineHeight: 1.28,
        fill: '#374151',
        maxLines: 4,
        minFontSize: 20,
        maxFontSize: 28,
        overflowBehavior: 'autoScale',
      },
    },
    {
      id: footerLayerId,
      type: 'text',
      name: 'Info rodape',
      x: Math.round(page.width * 0.1),
      y: Math.round(page.height * 0.885),
      width: Math.round(page.width * 0.5),
      height: 70,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      draggable: true,
      text: '',
      textStyle: {
        fontFamily: bodyFont,
        fontSize: 21,
        fontWeight: '600',
        lineHeight: 1.1,
        fill: primary,
        maxLines: 2,
        minFontSize: 16,
        maxFontSize: 21,
        overflowBehavior: 'autoScale',
      },
    },
    {
      id: ctaLayerId,
      type: 'text',
      name: 'CTA',
      x: Math.round(page.width * 0.65),
      y: Math.round(page.height * 0.89),
      width: Math.round(page.width * 0.23),
      height: 54,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      draggable: true,
      text: '',
      textStyle: {
        fontFamily: bodyFont,
        fontSize: 22,
        fontWeight: '800',
        textTransform: 'uppercase',
        lineHeight: 1,
        align: 'right',
        fill: accent,
        maxLines: 1,
        minFontSize: 16,
        maxFontSize: 22,
        overflowBehavior: 'autoScale',
      },
    },
    {
      id: logoLayerId,
      type: 'logo',
      name: 'Logo',
      x: Math.round(page.width * 0.78),
      y: Math.round(page.height * 0.06),
      width: 180,
      height: 180,
      rotation: 0,
      opacity: 1,
      visible: Boolean(input.brandAssets?.logo?.url || input.project?.logoUrl),
      locked: false,
      draggable: true,
      src: input.brandAssets?.logo?.url || input.project?.logoUrl || '',
      preserveAspectRatio: true,
    },
  ]

  const now = new Date().toISOString()

  return {
    schemaVersion: 2,
    id: `fallback-${input.projectId}-${input.format.toLowerCase()}`,
    projectId: input.projectId,
    engine: 'KONVA',
    name: `Modo Rapido ${input.format}`,
    format: input.format,
    source: 'local',
    design: {
      pages: [page],
      currentPageId: page.id,
    },
    identity: {
      brandName: input.brandAssets?.name || input.project?.name,
      logoUrl: input.brandAssets?.logo?.url || input.project?.logoUrl || undefined,
      colors: input.brandAssets?.colors || [primary, accent, surface],
      fonts: (input.brandAssets?.fonts || []).map((font) => ({
        name: font.name,
        fontFamily: font.fontFamily,
        fileUrl: font.fileUrl,
      })),
    },
    slots: [
      { id: `slot-${badgeLayerId}`, layerId: badgeLayerId, fieldKey: 'badge', label: 'Badge', constraints: { maxLines: 1, overflowBehavior: 'ellipsis', minFontSize: 18, maxFontSize: 26 } },
      { id: `slot-${preTitleLayerId}`, layerId: preTitleLayerId, fieldKey: 'pre_title', label: 'Pre-title', constraints: { maxLines: 1, overflowBehavior: 'ellipsis', minFontSize: 18, maxFontSize: 24 } },
      { id: `slot-${titleLayerId}`, layerId: titleLayerId, fieldKey: 'title', label: 'Titulo', constraints: { maxLines: 3, overflowBehavior: 'scale-down', minFontSize: 26, maxFontSize: input.format === 'STORY' ? 62 : 54 } },
      { id: `slot-${descriptionLayerId}`, layerId: descriptionLayerId, fieldKey: 'description', label: 'Descricao', constraints: { maxLines: 4, overflowBehavior: 'scale-down', minFontSize: 20, maxFontSize: 28 } },
      { id: `slot-${footerLayerId}`, layerId: footerLayerId, fieldKey: 'footer_info_1', label: 'Info rodape', constraints: { maxLines: 2, overflowBehavior: 'scale-down', minFontSize: 16, maxFontSize: 21 } },
      { id: `slot-${ctaLayerId}`, layerId: ctaLayerId, fieldKey: 'cta', label: 'CTA', constraints: { maxLines: 1, overflowBehavior: 'scale-down', minFontSize: 16, maxFontSize: 22 } },
    ],
    meta: {
      createdAt: now,
      updatedAt: now,
      isDirty: true,
    },
  }
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
  const selectionMode: 'auto' | 'manual' = input.manualTemplateId ? 'manual' : 'auto'

  if (input.manualTemplateId) {
    const manual = formatTemplates.find((template) => template.id === input.manualTemplateId)
    if (manual) {
      return {
        mode: selectionMode,
        template: manual,
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
  }) as GenerateAiTextResponse

  const copies = copyResponse.variacoes.map((variation) => normalizeVariation(variation))
  const selection = selectTemplate(input, copies)
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
  const binderInput: SlotBinderInput = {
    fieldValues: variation.fieldValues,
    backgroundMode: input.backgroundMode,
    photoUrl: input.photoUrl,
    backgroundImageUrl: options?.backgroundImageUrl,
    brandLogoUrl: input.brandAssets?.logo?.url || input.project?.logoUrl || null,
    brandColors: input.brandAssets?.colors,
  }

  const bound = applyCopyToKonvaTemplate(template, binderInput)
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
