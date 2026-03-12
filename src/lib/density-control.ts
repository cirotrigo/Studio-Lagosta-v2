import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

// --- Types ---

export interface DensityResult {
  slots: Record<string, string>
  totalWords: number
  textCompressed: boolean
  droppedSlots: string[]
}

interface DensityConfig {
  ideal_words: number
  max_words: number
}

interface TemplateData {
  text_density: DensityConfig
  slot_drop_order?: string[]
  slot_priority?: string[]
  content_slots: Record<string, { type: string }>
  default_content?: Record<string, string>
}

// --- Helpers ---

/**
 * Normalize words for accurate counting.
 * Splits hyphens, slashes, removes loose punctuation.
 */
export function normalizeWords(text: string): string[] {
  return text
    .replace(/-/g, ' ')   // hyphens → spaces
    .replace(/\//g, ' ')  // slashes → spaces
    .replace(/[^\w\sÀ-ÿ]/g, '') // remove punctuation (keep accented chars)
    .split(/\s+/)
    .filter(w => w.length > 0)
}

function countWords(slots: Record<string, string>): number {
  const allText = Object.values(slots).join(' ')
  return normalizeWords(allText).length
}

/**
 * Compress text via LLM to fit within word budget.
 */
async function compressText(
  slots: Record<string, string>,
  idealWords: number,
): Promise<Record<string, string>> {
  const slotNames = Object.keys(slots)
  const schemaShape: Record<string, z.ZodTypeAny> = {}
  for (const name of slotNames) {
    schemaShape[name] = z.string().describe(`Texto comprimido para ${name}`)
  }

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: z.object(schemaShape),
    prompt: `Reduza o texto mantendo o sentido. Maximo de ${idealWords} palavras TOTAL entre todos os slots. Nao mude o tom publicitario.

Slots atuais:
${Object.entries(slots).map(([k, v]) => `- ${k}: "${v}"`).join('\n')}`,
    temperature: 0.3,
  })

  const compressed: Record<string, string> = {}
  for (const [key, value] of Object.entries(object)) {
    if (typeof value === 'string' && value.trim()) {
      compressed[key] = value.trim()
    }
  }
  return compressed
}

// --- Main Export ---

/**
 * Check text density against template limits and compress/drop if necessary.
 *
 * Pipeline position: AFTER slot classification, BEFORE layout engine.
 * This is the ONLY module that may call LLM after classification (via compressText).
 */
export async function densityCheckAndMaybeCompress(
  slots: Record<string, string>,
  templateData: TemplateData,
  strictMode: boolean,
): Promise<DensityResult> {
  const densityConfig = templateData.text_density
  const droppedSlots: string[] = []

  // Apply default_content for empty slots BEFORE density check
  const filledSlots = { ...slots }
  if (templateData.default_content) {
    for (const slotName of Object.keys(templateData.content_slots)) {
      if (!filledSlots[slotName] || filledSlots[slotName].trim() === '') {
        const defaultValue = templateData.default_content[slotName]
        if (defaultValue) {
          filledSlots[slotName] = defaultValue
        }
      }
    }
  }

  // Remove truly empty slots (no text and no default)
  const activeSlots: Record<string, string> = {}
  for (const [key, value] of Object.entries(filledSlots)) {
    if (value && value.trim()) {
      activeSlots[key] = value
    }
  }

  let totalWords = countWords(activeSlots)

  // Case 1: Within ideal — no action needed
  if (totalWords <= densityConfig.ideal_words) {
    return {
      slots: activeSlots,
      totalWords,
      textCompressed: false,
      droppedSlots: [],
    }
  }

  // Case 2: Between ideal and max — warning only
  if (totalWords <= densityConfig.max_words) {
    console.log(`[density-control] Warning: ${totalWords} words (ideal: ${densityConfig.ideal_words}, max: ${densityConfig.max_words})`)
    return {
      slots: activeSlots,
      totalWords,
      textCompressed: false,
      droppedSlots: [],
    }
  }

  // Case 3: Over max_words
  if (strictMode) {
    throw new TextOverflowError(
      `Texto excede limite de ${densityConfig.max_words} palavras (${totalWords} palavras). Reduza o texto ou desative modo estrito.`
    )
  }

  // Try dropping slots first (slot_drop_order)
  const dropOrder = templateData.slot_drop_order
    ?? (templateData.slot_priority ? [...templateData.slot_priority].reverse() : [])

  const workingSlots = { ...activeSlots }

  for (const slotName of dropOrder) {
    if (totalWords <= densityConfig.max_words) break
    if (workingSlots[slotName]) {
      droppedSlots.push(slotName)
      delete workingSlots[slotName]
      totalWords = countWords(workingSlots)
    }
  }

  // If still over max after dropping, compress via LLM
  if (totalWords > densityConfig.max_words) {
    const compressed = await compressText(workingSlots, densityConfig.ideal_words)
    const compressedWords = countWords(compressed)
    return {
      slots: compressed,
      totalWords: compressedWords,
      textCompressed: true,
      droppedSlots,
    }
  }

  return {
    slots: workingSlots,
    totalWords,
    textCompressed: false,
    droppedSlots,
  }
}

// --- Custom Errors ---

export class TextOverflowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TextOverflowError'
  }
}
