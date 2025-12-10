import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { KnowledgeCategory } from '@prisma/client'

const ExtractionSchema = z.object({
  title: z.string().max(120),
  content: z.string(),
  tags: z.array(z.string()).min(1).max(10),
  metadata: z.record(z.any()).nullable().optional(),
})

export type ExtractedKnowledgeData = z.infer<typeof ExtractionSchema>

const EXTRACTION_PROMPT = `
Extraia informações estruturadas do texto fornecido sobre um restaurante.

DIRETRIZES:
- title: Resumo descritivo (máx. 60 caracteres)
- content: Texto bem formatado, completo e claro
- tags: 3-5 palavras-chave (lowercase, sem acentos)
- metadata: Dados estruturados em JSON (horários, preços, etc.)

CATEGORIA: {category}

TEXTO:
{userInput}
`.trim()

export async function extractKnowledgeData(
  text: string,
  category: KnowledgeCategory
): Promise<ExtractedKnowledgeData> {
  const input = text.trim()

  const { object } = await generateObject({
    model: openai(process.env.CLASSIFICATION_MODEL || 'gpt-4o'),
    schema: ExtractionSchema,
    prompt: EXTRACTION_PROMPT.replace('{userInput}', input).replace('{category}', category),
  })

  return object
}
