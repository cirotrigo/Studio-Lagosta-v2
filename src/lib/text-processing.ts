import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { LRUCache } from 'lru-cache'
import { createHash } from 'crypto'

// --- Types ---

export type TextProcessingMode = 'faithful' | 'grammar_correct' | 'headline_detection' | 'generate_copy'

export interface TextProcessingConfig {
  mode: TextProcessingMode
  enableHeadlineDetection?: boolean
  enablePromoDetection?: boolean
  customPrompt?: string
}

// Tagged union for bifurcation in pipeline
export type TextProcessingResult =
  | { classified: false; text: string }
  | { classified: true; slots: Record<string, string> }

// --- Cache ---

const textProcessingCache = new LRUCache<string, TextProcessingResult>({
  max: 1000,
  ttl: 1000 * 60 * 60, // 1 hour
})

function getCacheKey(text: string, mode: string, config?: TextProcessingConfig): string {
  const flags = `${config?.enableHeadlineDetection ?? false}|${config?.enablePromoDetection ?? false}`
  return createHash('sha256')
    .update(`${text}|${mode}|${config?.customPrompt ?? ''}|${flags}`)
    .digest('hex')
}

// --- Mode Implementations ---

function applyFaithful(text: string): TextProcessingResult {
  // Normalize whitespace only
  const normalized = text.trim().replace(/\s+/g, ' ')
  return { classified: false, text: normalized }
}

async function applyGrammarCorrect(text: string): Promise<TextProcessingResult> {
  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: z.object({
      correctedText: z.string(),
    }),
    prompt: `Corrija apenas ortografia, pontuacao e gramatica do texto abaixo. NAO altere significado, NAO torne mais longo, NAO reescreva estilo. Retorne o texto corrigido.

Texto: "${text}"`,
    temperature: 0.1,
  })

  // Truncate if GPT returns something too long
  const result = object.correctedText.length > 500
    ? object.correctedText.substring(0, 500)
    : object.correctedText

  return { classified: false, text: result }
}

async function applyHeadlineDetection(
  text: string,
  slotNames?: string[],
): Promise<TextProcessingResult> {
  // Build dynamic schema from template slot names if available
  const names = slotNames ?? ['eyebrow', 'title', 'description', 'cta', 'footer']
  const schemaShape: Record<string, z.ZodTypeAny> = {}
  for (const name of names) {
    schemaShape[name] = z.string().optional()
  }
  const schema = z.object(schemaShape)

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema,
    prompt: `Analise o texto abaixo e identifique as partes que correspondem a cada slot.
Slots disponiveis: ${names.join(', ')}.

Regras:
- headline principal → title
- frase promocional curta → eyebrow (se disponivel)
- texto descritivo → description (se disponivel)
- chamada para acao → cta (se disponivel)
- informacoes de localizacao/contato → footer (se disponivel)
- NAO reescreva o texto, apenas separe nas categorias
- Slots nao reconhecidos podem ficar vazios

Texto: "${text}"`,
    temperature: 0.2,
  })

  // Filter out empty slots
  const slots: Record<string, string> = {}
  for (const [key, value] of Object.entries(object)) {
    if (typeof value === 'string' && value.trim()) {
      slots[key] = value.trim()
    }
  }

  // Fallback: if no slots recognized, return unclassified
  if (Object.keys(slots).length === 0) {
    return { classified: false, text }
  }

  return { classified: true, slots }
}

async function applyGenerateCopy(
  customPrompt: string,
  slotNames?: string[],
): Promise<TextProcessingResult> {
  const names = slotNames ?? ['eyebrow', 'title', 'description', 'cta', 'footer']
  const schemaShape: Record<string, z.ZodTypeAny> = {}
  for (const name of names) {
    // title is required, others optional
    schemaShape[name] = name === 'title'
      ? z.string().describe(`Texto para o slot ${name}`)
      : z.string().optional().describe(`Texto para o slot ${name}`)
  }
  const schema = z.object(schemaShape)

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema,
    prompt: `Crie copy curta para Instagram baseada no brief abaixo.
Estruture o texto nos slots: ${names.join(', ')}.
Tom publicitario e conciso. Cada slot deve ser curto (max 6-8 palavras para title, 3-4 palavras para cta).

Brief: "${customPrompt}"`,
    temperature: 0.7,
  })

  const slots: Record<string, string> = {}
  for (const [key, value] of Object.entries(object)) {
    if (typeof value === 'string' && value.trim()) {
      slots[key] = value.trim()
    }
  }

  return { classified: true, slots }
}

// --- Main Export ---

/**
 * Process text according to the selected mode before slot classification.
 *
 * @param text - User input text (can be empty for generate_copy mode)
 * @param config - Processing configuration (mode, customPrompt, flags)
 * @param templateSlotNames - Optional array of slot names from template.content_slots keys
 * @returns TextProcessingResult - either { classified: false, text } or { classified: true, slots }
 */
export async function processTextForTemplate(
  text: string,
  config: TextProcessingConfig,
  templateSlotNames?: string[],
): Promise<TextProcessingResult> {
  const { mode } = config

  // Mode 1: faithful — no LLM, no cache needed
  if (mode === 'faithful') {
    return applyFaithful(text)
  }

  // Check cache for LLM-dependent modes
  const cacheKey = getCacheKey(text, mode, config)
  const cached = textProcessingCache.get(cacheKey)
  if (cached) {
    console.log(`[text-processing] Cache hit for mode=${mode}`)
    return cached
  }

  let result: TextProcessingResult

  switch (mode) {
    case 'grammar_correct':
      result = await applyGrammarCorrect(text)
      break
    case 'headline_detection':
      result = await applyHeadlineDetection(text, templateSlotNames)
      break
    case 'generate_copy':
      if (!config.customPrompt) {
        throw new Error('customPrompt is required for generate_copy mode')
      }
      result = await applyGenerateCopy(config.customPrompt, templateSlotNames)
      break
    default:
      throw new Error(`Unknown text processing mode: ${mode}`)
  }

  // Cache the result
  textProcessingCache.set(cacheKey, result)

  return result
}
