import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { z } from 'zod'
import { generateObject, generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import sharp from 'sharp'

export const runtime = 'nodejs'
export const maxDuration = 240 // 4 minutes for Gemini + Vision sequential operations

// --- Constants ---

const FORMAT_DIMENSIONS: Record<string, { width: number; height: number; label: string }> = {
  FEED_PORTRAIT: { width: 1080, height: 1350, label: 'feed retrato (1080x1350)' },
  STORY: { width: 1080, height: 1920, label: 'story vertical (1080x1920)' },
  SQUARE: { width: 1024, height: 1024, label: 'quadrado (1024x1024)' },
}

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const GEMINI_PRIMARY_MODEL = 'gemini-2.5-flash-image' // Nano Banana 2 - stable
const GEMINI_FALLBACK_MODEL = 'gemini-2.0-flash' // fallback

const GEMINI_ASPECT_RATIOS: Record<string, string> = {
  FEED_PORTRAIT: '4:5',
  STORY: '9:16',
  SQUARE: '1:1',
}

// --- Zod Schema ---

const generateArtSchema = z.object({
  projectId: z.number().int().positive(),
  text: z.string().min(1).max(500, 'Texto muito longo (máximo 500 caracteres)'),
  format: z.enum(['FEED_PORTRAIT', 'STORY', 'SQUARE']),
  includeLogo: z.boolean().default(false),
  usePhoto: z.boolean().default(false),
  photoUrl: z.string().url().optional(),
  variations: z.union([z.literal(1), z.literal(2), z.literal(4)]).default(1),
  styleDescription: z.string().max(500).optional(),
  compositionEnabled: z.boolean().default(false),
  compositionPrompt: z.string().max(500).optional(),
  compositionReferenceUrls: z.array(z.string().url()).max(3).optional(),
})

// --- Types ---

interface BrandAssets {
  name: string
  colors: string[]
  styleDescription: string | null
  cuisineType: string | null
  instagramUsername: string | null
  referenceImageUrls: string[]
  titleFontFamily: string | null
  bodyFontFamily: string | null
  logoUrl: string | null
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
      cuisineType: true,
      brandReferenceUrls: true,
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

  // Access optional font fields safely (may not exist in schema yet)
  const projectAny = project as any

  return {
    name: project.name,
    colors: colors.map((c) => c.hexCode),
    styleDescription: project.brandStyleDescription ?? null,
    cuisineType: project.cuisineType ?? null,
    instagramUsername: project.instagramUsername,
    referenceImageUrls: project.brandReferenceUrls ?? [],
    titleFontFamily: projectAny.titleFontFamily ?? null,
    bodyFontFamily: projectAny.bodyFontFamily ?? null,
    logoUrl: project.Logo?.[0]?.fileUrl ?? null,
  }
}

// --- System Prompts ---

function buildGeminiPromptSystemPrompt(
  brandAssets: BrandAssets,
  format: string,
  hasPhoto: boolean,
  compositionPrompt?: string,
): string {
  const formatInfo = FORMAT_DIMENSIONS[format]
  const colorList = brandAssets.colors.length > 0
    ? brandAssets.colors.join(', ')
    : 'neutral and elegant tones'

  const basePrompt = `You are a professional graphic designer and food photographer specialized in creating stunning visuals for restaurants.

BRAND VISUAL IDENTITY (use for colors/style only, NOT as text):
- Brand colors (hex): ${colorList}
- Visual style: ${brandAssets.styleDescription || 'modern, elegant and professional'}
- Cuisine type: ${brandAssets.cuisineType || 'gourmet/fine dining'}
- Art format: ${formatInfo.label} (${formatInfo.width}x${formatInfo.height})
${compositionPrompt ? `- Composition direction: ${compositionPrompt}` : ''}

ABSOLUTELY CRITICAL - DO NOT VIOLATE:
- NEVER include the brand name "${brandAssets.name}" or ANY text/words/letters in your prompt
- NEVER describe labels, signs, menus, titles, watermarks, or typography
- Focus ONLY on visual elements: colors, shapes, lighting, composition, photography style`

  if (hasPhoto) {
    return `${basePrompt}

YOUR TASK:
Create a prompt for an AI image generator (Gemini) that will use a provided product photo as the main subject.

DESCRIBE:
- Professional food photography scene and styling
- Table setting, props, and background elements
- Camera angle and depth of field (shallow DOF recommended)
- Lighting: natural light, warm tones, or professional studio
- Atmosphere and mood matching ${brandAssets.cuisineType || 'restaurant'} environment
- Leave clean areas in the composition for text overlay (typically top or bottom third)

RESPONSE FORMAT:
Respond ONLY with the visual prompt in English (max 200 words).
End your prompt with: "Pure photography, absolutely no text, letters, words, numbers, or typography anywhere in the image."`
  }

  return `${basePrompt}

YOUR TASK:
Create a prompt for an AI image generator (Gemini) to generate a stunning visual for a restaurant social media post.

DESCRIBE:
- Abstract/artistic visual composition using brand colors: ${colorList}
- Professional graphic design elements (gradients, shapes, patterns)
- Food photography elements if relevant (ingredients, dishes, atmosphere)
- Lighting and visual mood matching the brand style
- Clean areas in the composition for text overlay (typically center or bottom)

RESPONSE FORMAT:
Respond ONLY with the visual prompt in English (max 200 words).
End your prompt with: "Pure visual composition, absolutely no text, letters, words, numbers, or typography anywhere in the image."`
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
  const colorOptions = brandAssets.colors.length > 0
    ? brandAssets.colors.join(', ')
    : '#FFFFFF, #F59E0B'

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: textElementSchema,
    prompt: `Separe o seguinte texto em no máximo 4 elementos visuais para uma arte gráfica de restaurante.

TEXTO DO USUÁRIO: "${userText}"

CORES DISPONÍVEIS DA MARCA: ${colorOptions}
Também pode usar #FFFFFF (branco) para contraste.

REGRAS:
- Máximo 4 elementos
- Cada elemento com no máximo ~30 caracteres (quebre em linhas se necessário)
- type "title": o texto principal em destaque (font: "title", size: "xl" ou "lg", weight: 700-800)
- type "subtitle": complemento do título (font: "title", size: "lg" ou "md", weight: 600)
- type "info": informações como horário, preço (font: "body", size: "md" ou "sm", weight: 400)
- type "cta": chamada para ação como "Reserve já!" (font: "body", size: "md", weight: 700)
- Use cores da marca para títulos e CTA, branco para info
- Mantenha hierarquia visual clara`,
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
    position: z.enum(['top', 'bottom', 'full']),
    opacity: z.number(),
  }),
})

async function positionTextWithVision(
  imageUrl: string,
  textElements: TextElement[],
  format: string,
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

  const { object } = await generateObject({
    model: openai('gpt-4o'),
    schema: textLayoutSchema,
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

POSITIONING RULES:
1. NEVER place text over the main visual subject (food, product, person)
2. If the main subject is in the top/center, place text in the bottom third
3. If the image is uniform/abstract, center the text
4. Group related elements together with consistent alignment
5. x and y are percentages (0-100) of image dimensions
6. maxWidth is percentage of image width (usually 70-90%)
7. Title should be most prominent, CTA should stand out
8. Use "shadow: true" if the background behind text area has mixed brightness
9. Use "overlay.enabled: true" with position "bottom" and opacity 0.4-0.6 if the text area has a bright or busy background
10. Prefer bottom positioning for overlay when the subject is at top/center

Return the positioning as structured JSON.`,
          },
        ],
      },
    ],
    temperature: 0.2,
  })

  return object as TextLayout
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
        temperature: 0.4,
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
): Promise<{ buffer: Buffer; mimeType: string }> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not configured')

  const formatInfo = FORMAT_DIMENSIONS[format] || FORMAT_DIMENSIONS.FEED_PORTRAIT
  const aspectRatio = GEMINI_ASPECT_RATIOS[format] || '4:5'

  // Embed system instruction directly in the prompt (system_instruction may not work with image generation models)
  const roleInstruction = photoUrl
    ? 'You are a professional food photographer. Generate a photorealistic scene based on the description using the provided product photo as the main subject. The output must be a high-quality photographic image.'
    : 'You are a professional graphic designer. Generate a stunning visual composition based on the description. The output must be a high-quality image suitable for social media.'
  
  const fullPrompt = `${roleInstruction}\n\nIMPORTANT: Generate ONLY an image. ABSOLUTELY NO TEXT, NO LETTERS, NO NUMBERS, NO WATERMARKS, NO UI ELEMENTS in the generated image.\n\n${prompt}\n\nGenerate an image with ${aspectRatio} aspect ratio for ${formatInfo.label}.`

  // Build content parts
  const contentParts: any[] = [{ text: fullPrompt }]

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
  console.log(`[generate-art] Calling Gemini ${photoUrl ? 'with photo' : 'without photo'}...`)
  try {
    return await callGeminiImageGeneration(GEMINI_PRIMARY_MODEL, apiKey, contentParts, aspectRatio)
  } catch (primaryError: any) {
    console.warn(`[generate-art] Primary model (${GEMINI_PRIMARY_MODEL}) failed: ${primaryError.message}. Falling back to ${GEMINI_FALLBACK_MODEL}...`)
    return await callGeminiImageGeneration(GEMINI_FALLBACK_MODEL, apiKey, contentParts, aspectRatio)
  }
}

// --- Main Handler ---

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

  if (body.styleDescription) {
    brandAssets.styleDescription = body.styleDescription
  }

  try {
    // --- Step 1: Separate text into visual elements ---
    console.log('[generate-art] Step 1: Separating text elements...')
    let textElements: TextElement[] = []
    try {
      textElements = await separateTextElements(body.text, brandAssets)
      console.log(`[generate-art] Separated into ${textElements.length} elements`)
    } catch (e) {
      console.error('[generate-art] Text separation failed, will skip text rendering:', e)
    }

    // --- Step 2: Generate visual prompt with GPT-4o-mini ---
    const hasPhoto = body.usePhoto && !!body.photoUrl
    console.log(`[generate-art] Step 2: Generating visual prompt (hasPhoto=${hasPhoto})`)

    const systemPrompt = buildGeminiPromptSystemPrompt(
      brandAssets,
      body.format,
      hasPhoto,
      body.compositionEnabled ? body.compositionPrompt : undefined,
    )

    const { text: technicalPrompt } = await generateText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      prompt: `Texto para a arte: "${body.text}"`,
      temperature: 0.7,
    })

    console.log('[generate-art] Technical prompt:', technicalPrompt.substring(0, 200) + '...')

    // --- Step 3: Generate image(s) with Gemini (Nano Banana 2) ---
    console.log(`[generate-art] Step 3: Generating ${body.variations} image(s) with Gemini...`)
    const generatedImages: GeneratedImage[] = []

    for (let i = 0; i < body.variations; i++) {
      console.log(`[generate-art] Generating variation ${i + 1}/${body.variations}...`)
      const { buffer, mimeType } = await callNanoBanana2(
        technicalPrompt,
        hasPhoto ? body.photoUrl : undefined,
        body.format,
      )

      // Resize to exact format dimensions with Sharp
      const formatInfo = FORMAT_DIMENSIONS[body.format]
      const resizedBuffer = await sharp(buffer)
        .resize(formatInfo.width, formatInfo.height, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 90 })
        .toBuffer()

      // Convert to base64 data URL for frontend consumption
      const base64 = resizedBuffer.toString('base64')
      const imageUrl = `data:image/jpeg;base64,${base64}`

      generatedImages.push({
        url: imageUrl,
        prompt: technicalPrompt,
      })
    }

    if (generatedImages.length === 0) {
      throw new Error('Nenhuma imagem foi gerada')
    }

    // --- Step 4: Position text with Vision ---
    console.log('[generate-art] Step 4: Positioning text with Vision...')
    const results: Array<{ imageUrl: string; prompt: string; textLayout?: TextLayout }> = []

    for (const img of generatedImages) {
      let textLayout: TextLayout | undefined
      if (textElements.length > 0) {
        try {
          textLayout = await positionTextWithVision(img.url, textElements, body.format)
          console.log('[generate-art] Text positioned for image')
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
    let fontUrls: { title?: string; body?: string } | undefined
    if (brandAssets.titleFontFamily || brandAssets.bodyFontFamily) {
      const customFonts = await db.customFont.findMany({
        where: { projectId: body.projectId },
        select: { fontFamily: true, fileUrl: true },
      })
      const fontMap = Object.fromEntries(customFonts.map((f) => [f.fontFamily, f.fileUrl]))
      fontUrls = {
        title: brandAssets.titleFontFamily ? fontMap[brandAssets.titleFontFamily] : undefined,
        body: brandAssets.bodyFontFamily ? fontMap[brandAssets.bodyFontFamily] : undefined,
      }
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
