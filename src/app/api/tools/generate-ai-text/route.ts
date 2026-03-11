import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { getInstagramTemplatePreset } from '@/lib/instagram-template-presets'
import { getProjectPromptKnowledgeContext } from '@/lib/knowledge/search'

export const runtime = 'nodejs'
export const maxDuration = 45

type VariationCount = 1 | 2 | 4

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

type Variation = z.infer<typeof variationSchema>

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

function buildUserPrompt(
  input: z.infer<typeof requestSchema>,
  templateGuidance: string,
  knowledge: {
    context: string
    warnings: string[]
    conflicts: string[]
  },
): string {
  const templateSection = templateGuidance
    ? `\nGUIA DE TEMPLATES (OBRIGATORIO SEGUIR):\n${templateGuidance}\n`
    : ''
  const knowledgeSection = `\n${buildKnowledgePromptSection(knowledge)}\n`

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
    `Templates selecionados: ${input.templateIds?.length || 0}`,
    knowledgeSection,
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
  const knowledgePayload: GenerateAiTextKnowledgePayload = {
    applied: knowledgeContext.hits.length > 0,
    context: knowledgeContext.context,
    categoriesUsed: knowledgeContext.categoriesUsed,
    hits: knowledgeContext.hits.map((hit) => ({
      entryId: hit.entryId,
      title: hit.title,
      category: hit.category,
      content: hit.content,
      score: Number(hit.score.toFixed(4)),
      source: hit.source,
    })),
  }

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
      warnings: knowledgeContext.warnings,
      conflicts: knowledgeContext.conflicts,
    })
  }

  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: responseSchema,
      system: buildSystemPrompt(brandContext),
      prompt: buildUserPrompt(body, templateGuidance, knowledgeContext),
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
      warnings: knowledgeContext.warnings,
      conflicts: knowledgeContext.conflicts,
    })
  } catch (error) {
    console.error('[generate-ai-text] Error:', error)

    const variacoes = ensureVariationCount(undefined, body.variations, body.prompt)
    return NextResponse.json({
      variacoes,
      knowledge: knowledgePayload,
      warnings: [
        ...knowledgeContext.warnings,
        'Falha ao gerar copy estruturada com IA; fallback local aplicado.',
      ],
      conflicts: knowledgeContext.conflicts,
    })
  }
}
