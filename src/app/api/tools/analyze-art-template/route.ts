import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import sharp from 'sharp'
import { normalizeTemplate, TemplateValidationError } from '@/lib/template-normalize'
import { createHash } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 120

// --- Zod Schema ---

const analyzeSchema = z.object({
  projectId: z.number().int().positive(),
  imageUrl: z.string().url(),
  format: z.enum(['FEED_PORTRAIT', 'STORY', 'SQUARE']),
  templateName: z.string().min(1).max(100),
})

const FORMAT_INFO: Record<string, { width: number; height: number; label: string }> = {
  FEED_PORTRAIT: { width: 1080, height: 1350, label: 'feed retrato (1080x1350)' },
  STORY: { width: 1080, height: 1920, label: 'story vertical (1080x1920)' },
  SQUARE: { width: 1080, height: 1080, label: 'quadrado (1080x1080)' },
}

// --- Vision Prompt (A2) ---

function buildVisionPrompt(format: string, width: number, height: number): string {
  return `Voce e um analista de design de artes para Instagram.
Analise esta imagem de referencia e extraia a estrutura de layout como JSON.

FORMATO DA ARTE: ${format} (${width}x${height})

EXTRAIA:

1. canvas:
   - safe_margin em pixels (distancia do conteudo ate a borda)
   - safe_area: { top, bottom } em pixels — zonas cobertas pela UI do Instagram (para Stories: top ~120px, bottom ~180px)

2. zones (zonas semanticas da composicao):
   - text_zone: { x%, width% } — area onde o texto esta posicionado
   - image_focus_zone: { x%, width% } — area principal da foto/imagem
   - gradient_zone: { x%, width% } — area coberta pelo gradiente/overlay

3. layout:
   - text_alignment (left/center/right)
   - visual_balance: left_heavy | centered | right_heavy

4. overlay: tipo (gradient/solid/none), direcao (left_to_right, bottom_to_top, etc), cor inicial, opacidade final

5. typography:
   - title_font e body_font (descrever estilo se nao identificar nome)
   - scale: mapa de tamanhos em pixels para xs/sm/md/lg/xl baseado nas proporcoes da arte

6. text_density:
   - ideal_words: contagem ideal de palavras para este layout
   - max_words: maximo antes de ficar lotado

7. colors: cor HEX de cada tipo de texto visivel (eyebrow, title, description, cta, footer)

8. default_content: somente se o texto for claramente fixo ou institucional
   (ex: endereco, horario de funcionamento, slogan permanente).
   Se nao tiver certeza, retorne string vazia "".
   NAO invente defaults — somente extraia se o texto e visivelmente fixo na arte.

9. slot_priority: array ordenado dos slots por importancia visual (titulo primeiro, footer ultimo)

9b. slot_drop_order: array dos slots que devem ser removidos primeiro quando texto nao cabe (footer primeiro, titulo nunca)

10. content_slots: para cada bloco de texto visivel, identifique:
    - tipo (label, headline, paragraph, call_to_action, location_or_info)
    - anchor: "top_fixed" se esta proximo ao topo, "bottom_fixed" se proximo ao fundo, "after:<slotAnterior>" se segue outro bloco abaixo, "before:<slotSeguinte>" se esta acima de outro bloco fixo no fundo
    - anchor_offset: % da borda (SOMENTE para top_fixed/bottom_fixed; NAO usar com after/before)
    - margin_top e margin_bottom em pixels estimados
    - tamanho da fonte mapeado para (xs/sm/md/lg/xl)
    - peso (400/600/700/800)
    - se e uppercase
    - max_words e max_lines estimados
    - max_characters_per_line estimado (conte caracteres visiveis na maior linha)
    - line_break_strategy: balanced (se linhas parecem equilibradas) | natural (se nao)
    - allow_auto_scale: true (padrao)

11. logo: se visivel:
    - placement (center_bottom, bottom_right, etc)
    - anchor_offset: % da borda inferior
    - min_margin estimado em px
    - max_size_ratio estimado (proporcao do logo vs largura da imagem)

12. analysis_confidence: 0.0-1.0 — sua confianca na analise (1.0 = perfeito, <0.7 = precisa revisao)

REGRAS:
- Retorne APENAS JSON valido
- Posicoes em percentual (0-100)
- Cores em HEX
- Nao invente conteudo textual
- Detecte quebras de linha visiveis nos titulos e descricoes
- Estime max_characters_per_line contando caracteres da maior linha visivel
- Para anchors: identifique a CADEIA de slots (eyebrow → title → description) e use "after:" para encadeamento
- Para o rodape (footer): use "bottom_fixed" com anchor_offset
- Para CTA acima do rodape: use "before:footer" (sem anchor_offset)
`
}

// --- JSON Parse with Fallbacks ---

function parseVisionJSON(raw: string): Record<string, unknown> {
  // Attempt 1: direct parse
  try {
    return JSON.parse(raw)
  } catch {
    // continue
  }

  // Attempt 2: extract JSON from markdown code block
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim())
    } catch {
      // continue
    }
  }

  // Attempt 3: find first { and last }
  const firstBrace = raw.indexOf('{')
  const lastBrace = raw.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.substring(firstBrace, lastBrace + 1))
    } catch {
      // continue
    }
  }

  throw new Error('Failed to parse Vision response as JSON')
}

// --- Zone Overlap Validation ---

function calculateOverlap(
  zone1: { x: number; width: number },
  zone2: { x: number; width: number },
): number {
  const start = Math.max(zone1.x, zone2.x)
  const end = Math.min(zone1.x + zone1.width, zone2.x + zone2.width)
  if (end <= start) return 0
  const overlapWidth = end - start
  const minWidth = Math.min(zone1.width, zone2.width)
  return minWidth > 0 ? (overlapWidth / minWidth) * 100 : 0
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`)

  return `{${entries.join(',')}}`
}

// --- Main Handler ---

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  let body: z.infer<typeof analyzeSchema>
  try {
    const rawBody = await request.json()
    body = analyzeSchema.parse(rawBody)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Erro ao processar requisicao' }, { status: 400 })
  }

  const formatInfo = FORMAT_INFO[body.format]

  try {
    // Download and resize image for Vision (max 1536px — reduces tokens and latency)
    console.log(`[analyze-art-template] Downloading image: ${body.imageUrl.substring(0, 80)}...`)
    const imageResponse = await fetch(body.imageUrl)
    if (!imageResponse.ok) {
      return NextResponse.json({ error: 'Falha ao baixar imagem' }, { status: 400 })
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
    const resizedBuffer = await sharp(imageBuffer)
      .resize(1536, 1536, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer()

    const base64Image = resizedBuffer.toString('base64')
    console.log(`[analyze-art-template] Image resized: ${imageBuffer.length} → ${resizedBuffer.length} bytes`)

    // Call GPT-4o Vision
    console.log('[analyze-art-template] Calling GPT-4o Vision...')
    const { text: rawResponse } = await generateText({
      model: openai('gpt-4o'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: `data:image/jpeg;base64,${base64Image}` },
            { type: 'text', text: buildVisionPrompt(body.format, formatInfo.width, formatInfo.height) },
          ],
        },
      ],
      temperature: 0.2,
    })

    console.log(`[analyze-art-template] Vision response length: ${rawResponse.length}`)

    // Parse JSON
    const rawTemplateData = parseVisionJSON(rawResponse)

    // Extract analysis_confidence before normalization
    const analysisConfidence = typeof rawTemplateData.analysis_confidence === 'number'
      ? rawTemplateData.analysis_confidence
      : 0.5
    delete rawTemplateData.analysis_confidence

    // Normalize template (C19)
    let templateData
    try {
      templateData = normalizeTemplate(rawTemplateData)
    } catch (error) {
      if (error instanceof TemplateValidationError) {
        return NextResponse.json(
          { error: `Template invalido: ${error.message}`, analysisConfidence: 0 },
          { status: 422 }
        )
      }
      throw error
    }

    // Generate fingerprint (C13) — stable stringify for canonical key ordering
    const fingerprint = createHash('sha256')
      .update(stableSerialize(templateData))
      .digest('hex')
      .substring(0, 8)

    // Zone overlap validation (C4)
    let zoneWarning: string | undefined
    const zones = templateData.zones as Record<string, { x: number; width: number }> | undefined
    if (zones?.text_zone && zones?.image_focus_zone) {
      const overlapPct = calculateOverlap(zones.text_zone, zones.image_focus_zone)
      if (overlapPct > 20) {
        zoneWarning = `text_zone sobrepoe image_focus_zone em ${Math.round(overlapPct)}%`
        console.log(`[analyze-art-template] Zone warning: ${zoneWarning}`)
      }
    }

    // Build preview info (C15)
    const slotNames = templateData.content_slots
      ? Object.keys(templateData.content_slots)
      : []
    const preview = {
      detectedSlots: slotNames,
      slotPositions: templateData.content_slots
        ? Object.entries(templateData.content_slots).map(([name, slot]) => ({
            name,
            type: (slot as any).type,
            anchor: (slot as any).anchor,
          }))
        : [],
      overlayDescription: templateData.overlay
        ? `${(templateData.overlay as any).type ?? 'none'} ${(templateData.overlay as any).direction ?? ''}`
        : 'none',
      colorSummary: templateData.colors
        ? Object.entries(templateData.colors).map(([k, v]) => `${k}: ${v}`).join(', ')
        : 'nenhuma cor detectada',
      zoneWarning,
    }

    console.log(`[analyze-art-template] Done: ${slotNames.length} slots detected, confidence=${analysisConfidence}, fingerprint=${fingerprint}`)

    return NextResponse.json({
      templateData,
      preview,
      fingerprint,
      analysisConfidence,
      sourceImageUrl: body.imageUrl,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[analyze-art-template] Error:', errorMessage)
    return NextResponse.json(
      { error: 'Erro ao analisar template', debug: errorMessage },
      { status: 500 }
    )
  }
}
