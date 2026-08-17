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
  /**
   * Números que aparecem na arte e NÃO estão em nenhum texto esperado.
   *
   * 🔴 Existe porque `passed` respondia a pergunta errada. Ele confere se o
   * texto esperado ESTÁ presente e nunca teve regra contra texto A MAIS — e o
   * que o modelo acrescenta por conta própria costuma ser DADO: medido em
   * 12/08/2026, contagem de avaliação do Google fabricada em 2 de 3 peças no
   * tier `low` e 1 de 3 no `medium` ("5,0 de 1,2 mil avaliações"), todas com
   * veredito verde. É afirmação factual e verificável sobre o negócio do
   * cliente, a mesma classe de "nunca invente preço, horário, endereço ou
   * promoção".
   *
   * ⚠️ É AVISO, nunca reprovação — não entra em `passed`. Número real pode
   * estar na cena (rótulo de garrafa, placa no fundo, número da casa), e
   * reprovar por isso ensinaria a ignorar o alerta, que é o defeito que
   * derrubou a revisão visual em 10/08.
   */
  numerosNaoEsperados: string[]
  /**
   * Frases da arte de REFERÊNCIA que reapareceram nesta peça sem estar na copy.
   * Vazio quando não havia modelo decodificado para comparar — ver
   * `textosVazadosDoModelo`. Também é aviso, nunca reprovação.
   */
  textosVazados: string[]
}

/** Sequências de dígitos de um texto, sem separador — "R$ 1.384,00" → "138400". */
function digitosDe(texto: string): string[] {
  return (texto.match(/\d[\d.,\s]*/g) ?? [])
    .map((t) => t.replace(/\D/g, ''))
    .filter((d) => d.length > 0)
}

/**
 * Números da transcrição que não têm lastro na copy esperada.
 *
 * A comparação é por CONTINÊNCIA nos dois sentidos: "1984" casa com "desde
 * 1984", e "5" casa com "5,0". Ficar mais rígido transformaria formatação
 * ("R$ 9,90" vs "R$9,90") em alarme falso — o mesmo defeito que já derrubou a
 * confiança no comparador de texto uma vez.
 */
export function numerosSemLastro(extracted: string[], expectedTexts: string[]): string[] {
  const esperados = expectedTexts.flatMap(digitosDe)
  const vistos = new Set<string>()
  const fora: string[] = []
  for (const bloco of extracted) {
    for (const d of digitosDe(bloco)) {
      if (vistos.has(d)) continue
      vistos.add(d)
      const temLastro = esperados.some((e) => e.includes(d) || d.includes(e))
      if (!temLastro) fora.push(d)
    }
  }
  return fora
}

/**
 * `normalizeForComparison` e `textosVazadosDoModelo` moram em
 * `text-comparison.ts` — módulo puro, para que o diff de copy do aprendizado e
 * a conferência de vazamento usem as MESMAS regras de "o que conta como o mesmo
 * texto" sem arrastar Prisma e o SDK de IA para dentro de um teste unitário
 * (`@/lib/db` lança no import quando falta `DATABASE_URL`). Seguem exportadas
 * daqui.
 */
export { normalizeForComparison, textosVazadosDoModelo } from './text-comparison'
import { normalizeForComparison, textosVazadosDoModelo } from './text-comparison'

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
 * Formas conhecidas: `slotValues` (arte-rápida/MCP/ajuste), `texts`
 * (gerar-criativo), `textos` (arte-livre por combinação) e `textosLivres`
 * (arte-livre com blocos posicionados). Qualquer outra forma (konva_editor,
 * upload) devolve vazio → verificação pulada.
 */
export function extractExpectedTexts(fieldValues: unknown): string[] {
  if (!fieldValues || typeof fieldValues !== 'object') return []
  const fv = fieldValues as Record<string, unknown>

  const texts: string[] = []

  for (const key of ['slotValues', 'texts', 'textos'] as const) {
    const value = fv[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      texts.push(...collectFromRecord(value as Record<string, unknown>))
    }
  }

  if (Array.isArray(fv.textosLivres)) {
    for (const bloco of fv.textosLivres) {
      const texto = (bloco as Record<string, unknown> | null)?.texto
      if (typeof texto === 'string' && isTextValue(texto)) texts.push(texto.trim())
    }
  }

  return Array.from(new Set(texts))
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
  /**
   * Textos lidos na arte de referência (`GuiaLido.textos`), quando houve uma.
   * Opcional de propósito: quem não tem modelo — melhoria, MCP, medição —
   * chama como sempre chamou e recebe `textosVazados: []`.
   */
  textosDoModelo: string[] = [],
  /** Nome da marca — a assinatura não conta como vazamento. */
  nomeDaMarca?: string | null,
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

  return {
    passed: missing.length === 0,
    missing,
    extracted,
    // Fora do `passed` de propósito — ver a nota em TextCheckResult.
    numerosNaoEsperados: numerosSemLastro(extracted, expectedTexts),
    textosVazados: textosVazadosDoModelo(extracted, expectedTexts, textosDoModelo, nomeDaMarca),
  }
}
