import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { generateObject, generateText } from 'ai'
import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { getInstagramTemplatePreset } from '@/lib/instagram-template-presets'
import { getProjectPromptKnowledgeContext, searchKnowledgeBase } from '@/lib/knowledge/search'
import { googleDriveService } from '@/server/google-drive-service'

export const runtime = 'nodejs'
export const maxDuration = 60

type VariationCount = 1 | 2 | 4
type VisualKnowledgeCategory = 'CARDAPIO' | 'CAMPANHAS'

const IMAGE_ANALYSIS_MODEL = 'gemini-2.5-flash'
const IMAGE_ANALYSIS_CONFIDENCE_THRESHOLD = 0.68
const IMAGE_ANALYSIS_MATCH_THRESHOLD = 0.72
const IMAGE_ANALYSIS_MAX_BYTES = 5 * 1024 * 1024
const VISUAL_KNOWLEDGE_CATEGORIES: VisualKnowledgeCategory[] = [
  'CARDAPIO',
  'CAMPANHAS',
]

const requestSchema = z.object({
  projectId: z.number().int().positive(),
  prompt: z.string().trim().min(1).max(500),
  format: z.enum(['STORY', 'FEED_PORTRAIT', 'SQUARE']).default('STORY'),
  variations: z.union([z.literal(1), z.literal(2), z.literal(4)]).default(1),
  dryRun: z.boolean().default(false),
  templateIds: z.array(z.string().min(1)).max(3).optional(),
  includeLogo: z.boolean().default(true),
  usePhoto: z.boolean().default(true),
  photoUrl: z.string().url().optional(),
  compositionEnabled: z.boolean().default(false),
  compositionPrompt: z.string().trim().max(500).optional(),
  compositionReferenceUrls: z.array(z.string().url()).max(5).optional(),
  analyzeImageForContext: z.boolean().default(false),
  analysisImageUrl: z.string().url().optional(),
}).superRefine((value, ctx) => {
  if (value.usePhoto && !value.photoUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['photoUrl'],
      message: 'photoUrl obrigatoria quando usePhoto = true',
    })
  }
})

const variationSchema = z.object({
  pre_title: z.string().max(80).default(''),
  title: z.string().max(160).default(''),
  description: z.string().max(240).default(''),
  cta: z.string().max(90).default(''),
  badge: z.string().max(90).default(''),
  footer_info_1: z.string().max(120).default(''),
  footer_info_2: z.string().max(120).default(''),
})

const responseSchema = z.object({
  variacoes: z.array(variationSchema).min(1).max(4),
})

const imageContextSchema = z.object({
  summary: z.string().trim().max(280).default(''),
  dishNameCandidates: z.array(z.string().trim().min(1).max(80)).max(5).default([]),
  sceneType: z.string().trim().max(120).default(''),
  ingredientsHints: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  confidence: z.number().min(0).max(1).default(0),
})

type Variation = z.infer<typeof variationSchema>
type ImageContextModelOutput = z.infer<typeof imageContextSchema>

interface TemplateSummary {
  id: string
  name: string
  format: string
  templateData: Record<string, unknown>
}

interface GenerateAiTextKnowledgePayload {
  applied: boolean
  context: string
  categoriesUsed: string[]
  hits: Array<{
    entryId: string
    title: string
    category: string
    content: string
    score: number
    source: 'rag' | 'fallback-db'
  }>
}

interface VisualKnowledgeHit {
  entryId: string
  title: string
  category: VisualKnowledgeCategory
  content: string
  score: number
  source: 'rag' | 'fallback-db'
}

interface GenerateAiTextImageAnalysisPayload {
  requested: boolean
  applied: boolean
  sourceImageUrl?: string
  summary: string
  sceneType: string
  confidence: number
  dishNameCandidates: string[]
  ingredientsHints: string[]
  matchedKnowledge?: {
    entryId: string
    title: string
    category: VisualKnowledgeCategory
    score: number
    reason: string
  }
  warnings: string[]
}

function normalizeLooseText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function extractGoogleDriveFileId(url: string): string | null {
  const match = url.match(/\/api\/(?:google-drive\/image|drive\/thumbnail)\/([^/?]+)/)
  return match?.[1] ?? null
}

async function fetchImageAsBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const driveFileId = extractGoogleDriveFileId(url)

    if (driveFileId) {
      if (!googleDriveService.isEnabled()) {
        console.warn('[generate-ai-text] Google Drive nao configurado para analise contextual.')
        return null
      }

      const { stream, mimeType } = await googleDriveService.getFileStream(driveFileId)
      const chunks: Buffer[] = []
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }

      const buffer = Buffer.concat(chunks)
      if (buffer.length > IMAGE_ANALYSIS_MAX_BYTES) {
        console.warn('[generate-ai-text] Imagem do Drive muito grande para analise contextual:', buffer.length)
        return null
      }

      return { buffer, mimeType }
    }

    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) {
      console.warn('[generate-ai-text] Falha ao baixar imagem para analise:', response.status, url)
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    if (buffer.length > IMAGE_ANALYSIS_MAX_BYTES) {
      console.warn('[generate-ai-text] Imagem muito grande para analise contextual:', buffer.length)
      return null
    }

    return {
      buffer,
      mimeType: response.headers.get('content-type') || 'image/jpeg',
    }
  } catch (error) {
    console.warn(
      '[generate-ai-text] Erro ao baixar imagem para analise:',
      error instanceof Error ? error.message : error,
    )
    return null
  }
}

function extractJsonObject(raw: string): string {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error('Nenhum JSON encontrado na resposta do modelo visual.')
  }

  return match[0]
}

function dedupeStrings(values: string[], max: number): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    ),
  ).slice(0, max)
}

function composeVisualKnowledgeQuery(
  prompt: string,
  analysis: ImageContextModelOutput,
): string {
  return dedupeStrings(
    [
      prompt,
      analysis.sceneType,
      analysis.summary,
      ...analysis.dishNameCandidates,
      ...analysis.ingredientsHints,
    ],
    14,
  ).join(' ')
}

function keywordPresenceScore(text: string, terms: string[]): number {
  if (terms.length === 0) return 0
  const normalized = normalizeLooseText(text)
  const matches = terms.filter((term) => normalized.includes(normalizeLooseText(term))).length
  return matches === 0 ? 0 : Math.min(0.22, matches * 0.06)
}

function computeVisualKnowledgeScore(
  prompt: string,
  analysis: ImageContextModelOutput,
  hit: VisualKnowledgeHit,
): number {
  const haystack = `${hit.title}\n${hit.content}`
  let score = hit.score
  score += keywordPresenceScore(haystack, analysis.dishNameCandidates)
  score += keywordPresenceScore(haystack, analysis.ingredientsHints)

  if (analysis.sceneType) {
    score += keywordPresenceScore(haystack, [analysis.sceneType])
  }

  if (normalizeLooseText(prompt).includes('almoco executivo')) {
    score += keywordPresenceScore(haystack, ['almoco executivo', 'executivo'])
  }

  return Math.min(0.99, score)
}

function rankVisualKnowledgeHits(
  prompt: string,
  analysis: ImageContextModelOutput,
  hits: VisualKnowledgeHit[],
): VisualKnowledgeHit[] {
  return [...hits].sort((left, right) => {
    const rightScore = computeVisualKnowledgeScore(prompt, analysis, right)
    const leftScore = computeVisualKnowledgeScore(prompt, analysis, left)
    if (rightScore !== leftScore) {
      return rightScore - leftScore
    }
    return right.score - left.score
  })
}

async function getFallbackVisualKnowledgeHits(
  projectId: number,
  analysisQuery: string,
): Promise<VisualKnowledgeHit[]> {
  const normalizedTerms = dedupeStrings(
    analysisQuery
      .split(/\s+/)
      .map((value) => value.trim())
      .filter((value) => value.length >= 4),
    12,
  )
  const now = new Date()
  const hits: VisualKnowledgeHit[] = []

  for (const category of VISUAL_KNOWLEDGE_CATEGORIES) {
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
        const haystack = normalizeLooseText(
          [entry.title, entry.content, ...(entry.tags ?? [])].join(' '),
        )
        const matches = normalizedTerms.filter((term) => haystack.includes(normalizeLooseText(term))).length
        return {
          entry,
          score: matches > 0 ? 0.64 + matches * 0.04 : 0.52,
        }
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 2)

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

async function getFocusedVisualKnowledge(
  projectId: number,
  prompt: string,
  analysis: ImageContextModelOutput,
): Promise<{ hits: VisualKnowledgeHit[]; warnings: string[] }> {
  const warnings: string[] = []
  const deduped = new Map<string, VisualKnowledgeHit>()
  const analysisQuery = composeVisualKnowledgeQuery(prompt, analysis)

  try {
    for (const category of VISUAL_KNOWLEDGE_CATEGORIES) {
      const results = await searchKnowledgeBase(
        analysisQuery,
        { projectId },
        {
          topK: 2,
          minScore: 0.55,
          includeEntryMetadata: true,
          categoryFilter: category,
        },
      )

      for (const result of results) {
        const key = `${result.entryId}:${result.chunkId}`
        if (deduped.has(key)) continue

        deduped.set(key, {
          entryId: result.entryId,
          title: result.entry?.title || 'Conhecimento visual do projeto',
          category: (result.entry?.category || category) as VisualKnowledgeCategory,
          content: result.content,
          score: result.score,
          source: 'rag',
        })
      }
    }
  } catch (error) {
    console.warn('[generate-ai-text] Busca visual focada caiu para fallback textual:', error)
    warnings.push('Analise visual sem RAG especializado; usando fallback textual do projeto.')
  }

  if (deduped.size === 0) {
    const fallbackHits = await getFallbackVisualKnowledgeHits(projectId, analysisQuery)
    for (const hit of fallbackHits) {
      deduped.set(`${hit.entryId}:${hit.category}`, hit)
    }
  }

  return {
    hits: rankVisualKnowledgeHits(prompt, analysis, Array.from(deduped.values())).slice(0, 4),
    warnings,
  }
}

async function analyzeImageContext(
  prompt: string,
  imageUrl: string,
): Promise<ImageContextModelOutput> {
  const image = await fetchImageAsBuffer(imageUrl)
  if (!image) {
    throw new Error('Nao foi possivel carregar a imagem para analise contextual.')
  }

  const { object } = await generateObject({
    model: google(IMAGE_ANALYSIS_MODEL),
    temperature: 0.2,
    maxTokens: 500,
    schema: imageContextSchema,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            image: image.buffer,
            mimeType: image.mimeType,
          },
          {
            type: 'text',
            text: [
              'Analise esta imagem de restaurante/comida para enriquecer a geracao de copy.',
              `Prompt do usuario: "${prompt}"`,
              'Regras:',
              '- Nao invente nome especifico de prato se a imagem nao permitir alta confianca.',
              '- Se houver duvida, use candidatos genericos e abaixe a confianca.',
              '- ingredientsHints deve listar apenas ingredientes ou componentes visualmente plausiveis.',
              '- sceneType deve descrever o contexto da cena em poucas palavras.',
              '- confidence mede a confianca da identificacao do prato principal/contexto (0 a 1).',
            ].join('\n'),
          },
        ],
      },
    ],
  })

  return object
}

function buildImageAnalysisPayload(
  requested: boolean,
  sourceImageUrl: string | undefined,
  analysis: ImageContextModelOutput | null,
  focusedHits: VisualKnowledgeHit[],
  warnings: string[],
  prompt: string,
): GenerateAiTextImageAnalysisPayload {
  if (!analysis) {
    return {
      requested,
      applied: false,
      sourceImageUrl,
      summary: '',
      sceneType: '',
      confidence: 0,
      dishNameCandidates: [],
      ingredientsHints: [],
      warnings,
    }
  }

  const bestHit = focusedHits[0]
  const bestScore = bestHit ? computeVisualKnowledgeScore(prompt, analysis, bestHit) : 0
  const matchedKnowledge =
    bestHit &&
    analysis.confidence >= IMAGE_ANALYSIS_CONFIDENCE_THRESHOLD &&
    bestScore >= IMAGE_ANALYSIS_MATCH_THRESHOLD
      ? {
          entryId: bestHit.entryId,
          title: bestHit.title,
          category: bestHit.category,
          score: Number(bestScore.toFixed(4)),
          reason:
            bestHit.category === 'CARDAPIO'
              ? 'Match visual confiavel com item do cardapio.'
              : 'Match visual confiavel com campanha relacionada.',
        }
      : undefined

  if (!matchedKnowledge && analysis.confidence < IMAGE_ANALYSIS_CONFIDENCE_THRESHOLD) {
    warnings.push('Analise visual com baixa confianca; copy segue sem prato especifico inventado.')
  }

  return {
    requested,
    applied: true,
    sourceImageUrl,
    summary: limitText(analysis.summary, 280),
    sceneType: limitText(analysis.sceneType, 120),
    confidence: Number(Math.max(0, Math.min(1, analysis.confidence)).toFixed(4)),
    dishNameCandidates: dedupeStrings(analysis.dishNameCandidates, 5),
    ingredientsHints: dedupeStrings(analysis.ingredientsHints, 8),
    matchedKnowledge,
    warnings: dedupeStrings(warnings, 6),
  }
}

function mergeKnowledgeHits(
  baseHits: GenerateAiTextKnowledgePayload['hits'],
  extraHits: VisualKnowledgeHit[],
): GenerateAiTextKnowledgePayload['hits'] {
  const merged = new Map<string, GenerateAiTextKnowledgePayload['hits'][number]>()

  for (const hit of baseHits) {
    merged.set(`${hit.entryId}:${hit.category}:${hit.content}`, hit)
  }

  for (const hit of extraHits) {
    const key = `${hit.entryId}:${hit.category}:${hit.content}`
    if (merged.has(key)) continue
    merged.set(key, {
      entryId: hit.entryId,
      title: hit.title,
      category: hit.category,
      content: hit.content,
      score: Number(hit.score.toFixed(4)),
      source: hit.source,
    })
  }

  return Array.from(merged.values()).slice(0, 10)
}

function limitText(value: string | undefined, max: number): string {
  if (!value) return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function maybeInsertLineBreak(title: string): string {
  const normalized = title.trim()
  if (!normalized || normalized.includes('<br>') || normalized.length <= 24) {
    return normalized
  }

  const mid = Math.floor(normalized.length / 2)
  let bestSpace = -1
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i] !== ' ') continue
    if (bestSpace === -1 || Math.abs(i - mid) < Math.abs(bestSpace - mid)) {
      bestSpace = i
    }
  }

  if (bestSpace <= 5 || bestSpace >= normalized.length - 5) {
    return normalized
  }

  return `${normalized.slice(0, bestSpace)}<br>${normalized.slice(bestSpace + 1)}`
}

function normalizeTitle(value: string | undefined): string {
  const cleaned = (value || '')
    .replace(/<br\s*\/?>/gi, '<br>')
    .replace(/\s*<br>\s*/g, '<br>')
    .replace(/\s+/g, ' ')
    .trim()

  return maybeInsertLineBreak(cleaned).slice(0, 160)
}

function normalizeVariation(raw: Partial<Variation> | undefined): Variation {
  return {
    pre_title: limitText(raw?.pre_title, 80),
    title: normalizeTitle(raw?.title),
    description: limitText(raw?.description, 240),
    cta: limitText(raw?.cta, 90),
    badge: limitText(raw?.badge, 90),
    footer_info_1: limitText(raw?.footer_info_1, 120),
    footer_info_2: limitText(raw?.footer_info_2, 120),
  }
}

function buildFallbackVariation(prompt: string): Variation {
  const compact = prompt.replace(/\s+/g, ' ').trim()
  const words = compact.split(' ').filter(Boolean)
  const titleSeed = words.slice(0, 6).join(' ').toUpperCase().slice(0, 70)
  const title = normalizeTitle(titleSeed || 'OFERTA ESPECIAL')
  const description = compact.slice(0, 180)

  return {
    pre_title: '',
    title,
    description,
    cta: 'SAIBA MAIS',
    badge: '',
    footer_info_1: '',
    footer_info_2: '',
  }
}

const VARIATION_PRE_TITLE = [
  'DESTAQUE DO DIA',
  'SOMENTE HOJE',
  'NOVIDADE',
  'EDICAO ESPECIAL',
]

const VARIATION_CTA = [
  'SAIBA MAIS',
  'PECA AGORA',
  'RESERVE JA',
  'CHAME NO WHATSAPP',
]

function extractPromptKeyword(prompt: string, index: number): string {
  const words = prompt
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4)

  if (words.length === 0) return ''
  return words[index % words.length].toUpperCase()
}

function variationSignature(variation: Variation): string {
  return [
    variation.pre_title,
    variation.title,
    variation.description,
    variation.cta,
    variation.badge,
  ]
    .join('|')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function diversifyVariation(base: Variation, prompt: string, index: number): Variation {
  const keyword = extractPromptKeyword(prompt, index)
  const cleanTitle = (base.title || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const fallbackTitle = keyword ? `${cleanTitle} ${keyword}`.trim() : cleanTitle
  const recomposedTitle = normalizeTitle(
    cleanTitle.length > 0 ? fallbackTitle : `${keyword || 'OFERTA'} ESPECIAL`
  )

  const altDescription = base.description
    ? `${base.description.replace(/\s+/g, ' ').trim()} ${keyword ? `- ${keyword}` : ''}`.trim()
    : ''

  return normalizeVariation({
    ...base,
    pre_title: base.pre_title || VARIATION_PRE_TITLE[index % VARIATION_PRE_TITLE.length],
    title: recomposedTitle,
    description: altDescription.slice(0, 240),
    cta: VARIATION_CTA[index % VARIATION_CTA.length],
  })
}

function ensureVariationCount(
  rawVariations: Partial<Variation>[] | undefined,
  required: VariationCount,
  prompt: string,
): Variation[] {
  const base = (rawVariations ?? []).map((item) => normalizeVariation(item))
  const safeBase = base.length > 0 ? base : [buildFallbackVariation(prompt)]

  const result: Variation[] = []
  for (let i = 0; i < required; i++) {
    const source = safeBase[Math.min(i, safeBase.length - 1)]
    result.push(normalizeVariation({
      ...source,
      cta: source.cta || 'SAIBA MAIS',
      title: source.title || buildFallbackVariation(prompt).title,
    }))
  }

  const seen = new Set<string>()
  for (let i = 0; i < result.length; i++) {
    const current = result[i]
    const key = variationSignature(current)
    if (!seen.has(key)) {
      seen.add(key)
      continue
    }

    const diversified = diversifyVariation(current, prompt, i)
    const diversifiedKey = variationSignature(diversified)
    if (!seen.has(diversifiedKey)) {
      result[i] = diversified
      seen.add(diversifiedKey)
      continue
    }

    const forced = normalizeVariation({
      ...diversified,
      title: normalizeTitle(
        `${diversified.title.replace(/<br\s*\/?>/gi, ' ').trim()} ${i + 1}`.trim()
      ),
      cta: VARIATION_CTA[(i + 1) % VARIATION_CTA.length],
    })
    result[i] = forced
    seen.add(variationSignature(forced))
  }

  return result
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.round(value)
}

function normalizeSlotType(rawType: unknown): string {
  const type = toText(rawType).toLowerCase()
  if (!type) return 'generic'
  if (type.includes('headline') || type.includes('title')) return 'headline'
  if (type.includes('label') || type.includes('eyebrow')) return 'label'
  if (type.includes('paragraph') || type.includes('description')) return 'description'
  if (type.includes('call_to_action') || type.includes('cta')) return 'cta'
  if (type.includes('location') || type.includes('footer') || type.includes('info')) return 'footer_info'
  return type
}

function buildTemplateGuidance(templates: TemplateSummary[]): string {
  if (templates.length === 0) return ''

  return templates.map((template, index) => {
    const contentSlots = (template.templateData.content_slots ?? {}) as Record<string, Record<string, unknown>>
    const slotPriority = Array.isArray(template.templateData.slot_priority)
      ? template.templateData.slot_priority.filter((item): item is string => typeof item === 'string')
      : []
    const textDensity = (template.templateData.text_density ?? {}) as Record<string, unknown>

    const slotLines = Object.entries(contentSlots).map(([slotName, slot]) => {
      const constraints: string[] = [`type=${normalizeSlotType(slot?.type)}`]
      const maxWords = toInt(slot?.max_words)
      const maxLines = toInt(slot?.max_lines)
      if (maxWords !== null) constraints.push(`max_words=${maxWords}`)
      if (maxLines !== null) constraints.push(`max_lines=${maxLines}`)
      return `- ${slotName}: ${constraints.join(', ')}`
    })

    const idealWords = toInt(textDensity.ideal_words)
    const maxWords = toInt(textDensity.max_words)

    const lines = [
      `Template ${index + 1}${index === 0 ? ' (principal)' : ''}: ${template.name}`,
      `- format: ${template.format}`,
      slotPriority.length > 0 ? `- slot_priority: ${slotPriority.join(' > ')}` : '',
      (idealWords !== null || maxWords !== null)
        ? `- text_density: ideal_words=${idealWords ?? 'n/a'}, max_words=${maxWords ?? 'n/a'}`
        : '',
      '- content_slots:',
      ...slotLines,
    ].filter(Boolean)

    return lines.join('\n')
  }).join('\n\n')
}

function buildSystemPrompt(brandContext: {
  projectName: string
  brandStyleDescription: string
  cuisineType: string
  colorPalette: string[]
  instagramUsername: string
}): string {
  const palette = brandContext.colorPalette.length > 0
    ? brandContext.colorPalette.join(', ')
    : 'sem paleta definida'

  return [
    'Voce e um redator senior de social media para Instagram.',
    'Retorne SOMENTE JSON valido no schema solicitado.',
    'Aplique hierarquia tipografica: pre_title, title, description, cta, badge e footer.',
    'Use <br> literal no title quando melhorar a leitura.',
    'Nao use markdown, nao inclua comentarios.',
    'Textos devem ser curtos para caber em safe zone de story/feed.',
    'Nao invente dados criticos como horario, preco, endereco ou condicao comercial.',
    'Se houver contexto da base do projeto, use somente o que estiver presente e relevante.',
    'Se o prompt do usuario conflitar com a base, priorize o pedido explicito do usuario.',
    '',
    'Contexto da marca:',
    `- Projeto: ${brandContext.projectName}`,
    `- Estilo: ${brandContext.brandStyleDescription || 'nao informado'}`,
    `- Segmento: ${brandContext.cuisineType || 'nao informado'}`,
    `- Instagram: ${brandContext.instagramUsername || 'nao informado'}`,
    `- Paleta: ${palette}`,
  ].join('\n')
}

function buildKnowledgePromptSection(knowledge: {
  context: string
  warnings: string[]
  conflicts: string[]
}): string {
  const knowledgeBlock = knowledge.context
    ? `BASE DE CONHECIMENTO DO PROJETO (use apenas quando relevante):\n${knowledge.context}`
    : 'BASE DE CONHECIMENTO DO PROJETO: nenhum contexto relevante encontrado.'

  const warningsBlock = knowledge.warnings.length > 0
    ? `\nAvisos internos:\n- ${knowledge.warnings.join('\n- ')}`
    : ''

  const conflictsBlock = knowledge.conflicts.length > 0
    ? `\nConflitos potenciais:\n- ${knowledge.conflicts.join('\n- ')}\nPriorize o pedido explicito do usuario e deixe os dados criticos revisaveis.`
    : ''

  return `${knowledgeBlock}${warningsBlock}${conflictsBlock}`
}

function buildImageAnalysisPromptSection(
  imageAnalysis: GenerateAiTextImageAnalysisPayload,
): string {
  if (!imageAnalysis.applied) {
    return 'ANALISE VISUAL: nao aplicada.'
  }

  const lines = [
    'ANALISE VISUAL DA IMAGEM (apoio, nunca sobrepor o prompt do usuario):',
    `- resumo: ${imageAnalysis.summary || 'sem resumo'}`,
    `- cena: ${imageAnalysis.sceneType || 'nao identificada'}`,
    `- confianca: ${imageAnalysis.confidence}`,
    `- candidatos: ${imageAnalysis.dishNameCandidates.join(', ') || 'nenhum'}`,
    `- ingredientes/pistas: ${imageAnalysis.ingredientsHints.join(', ') || 'nenhum'}`,
  ]

  if (imageAnalysis.matchedKnowledge) {
    lines.push(
      `- match confirmado na base: [${imageAnalysis.matchedKnowledge.category}] ${imageAnalysis.matchedKnowledge.title}`,
    )
    lines.push(`- motivo do match: ${imageAnalysis.matchedKnowledge.reason}`)
  } else {
    lines.push('- match confirmado na base: nenhum')
    lines.push(
      '- regra: se nao houver match confiavel, use apenas contexto visual generico sem inventar nome de prato.',
    )
  }

  if (imageAnalysis.warnings.length > 0) {
    lines.push(`- avisos: ${imageAnalysis.warnings.join(' | ')}`)
  }

  return lines.join('\n')
}

function buildUserPrompt(
  input: z.infer<typeof requestSchema>,
  templateGuidance: string,
  knowledge: {
    context: string
    warnings: string[]
    conflicts: string[]
  },
  imageAnalysis: GenerateAiTextImageAnalysisPayload,
): string {
  const templateSection = templateGuidance
    ? `\nGUIA DE TEMPLATES (OBRIGATORIO SEGUIR):\n${templateGuidance}\n`
    : ''
  const knowledgeSection = `\n${buildKnowledgePromptSection(knowledge)}\n`
  const imageAnalysisSection = `\n${buildImageAnalysisPromptSection(imageAnalysis)}\n`

  return [
    'Gerar variacoes de copy para arte no Instagram com base no prompt abaixo.',
    '',
    `Prompt base: "${input.prompt}"`,
    `Formato: ${input.format}`,
    `Quantidade de variacoes: ${input.variations}`,
    `Incluir logo: ${input.includeLogo ? 'sim' : 'nao'}`,
    `Usar foto: ${input.usePhoto ? 'sim' : 'nao'}`,
    `Composicao com IA: ${input.compositionEnabled ? 'sim' : 'nao'}`,
    `Prompt de composicao: ${input.compositionPrompt || ''}`,
    `Quantidade de referencias: ${input.compositionReferenceUrls?.length || 0}`,
    `Analise de imagem para contexto: ${input.analyzeImageForContext ? 'sim' : 'nao'}`,
    `Templates selecionados: ${input.templateIds?.length || 0}`,
    knowledgeSection,
    imageAnalysisSection,
    templateSection,
    '',
    'Regras obrigatorias:',
    '1. Preserve o sentido principal do prompt base.',
    '2. Gere exatamente o numero de variacoes solicitado.',
    '3. Nao invente telefone/endereco se nao houver no prompt ou na base: deixe footer_info_1 e footer_info_2 vazios.',
    '4. CTA deve ser objetivo e acionavel.',
    '5. Title deve ter ate 2 linhas logicas com <br> quando necessario.',
    '6. Respeite os slots, prioridade e densidade quando houver guia de template.',
    '7. As variacoes devem ser realmente diferentes entre si (angulo de copy, CTA e micro-enfase).',
    '8. Quando houver contexto de campanha, horario, cardapio ou diferencial, incorpore esse contexto naturalmente na copy.',
    '9. Em conflito entre prompt e base, priorize o prompt do usuario.',
    '10. So use nome especifico de prato quando houver match confiavel entre analise visual e base do projeto.',
    '11. Se a analise visual estiver com baixa confianca, mantenha a copy contextual e generica sem inventar item.',
  ].join('\n')
}

export async function POST(request: Request) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'Configuracao de IA incompleta (OpenAI)' },
      { status: 503 }
    )
  }

  let body: z.infer<typeof requestSchema>
  try {
    body = requestSchema.parse(await request.json())
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Erro ao processar requisicao' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(body.projectId)
  if (!project || !hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto nao encontrado' }, { status: 404 })
  }

  const [projectMeta, colors] = await Promise.all([
    db.project.findUnique({
      where: { id: body.projectId },
      select: {
        name: true,
        brandStyleDescription: true,
        cuisineType: true,
        instagramUsername: true,
        brandVisualElements: true,
      },
    }),
    db.brandColor.findMany({
      where: { projectId: body.projectId },
      select: { hexCode: true },
      orderBy: { createdAt: 'asc' },
      take: 6,
    }),
  ])

  const brandContext = {
    projectName: projectMeta?.name || 'Projeto',
    brandStyleDescription: projectMeta?.brandStyleDescription || '',
    cuisineType: projectMeta?.cuisineType || '',
    instagramUsername: projectMeta?.instagramUsername || '',
    colorPalette: colors.map((item) => item.hexCode),
  }
  const allTemplates = (((projectMeta?.brandVisualElements as Record<string, unknown> | null)?.artTemplates ?? []) as Array<Record<string, unknown>>)
  const selectedTemplates: TemplateSummary[] = (body.templateIds ?? [])
    .map((templateId) => {
      const fromProject = allTemplates.find((template) => template.id === templateId)
      if (fromProject) {
        return {
          id: toText(fromProject.id),
          name: toText(fromProject.name) || 'Template',
          format: toText(fromProject.format) || body.format,
          templateData: (fromProject.templateData ?? {}) as Record<string, unknown>,
        } satisfies TemplateSummary
      }

      const preset = getInstagramTemplatePreset(templateId, body.format)
      if (!preset) return null
      return {
        id: preset.id,
        name: preset.name,
        format: preset.format,
        templateData: (preset.templateData ?? {}) as Record<string, unknown>,
      } satisfies TemplateSummary
    })
    .filter((template): template is TemplateSummary => Boolean(template))
  const templateGuidance = buildTemplateGuidance(selectedTemplates)
  const knowledgeContext = await getProjectPromptKnowledgeContext(
    body.prompt,
    { projectId: body.projectId },
    { topKPerCategory: 2, maxTokens: 1200, minScore: 0.6 },
  )
  const sourceImageUrl =
    body.analysisImageUrl ||
    body.photoUrl ||
    body.compositionReferenceUrls?.[0]
  const visualWarnings: string[] = []
  let visualAnalysis: ImageContextModelOutput | null = null
  let focusedVisualHits: VisualKnowledgeHit[] = []

  if (body.analyzeImageForContext) {
    if (!sourceImageUrl) {
      visualWarnings.push('Analise de imagem ativada, mas nenhuma imagem-base foi encontrada no fluxo.')
    } else if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      visualWarnings.push('Analise visual indisponivel no ambiente atual; fluxo segue sem enriquecimento por imagem.')
    } else {
      try {
        visualAnalysis = await analyzeImageContext(body.prompt, sourceImageUrl)
        const focusedKnowledge = await getFocusedVisualKnowledge(
          body.projectId,
          body.prompt,
          visualAnalysis,
        )
        focusedVisualHits = focusedKnowledge.hits
        visualWarnings.push(...focusedKnowledge.warnings)
      } catch (error) {
        console.warn('[generate-ai-text] Analise visual opcional falhou:', error)
        visualWarnings.push(
          error instanceof Error
            ? `Analise visual nao aplicada: ${error.message}`
            : 'Analise visual nao aplicada nesta solicitacao.',
        )
      }
    }
  }

  const imageAnalysisPayload = buildImageAnalysisPayload(
    body.analyzeImageForContext,
    sourceImageUrl,
    visualAnalysis,
    focusedVisualHits,
    visualWarnings,
    body.prompt,
  )
  const knowledgePayload: GenerateAiTextKnowledgePayload = {
    applied: knowledgeContext.hits.length > 0,
    context: knowledgeContext.context,
    categoriesUsed: Array.from(
      new Set([
        ...knowledgeContext.categoriesUsed,
        ...focusedVisualHits.map((hit) => hit.category),
      ]),
    ),
    hits: mergeKnowledgeHits(knowledgeContext.hits.map((hit) => ({
      entryId: hit.entryId,
      title: hit.title,
      category: hit.category,
      content: hit.content,
      score: Number(hit.score.toFixed(4)),
      source: hit.source,
    })), focusedVisualHits),
  }
  knowledgePayload.applied = knowledgePayload.hits.length > 0

  if (body.dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      format: body.format,
      variations: body.variations,
      templatesRequested: body.templateIds ?? [],
      templatesResolved: selectedTemplates.map((template) => ({
        id: template.id,
        name: template.name,
        format: template.format,
      })),
      knowledge: knowledgePayload,
      imageAnalysis: imageAnalysisPayload,
      warnings: dedupeStrings([...knowledgeContext.warnings, ...imageAnalysisPayload.warnings], 10),
      conflicts: knowledgeContext.conflicts,
    })
  }

  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: responseSchema,
      system: buildSystemPrompt(brandContext),
      prompt: buildUserPrompt(body, templateGuidance, knowledgeContext, imageAnalysisPayload),
      temperature: 0.6,
      maxOutputTokens: 900,
    })

    const variacoes = ensureVariationCount(
      object.variacoes,
      body.variations,
      body.prompt,
    )

    return NextResponse.json({
      variacoes,
      knowledge: knowledgePayload,
      imageAnalysis: imageAnalysisPayload,
      warnings: dedupeStrings([...knowledgeContext.warnings, ...imageAnalysisPayload.warnings], 10),
      conflicts: knowledgeContext.conflicts,
    })
  } catch (error) {
    console.error('[generate-ai-text] Error:', error)

    const variacoes = ensureVariationCount(undefined, body.variations, body.prompt)
    return NextResponse.json({
      variacoes,
      knowledge: knowledgePayload,
      imageAnalysis: imageAnalysisPayload,
      warnings: [
        ...dedupeStrings([...knowledgeContext.warnings, ...imageAnalysisPayload.warnings], 10),
        'Falha ao gerar copy estruturada com IA; fallback local aplicado.',
      ],
      conflicts: knowledgeContext.conflicts,
    })
  }
}
