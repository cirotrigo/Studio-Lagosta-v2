/**
 * Verificação de texto pós-melhoria.
 *
 * A melhoria com IA redesenha cada letra da arte — e, aplicada a um post
 * APROVADO, vai ao ar sem re-revisão humana. Erro de grafia em preço, horário
 * ou nome próprio é o modo de falha nº 1 do gpt-image. Este módulo fecha o
 * ciclo: extrai os textos que a arte DEVERIA ter (da Generation original),
 * lê os textos que a arte gerada REALMENTE tem (modelo de visão) e compara.
 *
 * Sem texto esperado (arte de upload externo, export do editor) não há o que
 * comparar — a verificação é PULADA, nunca inventada.
 */

import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { db } from '@/lib/db'

/** Modelo de visão barato para transcrição — não precisa de raciocínio. */
const VISION_MODEL = 'gpt-4o-mini'

/** Profundidade máxima ao subir a cadeia de re-melhorias atrás dos textos. */
const MAX_LINEAGE_DEPTH = 5

export interface TextCheckResult {
  passed: boolean
  /** Textos esperados que não foram encontrados na arte gerada (normalizados). */
  missing: string[]
  /** Transcrição crua devolvida pelo modelo de visão, para auditoria. */
  extracted: string[]
}

/**
 * Normalização de comparação: uppercase, sem acento, espaços colapsados,
 * aspas/traços tipográficos reduzidos ao ASCII. Pontuação é MANTIDA — preço
 * ("R$ 49,90") é exatamente o caso que não pode passar com vírgula perdida.
 */
export function normalizeForComparison(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function isTextValue(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/^(https?:\/\/|data:|blob:)/i.test(trimmed)) return false
  if (trimmed.length > 400) return false
  return true
}

function collectFromRecord(record: Record<string, unknown>): string[] {
  const texts: string[] = []
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('_')) continue // _driveImageId / _imageUrl são reservados
    if (typeof value === 'string') {
      if (isTextValue(value)) texts.push(value.trim())
    } else if (value && typeof value === 'object') {
      const content = (value as Record<string, unknown>).content
      if (typeof content === 'string' && isTextValue(content)) texts.push(content.trim())
    }
  }
  return texts
}

/**
 * Extrai os textos esperados do `fieldValues` de uma Generation.
 * Formas conhecidas: `slotValues` (arte-rápida/MCP) e `texts` (gerar-criativo).
 * Qualquer outra forma (konva_editor, upload) devolve vazio → verificação pulada.
 */
export function extractExpectedTexts(fieldValues: unknown): string[] {
  if (!fieldValues || typeof fieldValues !== 'object') return []
  const fv = fieldValues as Record<string, unknown>

  const source =
    (fv.slotValues && typeof fv.slotValues === 'object'
      ? (fv.slotValues as Record<string, unknown>)
      : null) ??
    (fv.texts && typeof fv.texts === 'object' ? (fv.texts as Record<string, unknown>) : null)

  if (!source) return []
  return Array.from(new Set(collectFromRecord(source)))
}

/**
 * Carrega os textos esperados de uma Generation, subindo a cadeia de
 * melhorias (`fieldValues.originalGenerationId`) quando a própria Generation
 * é uma melhoria — o texto "de verdade" mora na Generation raiz.
 */
export async function loadExpectedTextsForGeneration(generationId: string): Promise<string[]> {
  let currentId: string | null = generationId
  for (let depth = 0; depth < MAX_LINEAGE_DEPTH && currentId; depth++) {
    const gen: { fieldValues: unknown } | null = await db.generation.findUnique({
      where: { id: currentId },
      select: { fieldValues: true },
    })
    if (!gen) return []

    const texts = extractExpectedTexts(gen.fieldValues)
    if (texts.length > 0) return texts

    const fv = (gen.fieldValues ?? {}) as Record<string, unknown>
    currentId =
      fv.source === 'ai_improvement' && typeof fv.originalGenerationId === 'string'
        ? fv.originalGenerationId
        : null
  }
  return []
}

const transcriptionSchema = z.object({
  texts: z
    .array(z.string())
    .describe('Cada bloco de texto visível na imagem, transcrito letra por letra'),
})

/**
 * Transcreve os textos da arte gerada com um modelo de visão e compara com os
 * esperados (cada esperado precisa aparecer como substring, normalizado).
 *
 * Erro na chamada de visão PROPAGA — o chamador decide o que fazer (hoje:
 * registra `textCheck: 'skipped'` e segue, porque indisponibilidade do
 * verificador não pode derrubar a melhoria inteira).
 */
export async function verifyImageTexts(
  imageBuffer: Buffer,
  expectedTexts: string[],
): Promise<TextCheckResult> {
  const { object } = await generateObject({
    model: openai(VISION_MODEL),
    temperature: 0,
    maxOutputTokens: 1000,
    abortSignal: AbortSignal.timeout(60_000),
    schema: transcriptionSchema,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', image: imageBuffer },
          {
            type: 'text',
            text: [
              'Transcreva TODOS os textos visíveis nesta arte de Instagram, letra por letra.',
              'Inclua números, preços, pontuação e símbolos exatamente como aparecem.',
              'Um item do array por bloco de texto. Não corrija erros de grafia — transcreva o que está escrito.',
            ].join('\n'),
          },
        ],
      },
    ],
  })

  const extracted = object.texts.map((t) => t.trim()).filter(Boolean)
  const haystack = normalizeForComparison(extracted.join('\n'))

  const missing = expectedTexts
    .map((t) => normalizeForComparison(t))
    .filter((needle) => needle.length > 0 && !haystack.includes(needle))

  return { passed: missing.length === 0, missing, extracted }
}
