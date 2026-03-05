import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { z } from 'zod'
import { generateObject, generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import sharp from 'sharp'
import { processTextForTemplate, type TextProcessingMode } from '@/lib/text-processing'
import { densityCheckAndMaybeCompress, TextOverflowError } from '@/lib/density-control'

export const runtime = 'nodejs'
export const maxDuration = 240 // 4 minutes for Gemini + Vision sequential operations

// --- Constants ---

const FORMAT_DIMENSIONS: Record<string, { width: number; height: number; label: string }> = {
  FEED_PORTRAIT: { width: 1080, height: 1350, label: 'feed retrato (1080x1350)' },
  STORY: { width: 1080, height: 1920, label: 'story vertical (1080x1920)' },
  SQUARE: { width: 1024, height: 1024, label: 'quadrado (1024x1024)' },
}

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const GEMINI_PRIMARY_MODEL = 'gemini-3.1-flash-image-preview' // Nano Banana 2
const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash-image' // stable fallback

const GEMINI_ASPECT_RATIOS: Record<string, string> = {
  FEED_PORTRAIT: '4:5',
  STORY: '9:16',
  SQUARE: '1:1',
}

// --- Zod Schema ---

const generateArtSchema = z.object({
  projectId: z.number().int().positive(),
  text: z.string().max(500, 'Texto muito longo (máximo 500 caracteres)'),
  format: z.enum(['FEED_PORTRAIT', 'STORY', 'SQUARE']),
  includeLogo: z.boolean().default(false),
  usePhoto: z.boolean().default(false),
  photoUrl: z.string().url().optional(),
  variations: z.union([z.literal(1), z.literal(2), z.literal(4)]).default(1),
  styleDescription: z.string().max(500).optional(),
  compositionEnabled: z.boolean().default(false),
  compositionPrompt: z.string().max(500).optional(),
  compositionReferenceUrls: z.array(z.string().url()).max(3).optional(),
  // Template fields
  templateId: z.string().optional(),
  templateIds: z.array(z.string()).max(3).optional(),
  textProcessingMode: z.enum(['faithful', 'grammar_correct', 'headline_detection', 'generate_copy']).default('faithful'),
  textProcessingCustomPrompt: z.string().max(500).optional(),
  strictTemplateMode: z.boolean().default(false),
}).refine(
  (data) => {
    if (data.textProcessingMode === 'generate_copy' && !data.textProcessingCustomPrompt) {
      return false
    }
    return true
  },
  { message: 'customPrompt obrigatorio para modo generate_copy', path: ['textProcessingCustomPrompt'] }
).refine(
  (data) => {
    // text can be empty only for generate_copy mode
    if (data.textProcessingMode !== 'generate_copy' && (!data.text || data.text.trim().length === 0)) {
      return false
    }
    return true
  },
  { message: 'Texto obrigatorio (exceto no modo generate_copy)', path: ['text'] }
)

// --- Types ---

interface VisualElements {
  layouts?: string[]
  typography?: string[]
  patterns?: string[]
  textColorPreferences?: {
    titleColor: string
    subtitleColor: string
    infoColor: string
    ctaColor: string
  }
  overlayStyle?: 'gradient' | 'solid'
}

interface BrandAssets {
  name: string
  colors: string[]
  styleDescription: string | null
  cuisineType: string | null
  instagramUsername: string | null
  referenceImageUrls: string[]
  visualElements: VisualElements | null
  titleFontFamily: string | null
  bodyFontFamily: string | null
  logoUrl: string | null
  textColorPreferences: {
    titleColor: string
    subtitleColor: string
    infoColor: string
    ctaColor: string
  } | null
  overlayStyle: 'gradient' | 'solid'
}

interface TextElement {
  type: 'title' | 'subtitle' | 'info' | 'cta'
  text: string
  font: 'title' | 'body'
  size: 'xl' | 'lg' | 'md' | 'sm'
  weight: number
  color: string
}

interface TextLayout {
  elements: Array<{
    type: string
    text: string
    font: 'title' | 'body'
    sizePx: number
    weight: number
    color: string
    x: number
    y: number
    align: 'left' | 'center' | 'right'
    maxWidth: number
  }>
  shadow: boolean
  overlay: {
    enabled: boolean
    type: 'solid' | 'gradient'
    position: 'top' | 'bottom' | 'full'
    opacity: number
  }
}

interface GeneratedImage {
  url: string
  prompt: string
}

// --- Brand Assets ---

async function fetchBrandAssets(projectId: number): Promise<BrandAssets | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      instagramUsername: true,
      brandStyleDescription: true,
      brandVisualElements: true,
      cuisineType: true,
      brandReferenceUrls: true,
      titleFontFamily: true,
      bodyFontFamily: true,
      Logo: {
        where: { isProjectLogo: true },
        select: { fileUrl: true },
        take: 1,
      },
    },
  })

  if (!project) return null

  const colors = await db.brandColor.findMany({
    where: { projectId },
    select: { hexCode: true },
    orderBy: { createdAt: 'asc' },
  })

  const ve = project.brandVisualElements as VisualElements | null

  return {
    name: project.name,
    colors: colors.map((c) => c.hexCode),
    styleDescription: project.brandStyleDescription ?? null,
    cuisineType: project.cuisineType ?? null,
    instagramUsername: project.instagramUsername,
    referenceImageUrls: project.brandReferenceUrls ?? [],
    visualElements: ve ?? null,
    titleFontFamily: project.titleFontFamily ?? null,
    bodyFontFamily: project.bodyFontFamily ?? null,
    logoUrl: project.Logo?.[0]?.fileUrl ?? null,
    textColorPreferences: ve?.textColorPreferences ?? null,
    overlayStyle: ve?.overlayStyle ?? 'gradient',
  }
}

// --- System Prompts ---

function buildGeminiPromptSystemPrompt(
  brandAssets: BrandAssets,
  format: string,
  hasPhoto: boolean,
  hasReferenceImages: boolean,
  compositionPrompt?: string,
): string {
  const formatInfo = FORMAT_DIMENSIONS[format]
  const colorList = brandAssets.colors.length > 0
    ? brandAssets.colors.join(', ')
    : 'neutral and elegant tones'

  const ve = brandAssets.visualElements

  // Build composition guidelines from visual elements analysis (exclude typography — fonts are configured manually)
  let compositionGuidelines = ''
  if (ve && (ve.layouts?.length || ve.patterns?.length)) {
    const parts: string[] = []
    if (ve.layouts?.length) parts.push(`- Layout: ${ve.layouts.join(', ')}`)
    if (ve.patterns?.length) parts.push(`- Visual elements: ${ve.patterns.join(', ')}`)
    compositionGuidelines = `\nBRAND COMPOSITION GUIDELINES (extracted from reference images):\n${parts.join('\n')}\nYou MUST apply these exact composition principles.\n`
  } else if (brandAssets.styleDescription) {
    // Fallback: use the style description itself as composition guidance
    compositionGuidelines = `\nBRAND STYLE ANALYSIS:\n${brandAssets.styleDescription}\nFollow this style description precisely.\n`
  }

  // Derive text area strategy from layout analysis
  let textAreaInstruction = 'Reserve the bottom 35% as a clean zone with darker tones or gradient for text overlay — this area must have NO busy details'
  if (ve?.layouts?.length) {
    const layoutStr = ve.layouts.join(' ').toLowerCase()
    if (layoutStr.includes('bottom') || layoutStr.includes('inferior') || layoutStr.includes('lower')) {
      textAreaInstruction = 'Reserve the bottom 35% as a clean, darker zone (gradient or solid band) for text overlay — absolutely no visual clutter in this area'
    } else if (layoutStr.includes('center') || layoutStr.includes('central') || layoutStr.includes('centralizado')) {
      textAreaInstruction = 'Keep the center-bottom area clean with a subtle dark overlay zone for text placement — the main visual subject should be in the upper portion'
    } else if (layoutStr.includes('top') || layoutStr.includes('superior') || layoutStr.includes('upper')) {
      textAreaInstruction = 'Reserve the top 30% as a clean area for text overlay with sufficient contrast'
    }
    // Check for "espaço negativo" / negative space
    if (layoutStr.includes('espaço negativo') || layoutStr.includes('negative space') || layoutStr.includes('espaço')) {
      textAreaInstruction += '. Use generous negative space in the composition — do not fill every area with detail'
    }
  }

  const referenceImageInstruction = hasReferenceImages
    ? `\nCRITICAL — REFERENCE IMAGES ARE PROVIDED:
You are being shown ACTUAL brand reference images. These are the MOST IMPORTANT input.
Your prompt MUST recreate their visual DNA by describing:
- The EXACT color grading you see (warm/cool temperature, saturation level, contrast)
- The specific composition approach (centered, rule of thirds, asymmetric, etc.)
- The lighting characteristics (direction, softness, warmth, highlights/shadows)
- Background treatment you observe (solid color, gradient, texture, photo blur)
- The mood and atmosphere (elegant, warm, minimal, rich, etc.)
- Level of detail/complexity (clean minimal vs. richly layered)
DO NOT INVENT a generic style — describe what you ACTUALLY SEE in the reference images.\n`
    : ''

  const basePrompt = `You are an expert art director creating a social media visual for ${brandAssets.name}${brandAssets.cuisineType ? `, a ${brandAssets.cuisineType} brand` : ''}. Your job is to write an image generation prompt that PRECISELY matches this brand's visual identity.

BRAND IDENTITY:
- Brand colors (hex): ${colorList}
- Visual style: ${brandAssets.styleDescription || 'modern, elegant and professional'}
${brandAssets.cuisineType ? `- Brand category: ${brandAssets.cuisineType}` : ''}
- Output format: ${formatInfo.label} (${formatInfo.width}x${formatInfo.height})
${compositionPrompt ? `- User composition direction: ${compositionPrompt}` : ''}
${compositionGuidelines}${referenceImageInstruction}
ABSOLUTE RULES:
- NEVER mention the brand name "${brandAssets.name}" or ANY text/words/letters in your prompt
- NEVER describe labels, signs, menus, titles, watermarks, or typography of any kind
- Focus EXCLUSIVELY on visual elements: colors, shapes, lighting, composition, textures, photography

SELF-CHECK BEFORE RESPONDING:
1. Did you describe SPECIFIC colors from the brand palette or references (not "warm tones")?
2. Did you describe a SPECIFIC composition layout (not "professional arrangement")?
3. Did you describe SPECIFIC lighting (direction, temperature, intensity)?
4. Did you avoid ALL mentions of text, words, letters, or typography?
5. ${hasReferenceImages ? 'Did you describe what you ACTUALLY SEE in the reference images?' : 'Did you use the brand style description for guidance?'}
Only respond after confirming all checks.`

  if (hasPhoto) {
    return `${basePrompt}

YOUR TASK:
Write a prompt for Gemini image generator that places a provided product photo as the hero subject in a professional scene.

YOUR PROMPT MUST DESCRIBE:
1. Scene setup: background, surface, props matching ${brandAssets.cuisineType || 'restaurant'} atmosphere
2. Lighting: direction, color temperature, intensity (match the reference images if provided)
3. Color grading: use brand colors ${colorList} as accent/environment tones
4. Camera: angle, depth of field, focus point
5. Atmosphere: mood and feeling that matches the brand identity
6. ${textAreaInstruction}
${hasReferenceImages ? '7. MOST IMPORTANT: The overall look and feel MUST match the reference images shown above' : ''}

RESPOND with ONLY the prompt text in English (150-250 words).
End with: "Photographic composition only, absolutely no text, letters, words, numbers, or typography anywhere."`
  }

  return `${basePrompt}

YOUR TASK:
Write a prompt for Gemini image generator to create a visually striking social media art piece.

YOUR PROMPT MUST DESCRIBE:
1. Visual composition: layout, structure, focal point using brand colors ${colorList}
2. Graphic elements: shapes, gradients, patterns, textures matching the brand style
3. Lighting/mood: warm/cool tones, contrast, atmosphere
4. ${brandAssets.cuisineType ? `Food/drink elements if relevant to "${brandAssets.cuisineType}"` : 'Relevant visual elements for the brand'}
5. ${textAreaInstruction}
${hasReferenceImages ? '6. MOST IMPORTANT: The overall aesthetic, color grading, and mood MUST match the reference images shown above' : ''}

RESPOND with ONLY the prompt text in English (150-250 words).
End with: "Pure visual composition only, absolutely no text, letters, words, numbers, or typography anywhere."`
}

// --- Text Separation & Positioning ---

const textElementSchema = z.object({
  elements: z.array(z.object({
    type: z.enum(['title', 'subtitle', 'info', 'cta']),
    text: z.string(),
    font: z.enum(['title', 'body']),
    size: z.enum(['xl', 'lg', 'md', 'sm']),
    weight: z.number(),
    color: z.string(),
  })).max(4),
})

async function separateTextElements(
  userText: string,
  brandAssets: BrandAssets,
): Promise<TextElement[]> {
  const colorList = brandAssets.colors.length > 0
    ? brandAssets.colors
    : ['#FFFFFF', '#F59E0B']

  const tcp = brandAssets.textColorPreferences

  // If user has configured text color preferences, use them directly
  // Otherwise, fallback to heuristic detection
  let primaryColor: string
  let accentColor: string
  let subtitleColor: string
  let infoColor: string

  if (tcp) {
    primaryColor = tcp.titleColor
    subtitleColor = tcp.subtitleColor
    infoColor = tcp.infoColor
    accentColor = tcp.ctaColor
    console.log(`[separateTextElements] Using fixed color preferences: title=${primaryColor}, subtitle=${subtitleColor}, info=${infoColor}, cta=${accentColor}`)
  } else {
    // Identify primary color (gold, yellow, or first warm color) for titles
    primaryColor = colorList.find(c =>
      c.toLowerCase().includes('d4af37') || // gold
      c.toLowerCase().includes('ffd700') || // gold
      c.toLowerCase().includes('fce77b') || // yellow
      c.toLowerCase().includes('f59e0b')    // amber
    ) || colorList[0]

    // Identify accent color (red, burgundy, or second color) for CTA
    accentColor = colorList.find(c =>
      c.toLowerCase().includes('722f37') || // merlot
      c.toLowerCase().includes('c41e3a') || // red
      c.toLowerCase().includes('dc143c')    // crimson
    ) || colorList[Math.min(1, colorList.length - 1)]

    subtitleColor = primaryColor
    infoColor = '#FFFFFF'
    console.log(`[separateTextElements] Using auto-detected colors: title=${primaryColor}, cta=${accentColor}`)
  }

  const colorInstruction = tcp
    ? `CORES FIXAS (USE EXATAMENTE — NÃO ALTERE):
- type "title": SEMPRE usar ${primaryColor}
- type "subtitle": SEMPRE usar ${subtitleColor}
- type "info": SEMPRE usar ${infoColor}
- type "cta": SEMPRE usar ${accentColor}

IMPORTANTE: Estas cores foram configuradas pelo usuário. NÃO escolha cores diferentes.`
    : `REGRAS DE CORES (SIGA EXATAMENTE):
- type "title": SEMPRE usar a COR PRIMÁRIA ${primaryColor} (dourada/amarela/quente)
- type "subtitle": SEMPRE usar a COR PRIMÁRIA ${primaryColor} OU branco (#FFFFFF) se precisar contraste
- type "info": SEMPRE usar branco (#FFFFFF) para fácil leitura
- type "cta": SEMPRE usar a COR DE ACENTO ${accentColor} (vermelha/bordô) para destacar`

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: textElementSchema,
    prompt: `Separe o seguinte texto em no máximo 4 elementos visuais para uma arte gráfica de restaurante.

TEXTO DO USUÁRIO: "${userText}"

PALETA DE CORES DA MARCA: ${colorList.join(', ')}

${colorInstruction}

REGRA CRÍTICA — PRESERVAÇÃO DO TEXTO:
- Use EXATAMENTE as palavras do usuário. NÃO reescreva, NÃO adicione palavras, NÃO modifique frases.
- Apenas SEPARE o texto em elementos, mantendo as palavras originais intactas.
- Se o texto tiver partes separadas por "-" ou "–", use cada parte como um elemento diferente.

ESTRUTURA DO TEXTO:
- Máximo 4 elementos
- Cada elemento com no máximo ~30 caracteres (quebre em linhas com \\n se necessário)
- type "title": o texto principal em destaque (font: "title", size: "xl" ou "lg", weight: 700-800)
- type "subtitle": complemento do título (font: "title", size: "lg" ou "md", weight: 600)
- type "info": informações como horário, preço, endereço (font: "body", size: "md" ou "sm", weight: 400)
- type "cta": chamada para ação como "Reserve já!" ou "Qual é a sua escolha?" (font: "body", size: "md" ou "lg", weight: 700)
- Mantenha hierarquia visual clara: título > subtítulo > info > CTA`,
    temperature: 0.3,
  })

  return object.elements as TextElement[]
}

const textLayoutSchema = z.object({
  elements: z.array(z.object({
    type: z.string(),
    text: z.string(),
    font: z.enum(['title', 'body']),
    sizePx: z.number(),
    weight: z.number(),
    color: z.string(),
    x: z.number(),
    y: z.number(),
    align: z.enum(['left', 'center', 'right']),
    maxWidth: z.number(),
  })),
  shadow: z.boolean(),
  overlay: z.object({
    enabled: z.boolean(),
    type: z.enum(['solid', 'gradient']).default('gradient'),
    position: z.enum(['top', 'bottom', 'full']),
    opacity: z.number(),
  }),
})

async function positionTextWithVision(
  imageUrl: string,
  textElements: TextElement[],
  format: string,
  brandLayouts?: string[],
): Promise<TextLayout> {
  const formatInfo = FORMAT_DIMENSIONS[format]
  const elementsDesc = textElements.map((el) =>
    `- ${el.type}: "${el.text}" (font: ${el.font}, size: ${el.size}, weight: ${el.weight}, color: ${el.color})`
  ).join('\n')

  // Size mapping based on format dimensions
  const sizeMap: Record<string, number> = {
    xl: Math.round(formatInfo.width * 0.055),  // ~60px for 1080w
    lg: Math.round(formatInfo.width * 0.04),   // ~43px
    md: Math.round(formatInfo.width * 0.03),   // ~32px
    sm: Math.round(formatInfo.width * 0.022),  // ~24px
  }

  // Build brand layout preferences section if available
  let brandLayoutSection = ''
  if (brandLayouts && brandLayouts.length > 0) {
    brandLayoutSection = `\nBRAND LAYOUT PREFERENCES (from style analysis of brand references):\n${brandLayouts.map(l => `- ${l}`).join('\n')}\n→ Prioritize positioning that matches these brand layout patterns.\n`
  }

  const { text: rawText } = await generateText({
    model: openai('gpt-4o'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            image: imageUrl,
          },
          {
            type: 'text',
            text: `Analyze this image and position the following text elements to create an effective visual composition.

IMAGE DIMENSIONS: ${formatInfo.width}x${formatInfo.height}

TEXT ELEMENTS TO POSITION:
${elementsDesc}

SIZE REFERENCE (in pixels):
- xl: ${sizeMap.xl}px
- lg: ${sizeMap.lg}px
- md: ${sizeMap.md}px
- sm: ${sizeMap.sm}px
${brandLayoutSection}
POSITIONING RULES:
1. NEVER place text over the main visual subject (food, product, person)
2. If the main subject is in the top/center, place text in the bottom third
3. If the image is uniform/abstract, center the text
4. Group related elements together with consistent alignment
5. x and y are percentages (0-100) of image dimensions
6. maxWidth is percentage of image width (usually 70-90%)
7. Title should be most prominent, CTA should stand out
8. Use "shadow: true" if the background behind text area has mixed brightness
9. Overlay options:
   - "type": "gradient" = smooth black-to-transparent fade (PREFERRED for elegant brands)
   - "type": "solid" = semi-transparent solid color (use sparingly)
   - Use overlay.enabled: true with type "gradient" and opacity 0.3-0.5 when text area needs contrast
   - Prefer type "gradient" over "solid" for sophisticated, premium brands
10. Prefer NO overlay (enabled: false) if the image has a naturally dark or clean text area

COLOR PRESERVATION:
- CRITICAL: You MUST preserve the EXACT color values provided for each text element
- DO NOT change colors to white or any other color
- The colors were carefully selected to match the brand identity
- Example: if a title has color "#D4AF37" (gold), use exactly "#D4AF37" in your response

RESPOND WITH ONLY A JSON OBJECT (no markdown, no wrapping) with this EXACT structure:
{
  "elements": [
    { "type": "title", "text": "...", "font": "title", "sizePx": 59, "weight": 700, "color": "<USE EXACT COLOR FROM INPUT>", "x": 50, "y": 70, "align": "center", "maxWidth": 85 }
  ],
  "shadow": true,
  "overlay": { "enabled": true, "type": "gradient", "position": "bottom", "opacity": 0.4 }
}

The root object MUST have "elements", "shadow", and "overlay" as direct top-level keys. Do NOT wrap in any other object.`,
          },
        ],
      },
    ],
    temperature: 0.2,
  })

  // Parse JSON from response, handling potential wrapping or markdown code blocks
  let jsonStr = rawText.trim()
  // Remove markdown code fences if present
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  }

  const parsed = JSON.parse(jsonStr)

  // Handle models that wrap response in { type: "response", properties: { ... } }
  const layoutData = parsed.properties || parsed

  // CRITICAL: Restore original colors if GPT-4o changed them
  // Build a map of original colors by text content
  const originalColors = new Map<string, string>()
  for (const el of textElements) {
    originalColors.set(el.text.toLowerCase().trim(), el.color)
  }

  // Restore colors in the parsed response
  if (layoutData.elements && Array.isArray(layoutData.elements)) {
    for (const element of layoutData.elements) {
      const textKey = element.text?.toLowerCase().trim()
      if (textKey && originalColors.has(textKey)) {
        const originalColor = originalColors.get(textKey)!
        if (element.color !== originalColor) {
          console.log(`[positionTextWithVision] Restoring color for "${element.text}": ${element.color} → ${originalColor}`)
          element.color = originalColor
        }
      }
    }
  }

  const validated = textLayoutSchema.parse(layoutData)
  return validated as TextLayout
}

// --- Reference Image Preparation ---

interface PreparedRefImage {
  base64: string
  mimeType: string
}

async function prepareReferenceImages(urls: string[]): Promise<PreparedRefImage[]> {
  if (!urls.length) return []

  const toFetch = urls.slice(0, 4)
  console.log(`[generate-art] Fetching ${toFetch.length} reference images...`)

  const results = await Promise.allSettled(
    toFetch.map(async (url) => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Failed to fetch ref image: ${response.status}`)

      let buffer = Buffer.from(await response.arrayBuffer())

      // Always resize to max 512px to keep payload reasonable for multiple images
      buffer = Buffer.from(await sharp(buffer)
        .resize({ width: 512, height: 512, fit: 'inside' })
        .jpeg({ quality: 75 })
        .toBuffer())

      return {
        base64: buffer.toString('base64'),
        mimeType: 'image/jpeg',
      }
    })
  )

  const prepared = results
    .filter((r): r is PromiseFulfilledResult<PreparedRefImage> => r.status === 'fulfilled')
    .map((r) => r.value)

  const totalSizeKB = prepared.reduce((acc, r) => acc + Math.round(r.base64.length / 1024), 0)
  console.log(`[generate-art] Prepared ${prepared.length}/${toFetch.length} reference images (total ~${totalSizeKB}KB base64)`)
  return prepared
}

// --- Nano Banana 2 (Gemini) ---

async function callGeminiImageGeneration(
  model: string,
  apiKey: string,
  contentParts: any[],
  aspectRatio: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const url = `${GEMINI_BASE_URL}/${model}:generateContent`
  console.log(`[generate-art] Trying model: ${model}, aspectRatio: ${aspectRatio}`)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{
        parts: contentParts,
      }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        temperature: 0.3,
      },
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`[generate-art] Gemini (${model}) error:`, response.status, errorBody.substring(0, 500))
    throw new Error(`Gemini ${model} error: ${response.status}`)
  }

  const result = await response.json()

  // Debug: log response structure
  const candidates = result.candidates || []
  console.log(`[generate-art] Gemini (${model}) response: ${candidates.length} candidates`)
  for (let i = 0; i < candidates.length; i++) {
    const parts = candidates[i].content?.parts || []
    const finishReason = candidates[i].finishReason
    console.log(`[generate-art]   candidate[${i}]: ${parts.length} parts, finishReason=${finishReason}`)
    for (let j = 0; j < parts.length; j++) {
      const p = parts[j]
      // API returns camelCase (inlineData) via REST
      const imgData = p.inlineData || p.inline_data
      if (imgData) {
        console.log(`[generate-art]     part[${j}]: image mime=${imgData.mimeType || imgData.mime_type}, dataLen=${imgData.data?.length || 0}`)
      } else if (p.text) {
        console.log(`[generate-art]     part[${j}]: text="${p.text.substring(0, 100)}"`)
      } else {
        console.log(`[generate-art]     part[${j}]: keys=${Object.keys(p).join(',')}`)
      }
    }
  }

  // Extract generated image from response
  // Gemini REST API returns camelCase (inlineData/mimeType), handle both formats
  for (const candidate of candidates) {
    for (const part of candidate.content?.parts || []) {
      const imgData = part.inlineData || part.inline_data
      if (imgData?.data) {
        console.log(`[generate-art] Gemini (${model}) image generated successfully`)
        return {
          buffer: Buffer.from(imgData.data, 'base64'),
          mimeType: imgData.mimeType || imgData.mime_type || 'image/png',
        }
      }
    }
  }

  // If we got here, log the full response for debugging
  console.error(`[generate-art] Gemini (${model}) full response:`, JSON.stringify(result).substring(0, 1000))
  throw new Error(`Gemini (${model}) did not return an image`)
}

async function callNanoBanana2(
  prompt: string,
  photoUrl?: string,
  format: string = 'FEED_PORTRAIT',
  referenceImages?: PreparedRefImage[],
): Promise<{ buffer: Buffer; mimeType: string }> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not configured')

  const formatInfo = FORMAT_DIMENSIONS[format] || FORMAT_DIMENSIONS.FEED_PORTRAIT
  const aspectRatio = GEMINI_ASPECT_RATIOS[format] || '4:5'

  const hasRefs = referenceImages && referenceImages.length > 0

  // Embed system instruction directly in the prompt (system_instruction may not work with image generation models)
  const roleInstruction = photoUrl
    ? 'You are an expert food photographer and art director. Generate a photorealistic, professionally-styled scene using the provided product photo as the hero subject. Match the brand aesthetic EXACTLY.'
    : 'You are an expert graphic designer and art director. Generate a professionally-designed, visually stunning composition for social media. Match the brand aesthetic EXACTLY.'
  
  // Build content parts with reference images first for style context
  const contentParts: any[] = [{ text: roleInstruction }]

  // Add reference images BEFORE the prompt so Gemini sees the style first
  if (hasRefs) {
    contentParts.push({ text: `BRAND STYLE REFERENCES — ${referenceImages!.length} images. You MUST match their visual style:` })
    for (let i = 0; i < referenceImages!.length; i++) {
      const ref = referenceImages![i]
      contentParts.push({ inline_data: { mime_type: ref.mimeType, data: ref.base64 } })
    }
    contentParts.push({ text: `STYLE MATCHING REQUIREMENTS (from the ${referenceImages!.length} reference images above):
- MATCH the exact color palette and color grading (temperature, saturation, contrast)
- MATCH the composition style, spacing, and visual hierarchy
- MATCH the lighting direction, warmth, and shadow treatment
- MATCH the background treatment (gradients, textures, blur, solid colors)
- MATCH the overall mood, elegance level, and visual complexity
- DO NOT create a generic image — the result must look like it belongs to the same brand as the references

AVOID THESE GENERIC MISTAKES:
- Generic stock photo look with flat lighting
- Overly bright or saturated colors NOT present in references
- Center-everything composition if references show asymmetry
- Busy/cluttered backgrounds if references are clean and minimal
- Different lighting temperature than what you see in the references
- Adding decorative elements not present in the reference style

Generate a NEW image following this description:` })
    console.log(`[generate-art] Added ${referenceImages!.length} style reference images to Gemini request`)
  }

  // Add the main prompt
  const mainPrompt = `IMPORTANT: Generate ONLY an image. ABSOLUTELY NO TEXT, NO LETTERS, NO NUMBERS, NO WATERMARKS, NO UI ELEMENTS in the generated image.\n\n${prompt}\n\nGenerate an image with ${aspectRatio} aspect ratio for ${formatInfo.label}.`
  contentParts.push({ text: mainPrompt })

  // If photo provided, include it as reference
  if (photoUrl) {
    console.log('[generate-art] Fetching photo for Gemini...')
    const photoResponse = await fetch(photoUrl)
    if (!photoResponse.ok) throw new Error('Failed to fetch photo')

    let photoBuffer: Buffer = Buffer.from(await photoResponse.arrayBuffer())
    const contentType = photoResponse.headers.get('content-type') || 'image/jpeg'

    // Resize if > 3MB to stay within Gemini limits
    if (photoBuffer.length > 3 * 1024 * 1024) {
      console.log('[generate-art] Resizing photo for Gemini (too large)...')
      photoBuffer = Buffer.from(await sharp(photoBuffer)
        .resize({ width: 1024, fit: 'inside' })
        .jpeg({ quality: 85 })
        .toBuffer())
    }

    const photoBase64 = photoBuffer.toString('base64')
    const mimeType = contentType.startsWith('image/') ? contentType : 'image/jpeg'
    
    contentParts.push({ inline_data: { mime_type: mimeType, data: photoBase64 } })
  }

  // Try primary model, fallback to secondary
  console.log(`[generate-art] Calling Gemini with ${contentParts.length} content parts (refs=${hasRefs ? referenceImages!.length : 0}, photo=${photoUrl ? 'yes' : 'no'})...`)
  try {
    return await callGeminiImageGeneration(GEMINI_PRIMARY_MODEL, apiKey, contentParts, aspectRatio)
  } catch (primaryError: any) {
    console.warn(`[generate-art] Primary model (${GEMINI_PRIMARY_MODEL}) failed: ${primaryError.message}. Falling back to ${GEMINI_FALLBACK_MODEL}...`)
    return await callGeminiImageGeneration(GEMINI_FALLBACK_MODEL, apiKey, contentParts, aspectRatio)
  }
}

// --- Main Handler ---

// --- Template Path Helpers ---

interface ArtTemplate {
  id: string
  name: string
  format: string
  schemaVersion: number
  engineVersion: number
  templateVersion: number
  fingerprint: string
  analysisConfidence: number
  sourceImageUrl: string
  createdAt: string
  templateData: any
}

const SUPPORTED_ENGINE_VERSION = 1

async function classifyTextIntoSlots(
  text: string,
  template: ArtTemplate,
): Promise<Record<string, string>> {
  const slotNames = Object.keys(template.templateData.content_slots || {})

  // Dynamic schema built from template slot names
  const schemaShape: Record<string, z.ZodTypeAny> = {}
  for (const name of slotNames) {
    const slot = template.templateData.content_slots[name]
    schemaShape[name] = z.string().optional().describe(`Tipo: ${slot?.type ?? 'text'}`)
  }
  const schema = z.object(schemaShape)

  const slotDescriptions = slotNames.map(name => {
    const slot = template.templateData.content_slots[name]
    return `- ${name}: tipo "${slot?.type ?? 'text'}", max ${slot?.max_words ?? 20} palavras`
  }).join('\n')

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema,
    prompt: `Classifique o texto nos slots do template.
Slots disponiveis:
${slotDescriptions}

Regras:
- NAO reescreva o texto, apenas separe nas categorias
- Identifique headline principal → title
- Informacoes de contato/endereco → footer
- Chamada para acao → cta
- Texto descritivo → description

Texto: "${text}"`,
    temperature: 0.2,
  })

  const slots: Record<string, string> = {}
  for (const [key, value] of Object.entries(object)) {
    if (typeof value === 'string' && value.trim()) {
      slots[key] = value.trim()
    }
  }
  return slots
}

async function resolveFontSources(
  template: ArtTemplate,
  projectId: number,
  project: any,
): Promise<{ title: { family: string; url: string | null }; body: { family: string; url: string | null } }> {
  const typo = template.templateData.typography || {}

  // Font precedence: template > project > fallback
  const titleFont = typo.title_font || project.titleFontFamily || 'Inter'
  const bodyFont = typo.body_font || project.bodyFontFamily || 'Inter'

  // Look up custom font URLs
  const customFonts = await db.customFont.findMany({
    where: { projectId },
    select: { fontFamily: true, fileUrl: true },
  })
  const fontMap = Object.fromEntries(customFonts.map(f => [f.fontFamily, f.fileUrl]))

  return {
    title: { family: titleFont, url: fontMap[titleFont] ?? null },
    body: { family: bodyFont, url: fontMap[bodyFont] ?? null },
  }
}

async function handleTemplatePath(
  body: any,
  templateIds: string[],
  brandAssets: BrandAssets,
): Promise<Response> {
  const startTime = Date.now()
  let llmCallCount = 0
  let llmTotalLatencyMs = 0

  // Load project for font resolution
  const project = await db.project.findUnique({
    where: { id: body.projectId },
    select: {
      id: true,
      titleFontFamily: true,
      bodyFontFamily: true,
      brandVisualElements: true,
      Logo: {
        where: { isProjectLogo: true },
        select: { fileUrl: true },
        take: 1,
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: 'Projeto nao encontrado' }, { status: 404 })
  }

  // Load templates
  const ve = (project.brandVisualElements ?? {}) as Record<string, unknown>
  const allTemplates = (ve.artTemplates ?? []) as ArtTemplate[]
  const templates = templateIds.map(id => allTemplates.find(t => t.id === id)).filter(Boolean) as ArtTemplate[]

  if (templates.length === 0) {
    return NextResponse.json({ error: 'Nenhum template encontrado' }, { status: 404 })
  }

  // Version check (C12)
  for (const tpl of templates) {
    if ((tpl.engineVersion ?? 1) > SUPPORTED_ENGINE_VERSION) {
      return NextResponse.json(
        { error: `Template '${tpl.name}' requer versao mais nova do engine` },
        { status: 400 }
      )
    }
  }

  const primaryTemplate = templates[0]

  // 1. Text Processing
  const textConfig = {
    mode: body.textProcessingMode as TextProcessingMode,
    customPrompt: body.textProcessingCustomPrompt,
  }
  const slotNames = Object.keys(primaryTemplate.templateData.content_slots || {})

  const llm1Start = Date.now()
  const processedText = await processTextForTemplate(
    body.text || '',
    textConfig,
    slotNames,
  )
  if (textConfig.mode !== 'faithful') {
    llmCallCount++
    llmTotalLatencyMs += Date.now() - llm1Start
  }

  // 2. Slot Classification
  let slots: Record<string, string>
  if (processedText.classified) {
    slots = processedText.slots
  } else {
    const llm2Start = Date.now()
    slots = await classifyTextIntoSlots((processedText as { classified: false; text: string }).text, primaryTemplate)
    llmCallCount++
    llmTotalLatencyMs += Date.now() - llm2Start
  }

  // 3. Density Control
  const llm3Start = Date.now()
  let densityResult
  try {
    densityResult = await densityCheckAndMaybeCompress(
      slots,
      {
        text_density: primaryTemplate.templateData.text_density || { ideal_words: 20, max_words: 35 },
        slot_drop_order: primaryTemplate.templateData.slot_drop_order,
        slot_priority: primaryTemplate.templateData.slot_priority,
        content_slots: primaryTemplate.templateData.content_slots || {},
        default_content: primaryTemplate.templateData.default_content,
      },
      body.strictTemplateMode,
    )
  } catch (error) {
    if (error instanceof TextOverflowError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
  if (densityResult.textCompressed) {
    llmCallCount++
    llmTotalLatencyMs += Date.now() - llm3Start
  }

  // 4. Generate base image (reuse existing logic)
  const formatInfo = FORMAT_DIMENSIONS[body.format]
  let imageUrl: string

  const hasPhoto = body.usePhoto && !!body.photoUrl
  const useAIComposition = body.compositionEnabled && hasPhoto
  const usePhotoDirectly = hasPhoto && !body.compositionEnabled

  if (usePhotoDirectly) {
    const photoResponse = await fetch(body.photoUrl!)
    if (!photoResponse.ok) throw new Error('Failed to fetch photo')
    const photoBuffer = Buffer.from(await photoResponse.arrayBuffer())
    const resizedBuffer = await sharp(photoBuffer)
      .resize(formatInfo.width, formatInfo.height, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 90 })
      .toBuffer()
    imageUrl = `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`
  } else {
    const refImages = await prepareReferenceImages(brandAssets.referenceImageUrls.slice(0, 4))
    const systemPrompt = buildGeminiPromptSystemPrompt(
      brandAssets, body.format, useAIComposition,
      refImages.length > 0, body.compositionEnabled ? body.compositionPrompt : undefined,
    )

    const userContent: Array<{ type: string; text?: string; image?: string }> = []
    if (refImages.length > 0) {
      for (const ref of refImages.slice(0, 2)) {
        userContent.push({ type: 'image', image: `data:${ref.mimeType};base64,${ref.base64}` })
      }
      userContent.push({ type: 'text', text: `Reference images. Match their visual style.\n\nTexto: "${body.text}"` })
    } else {
      userContent.push({ type: 'text', text: `Texto para a arte: "${body.text}"` })
    }

    const { text: prompt } = await generateText({
      model: openai('gpt-4o'),
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent as any }],
      temperature: 0.4,
    })

    const { buffer } = await callNanoBanana2(
      prompt,
      useAIComposition ? body.photoUrl : undefined,
      body.format,
      refImages.length > 0 ? refImages : undefined,
    )

    const resizedBuffer = await sharp(buffer)
      .resize(formatInfo.width, formatInfo.height, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 90 })
      .toBuffer()

    imageUrl = `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`
  }

  // 5. Resolve font sources for each template
  const templatesWithFonts = await Promise.all(
    templates.map(async (tpl) => {
      const fontSources = await resolveFontSources(tpl, body.projectId, project)
      return {
        templateId: tpl.id,
        templateData: tpl.templateData,
        fontSources,
      }
    })
  )

  // 6. Build logo config
  const logoUrl = project.Logo?.[0]?.fileUrl ?? null

  console.log(`[generate-art] Template path: ${templates.length} templates, ${llmCallCount} LLM calls, ${Date.now() - startTime}ms total`)

  // 7. Return payload for frontend to orchestrate 4-pass
  return NextResponse.json({
    imageUrl,
    templatePath: true,
    templates: templatesWithFonts,
    slots: densityResult.slots,
    densityResult: {
      totalWords: densityResult.totalWords,
      textCompressed: densityResult.textCompressed,
      droppedSlots: densityResult.droppedSlots,
    },
    strictTemplateMode: body.strictTemplateMode,
    format: body.format,
    logo: logoUrl ? {
      url: logoUrl,
      position: 'bottom-right',
      sizePct: 12,
    } : undefined,
    serverTelemetry: {
      llmCallCount,
      llmTotalLatencyMs,
      textProcessingMode: body.textProcessingMode,
      totalWords: densityResult.totalWords,
      textCompressed: densityResult.textCompressed,
      droppedSlots: densityResult.droppedSlots,
      slotsUsed: Object.keys(densityResult.slots),
      serverTimeMs: Date.now() - startTime,
    },
  })
}

export async function POST(request: Request) {
  const { userId, orgId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Validate required API keys
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'Configuração de IA incompleta (OpenAI). Contate o administrador.' },
      { status: 503 }
    )
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return NextResponse.json(
      { error: 'Configuração de IA incompleta (Gemini). Contate o administrador.' },
      { status: 503 }
    )
  }

  // Parse and validate request
  let body: z.infer<typeof generateArtSchema>
  try {
    const rawBody = await request.json()
    body = generateArtSchema.parse(rawBody)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Erro ao processar requisição' }, { status: 400 })
  }

  // Check project access
  const project = await fetchProjectWithShares(body.projectId)
  if (!project || !hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  // Fetch brand assets
  const brandAssets = await fetchBrandAssets(body.projectId)
  if (!brandAssets) {
    return NextResponse.json({ error: 'Erro ao buscar assets da marca' }, { status: 500 })
  }

  console.log(`[generate-art] Brand assets loaded: name="${brandAssets.name}", colors=${brandAssets.colors.length}, referenceUrls=${brandAssets.referenceImageUrls.length}, hasVisualElements=${!!brandAssets.visualElements}, styleDesc=${brandAssets.styleDescription ? 'yes' : 'no'}, textColorPrefs=${brandAssets.textColorPreferences ? 'yes' : 'no'}, overlayStyle=${brandAssets.overlayStyle}`)
  if (brandAssets.referenceImageUrls.length > 0) {
    console.log(`[generate-art] Reference URLs: ${brandAssets.referenceImageUrls.map(u => u.substring(0, 60) + '...').join(', ')}`)
  }
  if (brandAssets.visualElements) {
    console.log('[generate-art] visualElements:', JSON.stringify(brandAssets.visualElements))
  } else {
    console.log('[generate-art] WARNING: No visualElements found — using styleDescription fallback')
  }

  if (body.styleDescription) {
    brandAssets.styleDescription = body.styleDescription
  }

  try {
    // --- Template Path ---
    const templateIds = body.templateIds || (body.templateId ? [body.templateId] : [])

    if (templateIds.length > 0) {
      return await handleTemplatePath(body, templateIds, brandAssets)
    }

    // --- Legacy Path (no template) ---
    // --- Step 1: Separate text into visual elements ---
    console.log('[generate-art] Step 1: Separating text elements...')
    console.log('[generate-art] Brand colors:', brandAssets.colors)
    let textElements: TextElement[] = []
    try {
      textElements = await separateTextElements(body.text, brandAssets)
      console.log(`[generate-art] Separated into ${textElements.length} elements:`)
      textElements.forEach((el, i) => {
        console.log(`  [${i}] ${el.type}: "${el.text.substring(0, 30)}..." - color: ${el.color}, font: ${el.font}, size: ${el.size}, weight: ${el.weight}`)
      })
    } catch (e) {
      console.error('[generate-art] Text separation failed, will skip text rendering:', e)
    }

    // --- Determine generation mode ---
    const hasPhoto = body.usePhoto && !!body.photoUrl
    const useAIComposition = body.compositionEnabled && hasPhoto
    const usePhotoDirectly = hasPhoto && !body.compositionEnabled
    console.log(`[generate-art] Mode: hasPhoto=${hasPhoto}, compositionEnabled=${body.compositionEnabled}, useAIComposition=${useAIComposition}, usePhotoDirectly=${usePhotoDirectly}`)

    const formatInfo = FORMAT_DIMENSIONS[body.format]
    const generatedImages: GeneratedImage[] = []
    let technicalPrompt = ''

    if (usePhotoDirectly) {
      // --- Mode A: Use photo directly (no AI generation) ---
      console.log('[generate-art] Step 2: Using photo directly (no AI composition)...')
      
      // Download and resize the photo
      const photoResponse = await fetch(body.photoUrl!)
      if (!photoResponse.ok) throw new Error('Failed to fetch photo')
      const photoBuffer = Buffer.from(await photoResponse.arrayBuffer())
      
      const resizedBuffer = await sharp(photoBuffer)
        .resize(formatInfo.width, formatInfo.height, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 90 })
        .toBuffer()

      const base64 = resizedBuffer.toString('base64')
      const imageUrl = `data:image/jpeg;base64,${base64}`
      technicalPrompt = 'Photo used directly (no AI composition)'

      // For variations with direct photo, use the same image but different text positions
      for (let i = 0; i < body.variations; i++) {
        generatedImages.push({ url: imageUrl, prompt: technicalPrompt })
      }
    } else {
      // --- Mode B: Generate image(s) with Gemini ---
      console.log('[generate-art] Step 2: Generating visual prompt with GPT-4o...')

      // Pre-fetch reference images ONCE before prompt generation and image generation
      const refImages = await prepareReferenceImages(brandAssets.referenceImageUrls.slice(0, 4))

      // Log visual elements if available
      if (brandAssets.visualElements) {
        console.log('[generate-art] Loaded visualElements:', JSON.stringify(brandAssets.visualElements))
      }

      const systemPrompt = buildGeminiPromptSystemPrompt(
        brandAssets,
        body.format,
        useAIComposition,
        refImages.length > 0,
        body.compositionEnabled ? body.compositionPrompt : undefined,
      )

      // Build messages for GPT-4o-mini — pass reference images so it can SEE the brand style
      const userContent: Array<{ type: string; text?: string; image?: string }> = []
      
      // Add up to 2 reference images for GPT-4o-mini to analyze (keep payload reasonable)
      if (refImages.length > 0) {
        for (const ref of refImages.slice(0, 2)) {
          userContent.push({ type: 'image', image: `data:${ref.mimeType};base64,${ref.base64}` })
        }
        userContent.push({ type: 'text', text: `These are the brand's actual reference images. Look at their colors, lighting, composition, backgrounds, and overall mood VERY carefully. Your prompt must recreate this exact visual style.\n\nTexto para a arte: "${body.text}"` })
        console.log(`[generate-art] Passing ${Math.min(refImages.length, 2)} reference images to GPT-4o for style analysis`)
      } else {
        userContent.push({ type: 'text', text: `Texto para a arte: "${body.text}"` })
      }

      const { text: prompt } = await generateText({
        model: openai('gpt-4o'),
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent as any }],
        temperature: 0.4,
      })
      technicalPrompt = prompt

      console.log('[generate-art] Technical prompt (full):', technicalPrompt)
      console.log(`[generate-art] Step 3: Generating ${body.variations} image(s) with Gemini (${refImages.length} style refs)...`)

      for (let i = 0; i < body.variations; i++) {
        console.log(`[generate-art] Generating variation ${i + 1}/${body.variations}...`)
        const { buffer } = await callNanoBanana2(
          technicalPrompt,
          useAIComposition ? body.photoUrl : undefined,
          body.format,
          refImages.length > 0 ? refImages : undefined,
        )

        const resizedBuffer = await sharp(buffer)
          .resize(formatInfo.width, formatInfo.height, { fit: 'cover', position: 'attention' })
          .jpeg({ quality: 90 })
          .toBuffer()

        const base64 = resizedBuffer.toString('base64')
        const imageUrl = `data:image/jpeg;base64,${base64}`

        generatedImages.push({ url: imageUrl, prompt: technicalPrompt })
      }
    }

    if (generatedImages.length === 0) {
      throw new Error('Nenhuma imagem foi gerada')
    }

    // --- Step 4: Position text with Vision ---
    console.log('[generate-art] Step 4: Positioning text with Vision...')
    const results: Array<{ imageUrl: string; prompt: string; textLayout?: TextLayout }> = []

    // For direct photo mode with variations, we use the same image but request different layouts
    const uniqueImages = usePhotoDirectly ? [generatedImages[0]] : generatedImages
    
    for (let i = 0; i < generatedImages.length; i++) {
      const img = usePhotoDirectly ? uniqueImages[0] : generatedImages[i]
      let textLayout: TextLayout | undefined
      if (textElements.length > 0) {
        try {
          textLayout = await positionTextWithVision(img.url, textElements, body.format, brandAssets.visualElements?.layouts)
          console.log(`[generate-art] Text positioned for variation ${i + 1}`)
        } catch (e) {
          console.error('[generate-art] Vision positioning failed for image, skipping text:', e)
        }
      }
      results.push({
        imageUrl: img.url,
        prompt: img.prompt,
        textLayout,
      })
    }

    // --- Step 5: Build response ---
    // Debug font configuration
    console.log(`[generate-art] Font config: titleFontFamily="${brandAssets.titleFontFamily}", bodyFontFamily="${brandAssets.bodyFontFamily}"`)
    
    let fontUrls: { title?: string; body?: string } | undefined
    if (brandAssets.titleFontFamily || brandAssets.bodyFontFamily) {
      const customFonts = await db.customFont.findMany({
        where: { projectId: body.projectId },
        select: { fontFamily: true, fileUrl: true },
      })
      console.log(`[generate-art] CustomFonts in DB: ${JSON.stringify(customFonts.map(f => f.fontFamily))}`)
      
      const fontMap = Object.fromEntries(customFonts.map((f) => [f.fontFamily, f.fileUrl]))
      fontUrls = {
        title: brandAssets.titleFontFamily ? fontMap[brandAssets.titleFontFamily] : undefined,
        body: brandAssets.bodyFontFamily ? fontMap[brandAssets.bodyFontFamily] : undefined,
      }
      console.log(`[generate-art] Resolved fontUrls: title=${!!fontUrls.title}, body=${!!fontUrls.body}`)
    }

    console.log(`[generate-art] Done! Generated ${results.length} images with Gemini`)

    return NextResponse.json({
      images: results,
      prompt: technicalPrompt,
      provider: 'nano-banana-2',
      format: body.format,
      variations: results.length,
      fonts: {
        title: brandAssets.titleFontFamily || 'Inter',
        body: brandAssets.bodyFontFamily || 'Inter',
      },
      fontUrls,
      logo: brandAssets.logoUrl ? {
        url: brandAssets.logoUrl,
        position: 'bottom-right',
        sizePct: 12,
      } : undefined,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error('[generate-art] Error:', errorMessage)
    if (errorStack) console.error('[generate-art] Stack:', errorStack)

    return NextResponse.json(
      { error: 'Erro ao gerar arte. Tente novamente.', debug: errorMessage },
      { status: 500 }
    )
  }
}
