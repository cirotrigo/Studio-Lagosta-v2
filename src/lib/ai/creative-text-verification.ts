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
  /**
   * Blocos da arte gerada que NÃO estão na régua — a metade que faltava.
   * `comDado` é o caso "endereço de outro estado"; `semDado` é decoração.
   * Aviso, nunca reprovação (Ciro, 01/09/2026). Ver `blocosAMais`.
   */
  blocosAMais: { comDado: string[]; semDado: string[] }
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
export { normalizeForComparison, textosVazadosDoModelo, blocosAMais, descontarTextosDaOrigem } from './text-comparison'
import { normalizeForComparison, textosVazadosDoModelo, blocosAMais, descontarTextosDaOrigem } from './text-comparison'

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
    /**
     * 🔴 ARRAY DE STRINGS também conta. Até 01/09/2026 só o formato RECORD
     * era lido (`!Array.isArray` excluía o resto), e a lista simples — que é
     * a forma natural de "os textos desta arte" e a que `importarArte` grava
     * — era ignorada EM SILÊNCIO. O backfill da copy do canvas gravou 54
     * artes em array e nenhuma virou régua; o defeito só apareceu porque a
     * conferência foi feita depois de gravar.
     */
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && isTextValue(item)) texts.push(item.trim())
      }
      continue
    }
    if (value && typeof value === 'object') {
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
/**
 * Sobe a linhagem até achar a copy VERDADEIRA — a da arte original.
 *
 * 🔴 Melhorar uma melhoria é o caso comum (o Ciro encadeou quatro em
 * 01/09/2026), e cada elo da cadeia é uma Generation nova cuja origem é a
 * anterior. Perguntar os textos só à origem IMEDIATA falha de duas formas:
 *
 * 1. A origem imediata pode não ter texto gravado (toda melhoria anterior ao
 *    conserto de hoje nasceu assim), e aí a régua some.
 * 2. Pior: a origem imediata pode ter texto ERRADO. Medido nesta cadeia — a
 *    arte do canvas dizia "Rua Eugênio Netto, 82, Praia do Canto, Vitória" e
 *    o quarto elo já dizia "Rua Gomes de Carvalho, 1640 · Vila Olímpia · São
 *    Paulo". Transcrever esse elo por visão CONGELARIA o endereço inventado.
 *
 * A copy verdadeira está na RAIZ (a arte que veio do canvas ou do upload, com
 * `textos` gravados por `importarArte`). Subir até ela é o que faz a régua
 * corrigir a cadeia em vez de perpetuá-la.
 *
 * Teto de 8 saltos: linhagem é curta na prática e o teto protege de ciclo,
 * que `sourceGenerationId` não impede (não tem FK, por decisão da casa).
 */
export async function loadExpectedTextsDaLinhagem(generationId: string): Promise<{
  textos: string[]
  /** Quantos saltos até achar. 0 = a própria origem tinha. */
  saltos: number
  /** A raiz declarou não ter texto (capa de carrossel). */
  semTexto: boolean
}> {
  const { db } = await import('@/lib/db')
  let id: string | null = generationId
  for (let saltos = 0; saltos < 8 && id; saltos++) {
    const g: { fieldValues: unknown; sourceGenerationId: string | null } | null =
      await db.generation.findUnique({
        where: { id },
        select: { fieldValues: true, sourceGenerationId: true },
      })
    if (!g) break
    const fv = (g.fieldValues ?? {}) as Record<string, unknown>
    if (fv.semTexto === true) return { textos: [], saltos, semTexto: true }
    const textos = extractExpectedTexts(g.fieldValues)
    if (textos.length > 0) return { textos, saltos, semTexto: false }
    id = g.sourceGenerationId
  }
  return { textos: [], saltos: 0, semTexto: false }
}

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
/**
 * Lê os textos de uma arte por visão — a régua, quando o banco não tem uma.
 *
 * 🔴 Existe por um defeito medido em 01/09/2026: arte vinda do canvas ou de
 * upload (`source: 'arte-enviada'`) não tem `slotValues`, então
 * `loadExpectedTextsForGeneration` devolve `[]`, a seção `[TEXTO EXATO —
 * VERBATIM]` some do prompt e a conferência sai `skipped`. Sem régua, o
 * modelo LÊ o horário e o endereço da própria imagem e completa o que não
 * entende: três rodadas seguidas inventaram endereço em Foz do Iguaçu, São
 * José dos Pinhais e Jaraguá do Sul, para um cliente de Vitória.
 *
 * Transcrever a arte de ORIGEM resolve os dois lados: o texto verdadeiro vira
 * instrução verbatim no prompt E passa a existir régua para a conferência.
 * Custa uma chamada de visão (gpt-4o-mini) por melhoria.
 *
 * Falhar aqui NUNCA derruba a melhoria — devolve `[]`, que é o comportamento
 * de antes desta função existir.
 */
export async function transcreverTextosDaArte(imageBuffer: Buffer): Promise<string[]> {
  try {
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
                'Inclua números, horários, endereços e pontuação exatamente como aparecem.',
                'Um item do array por bloco de texto. Não corrija erros de grafia.',
                'Se um trecho estiver ilegível, NÃO o inclua — é melhor faltar do que adivinhar.',
              ].join('\n'),
            },
          ],
        },
      ],
    })
    return object.texts.map((t) => t.trim()).filter(Boolean)
  } catch (erro) {
    console.warn('[transcrever] visão indisponível — seguindo sem régua de texto:', erro)
    return []
  }
}

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
  /**
   * A arte de ORIGEM da melhoria: é transcrita só quando sobrou texto a mais,
   * para descontar o que já estava nela (print, mockup, cardápio na foto).
   * Ausente (geração do zero), nada é descontado.
   */
  origemBuffer?: Buffer | null,
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

  let aMais = blocosAMais(extracted, expectedTexts, nomeDaMarca)
  let numerosForaDaCopy = numerosSemLastro(extracted, expectedTexts)
  if (origemBuffer && (aMais.comDado.length > 0 || aMais.semDado.length > 0 || numerosForaDaCopy.length > 0)) {
    // Uma chamada de visão a mais, só quando há o que descontar.
    const daOrigem = await transcreverTextosDaArte(origemBuffer)
    if (daOrigem.length > 0) {
      aMais = descontarTextosDaOrigem(aMais, daOrigem)
      numerosForaDaCopy = numerosSemLastro(extracted, [...expectedTexts, ...daOrigem])
    }
  }

  return {
    passed: missing.length === 0,
    missing,
    extracted,
    // Fora do `passed` de propósito — ver a nota em TextCheckResult.
    numerosNaoEsperados: numerosForaDaCopy,
    textosVazados: textosVazadosDoModelo(extracted, expectedTexts, textosDoModelo, nomeDaMarca),
    blocosAMais: aMais,
  }
}
