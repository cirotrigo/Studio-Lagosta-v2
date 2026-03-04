import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { z } from 'zod'
import { generateObject, generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import sharp from 'sharp'

export const runtime = 'nodejs'
export const maxDuration = 240 // 4 minutes for Gemini + Ideogram + Vision sequencial

// --- Constants ---

const FORMAT_DIMENSIONS: Record<string, { width: number; height: number; label: string }> = {
  FEED_PORTRAIT: { width: 1080, height: 1350, label: 'feed retrato (1080x1350)' },
  STORY: { width: 1080, height: 1920, label: 'story vertical (1080x1920)' },
  SQUARE: { width: 1024, height: 1024, label: 'quadrado (1024x1024)' },
}

const IDEOGRAM_ASPECT_RATIOS: Record<string, string> = {
  FEED_PORTRAIT: 'ASPECT_4_5',
  STORY: 'ASPECT_9_16',
  SQUARE: 'ASPECT_1_1',
}

const IDEOGRAM_API_URL = 'https://api.ideogram.ai'
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent'

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

interface IdeogramImage {
  url: string
  seed: number
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

function buildIdeogramPromptSystemPrompt(
  brandAssets: BrandAssets,
  format: string,
  usePhoto: boolean,
): string {
  const formatInfo = FORMAT_DIMENSIONS[format]
  const colorList = brandAssets.colors.length > 0
    ? brandAssets.colors.join(', ')
    : 'não definidas (usar tons neutros e elegantes)'

  return `You are a professional graphic designer specialized in creating visual art for restaurants and food establishments.

BRAND DATA:
- Establishment name: ${brandAssets.name}
- Brand colors (hex): ${colorList}
- Visual style: ${brandAssets.styleDescription || 'modern, elegant and professional'}
- Cuisine type: ${brandAssets.cuisineType || 'not specified'}
- Art format: ${formatInfo.label}

YOUR TASK:
Convert the user's text into a technical prompt optimized for Ideogram V3 image generation.

CRITICAL RULES:
1. The image MUST NOT contain ANY text, letters, numbers, or watermarks
2. Leave clean empty space where text can be overlaid later
3. Describe the visual composition in detail (layout, element positioning, atmosphere)
4. Specify brand colors explicitly in the description
5. Establish mood and lighting
6. Mention the format ${formatInfo.label}
7. Use technical design language
${usePhoto ? '8. The art should feature food photography as the main visual element' : ''}

RESPONSE FORMAT:
Respond ONLY with the technical prompt in English, no additional explanations.
The prompt should be detailed but concise (maximum 300 words).
Always end with: "No text, no letters, no numbers, no watermarks in the image."`
}

function buildDualPromptSystemPrompt(
  brandAssets: BrandAssets,
  format: string,
  compositionPrompt: string | undefined,
): string {
  const formatInfo = FORMAT_DIMENSIONS[format]
  const colorList = brandAssets.colors.length > 0
    ? brandAssets.colors.join(', ')
    : 'não definidas (usar tons neutros e elegantes)'

  return `You are a professional graphic designer and food photographer. You need to generate TWO separate prompts.

BRAND DATA:
- Establishment name: ${brandAssets.name}
- Brand colors (hex): ${colorList}
- Visual style: ${brandAssets.styleDescription || 'modern, elegant and professional'}
- Cuisine type: ${brandAssets.cuisineType || 'not specified'}
- Art format: ${formatInfo.label}
${compositionPrompt ? `- Composition direction from user: ${compositionPrompt}` : ''}

Generate TWO prompts with these exact delimiters:

[IDEOGRAM_PROMPT]
A technical prompt for Ideogram V3 describing the final art visual. Focus on:
- Overall graphic design style, color scheme using brand colors
- Layout and visual composition for ${formatInfo.label}
- Atmosphere and mood
- NO text, NO letters, NO numbers, NO watermarks
- Leave clean space for text overlay
Maximum 300 words.
[/IDEOGRAM_PROMPT]

[SCENE_PROMPT]
A prompt for generating a photorealistic food photography scene. Focus on:
- Describe the physical scene setup (table, background, lighting)
- Food presentation and plating style
- Camera angle and depth of field
- Ambient lighting (natural, warm, studio)
${compositionPrompt ? `- Follow user direction: ${compositionPrompt}` : '- Professional restaurant ambiance'}
- ABSOLUTELY NO text, letters, numbers, or UI elements
Maximum 200 words.
[/SCENE_PROMPT]

Respond ONLY with the two delimited prompts, no additional text.`
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

// --- Ideogram API ---

async function callIdeogramGenerate(
  prompt: string,
  options: {
    aspectRatio: string
    numImages: number
    colors: string[]
    styleReferenceUrls?: string[]
  },
): Promise<IdeogramImage[]> {
  const apiKey = process.env.IDEOGRAM_API_KEY
  if (!apiKey) throw new Error('IDEOGRAM_API_KEY not configured')

  // Use legacy endpoint with JSON body + model V_3 (most reliable on Node.js)
  const imageRequest: Record<string, any> = {
    prompt,
    negative_prompt: 'text, letters, numbers, words, watermark, signature, typography, writing, captions, labels, logos, titles, subtitles',
    aspect_ratio: options.aspectRatio,
    model: 'V_3',
    magic_prompt_option: 'OFF',
    num_images: options.numImages,
    style_type: 'GENERAL',
  }

  // Color palette
  if (options.colors.length > 0) {
    imageRequest.color_palette = {
      members: options.colors.slice(0, 5).map((c) => ({ color_hex: c })),
    }
  }

  console.log('[generate-art] Calling Ideogram /generate (V_3 model)...')
  const response = await fetch(`${IDEOGRAM_API_URL}/generate`, {
    method: 'POST',
    headers: {
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image_request: imageRequest }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[generate-art] Ideogram error:', response.status, errorBody)
    if (response.status === 429) {
      throw new IdeogramError('rate_limit', 'Limite de requisições atingido. Tente novamente em alguns minutos.')
    }
    if (response.status === 400 && errorBody.includes('content_policy')) {
      throw new IdeogramError('content_policy', 'O conteúdo solicitado viola as políticas de uso. Tente reformular o texto.')
    }
    throw new Error(`Ideogram API error: ${response.status} - ${errorBody.substring(0, 200)}`)
  }

  const result = await response.json()
  console.log(`[generate-art] Ideogram returned ${result.data?.length || 0} images`)
  return (result.data || []) as IdeogramImage[]
}

// --- Nano Banana 2 (Gemini) ---

async function callNanoBanana2(
  scenePrompt: string,
  photoUrl: string,
): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not configured')

  // 1. Fetch the photo and convert to base64
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

  // 2. Call Gemini API
  console.log('[generate-art] Calling Nano Banana 2 (Gemini)...')
  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{
          text: 'You are a professional food photographer. Generate a photorealistic scene based on the description using the provided product photo as the main subject. The output must be a high-quality photographic image. ABSOLUTELY NO TEXT, NO LETTERS, NO NUMBERS, NO WATERMARKS, NO UI ELEMENTS in the generated image.',
        }],
      },
      contents: [{
        parts: [
          { text: scenePrompt },
          { inline_data: { mime_type: mimeType, data: photoBase64 } },
        ],
      }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        temperature: 0.4,
      },
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[generate-art] Gemini error:', response.status, errorBody)
    throw new Error(`Gemini API error: ${response.status}`)
  }

  const result = await response.json()

  // 3. Extract generated image from response
  const candidates = result.candidates || []
  for (const candidate of candidates) {
    for (const part of candidate.content?.parts || []) {
      if (part.inline_data?.data) {
        console.log('[generate-art] Gemini scene generated successfully')
        return Buffer.from(part.inline_data.data, 'base64')
      }
    }
  }

  throw new Error('Gemini did not return an image')
}

// --- Ideogram Remix ---

async function callIdeogramRemix(
  imageBuffer: Buffer,
  options: {
    prompt: string
    aspectRatio: string
    numImages: number
    colors: string[]
    styleReferenceUrls?: string[]
  },
): Promise<IdeogramImage[]> {
  const apiKey = process.env.IDEOGRAM_API_KEY
  if (!apiKey) throw new Error('IDEOGRAM_API_KEY not configured')

  // Use legacy endpoint with manual multipart (more reliable on Node.js than FormData+Blob)
  const imageRequest: Record<string, any> = {
    prompt: options.prompt,
    negative_prompt: 'text, letters, numbers, words, watermark, signature, typography, writing, captions, labels, logos, titles, subtitles',
    aspect_ratio: options.aspectRatio,
    model: 'V_3',
    magic_prompt_option: 'OFF',
    num_images: options.numImages,
    style_type: 'GENERAL',
    image_weight: 50,
  }

  if (options.colors.length > 0) {
    imageRequest.color_palette = {
      members: options.colors.slice(0, 5).map((c) => ({ color_hex: c })),
    }
  }

  // Build multipart form data manually with Buffer (reliable on Node.js)
  const boundary = `----IdeogramBoundary${Date.now()}`
  const parts: Buffer[] = []

  // image_file part
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image_file"; filename="scene.png"\r\nContent-Type: image/png\r\n\r\n`
  ))
  parts.push(imageBuffer)
  parts.push(Buffer.from('\r\n'))

  // image_request part (JSON)
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image_request"\r\nContent-Type: application/json\r\n\r\n`
  ))
  parts.push(Buffer.from(JSON.stringify(imageRequest)))
  parts.push(Buffer.from('\r\n'))

  // Close boundary
  parts.push(Buffer.from(`--${boundary}--\r\n`))

  const bodyBuffer = Buffer.concat(parts)

  console.log('[generate-art] Calling Ideogram /remix (V_3 model, manual multipart)...')
  const response = await fetch(`${IDEOGRAM_API_URL}/remix`, {
    method: 'POST',
    headers: {
      'Api-Key': apiKey,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: bodyBuffer,
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[generate-art] Ideogram remix error:', response.status, errorBody)
    if (response.status === 429) {
      throw new IdeogramError('rate_limit', 'Limite de requisições atingido. Tente novamente em alguns minutos.')
    }
    if (response.status === 400 && errorBody.includes('content_policy')) {
      throw new IdeogramError('content_policy', 'O conteúdo solicitado viola as políticas de uso. Tente reformular o texto.')
    }
    throw new Error(`Ideogram remix API error: ${response.status} - ${errorBody.substring(0, 200)}`)
  }

  const result = await response.json()
  console.log(`[generate-art] Ideogram remix returned ${result.data?.length || 0} images`)
  return (result.data || []) as IdeogramImage[]
}

// --- Error types ---

class IdeogramError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'IdeogramError'
  }
}

// --- Prompt parsing ---

function parseDualPrompts(text: string): { ideogramPrompt: string; scenePrompt: string } {
  const ideogramMatch = text.match(/\[IDEOGRAM_PROMPT\]([\s\S]*?)\[\/IDEOGRAM_PROMPT\]/)
  const sceneMatch = text.match(/\[SCENE_PROMPT\]([\s\S]*?)\[\/SCENE_PROMPT\]/)

  return {
    ideogramPrompt: ideogramMatch?.[1]?.trim() || text,
    scenePrompt: sceneMatch?.[1]?.trim() || 'Professional food photography scene, natural lighting, clean background',
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
      { error: 'Configuração de IA incompleta. Contate o administrador.' },
      { status: 503 }
    )
  }
  if (!process.env.IDEOGRAM_API_KEY) {
    return NextResponse.json(
      { error: 'Configuração do Ideogram incompleta. Contate o administrador.' },
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

    // --- Step 2: Generate image (without text) ---
    // Use photo path whenever a photo is provided, composition just adds extra prompt
    const hasPhoto = body.usePhoto && !!body.photoUrl
    const usePhotoPath = hasPhoto && !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
    let ideogramImages: IdeogramImage[] = []
    let provider = 'ideogram-3'
    let technicalPrompt = ''

    // Collect all style reference URLs
    const styleReferenceUrls = [
      ...brandAssets.referenceImageUrls,
      ...(body.compositionReferenceUrls || []),
    ].slice(0, 5)

    const imageOptions = {
      aspectRatio: IDEOGRAM_ASPECT_RATIOS[body.format],
      numImages: body.variations,
      colors: brandAssets.colors,
      styleReferenceUrls: styleReferenceUrls.length > 0 ? styleReferenceUrls : undefined,
    }

    if (usePhotoPath) {
      // --- Path B: Photo-based with Gemini + Ideogram Remix ---
      console.log('[generate-art] Step 2: Path B — Photo-based (Gemini + Ideogram Remix)')

      // Generate dual prompts (with optional composition direction)
      const dualSystemPrompt = buildDualPromptSystemPrompt(
        brandAssets,
        body.format,
        body.compositionEnabled ? body.compositionPrompt : undefined,
      )

      const { text: dualRawText } = await generateText({
        model: openai('gpt-4o-mini'),
        system: dualSystemPrompt,
        prompt: `Texto para a arte: "${body.text}"`,
        temperature: 0.7,
      })

      const { ideogramPrompt, scenePrompt } = parseDualPrompts(dualRawText)
      technicalPrompt = ideogramPrompt

      console.log('[generate-art] Ideogram prompt:', ideogramPrompt.substring(0, 100) + '...')
      console.log('[generate-art] Scene prompt:', scenePrompt.substring(0, 100) + '...')

      try {
        // Generate scene with Gemini using the user's photo
        const sceneBuffer = await callNanoBanana2(scenePrompt, body.photoUrl!)

        // Remix with Ideogram to apply brand style
        ideogramImages = await callIdeogramRemix(sceneBuffer, {
          prompt: ideogramPrompt,
          ...imageOptions,
        })
        provider = 'ideogram-3+gemini'
      } catch (compositionError) {
        // Fallback to Path A if Gemini/Remix fails
        console.warn('[generate-art] Photo path failed, falling back to Path A:', compositionError)
        ideogramImages = await callIdeogramGenerate(ideogramPrompt, imageOptions)
        provider = 'ideogram-3'
      }
    } else {
      // --- Path A: Simple generation with Ideogram (no photo) ---
      console.log('[generate-art] Step 2: Path A — Simple generation (Ideogram)')

      const systemPrompt = buildIdeogramPromptSystemPrompt(
        brandAssets,
        body.format,
        false,
      )

      const { text: prompt } = await generateText({
        model: openai('gpt-4o-mini'),
        system: systemPrompt,
        prompt: `Texto para a arte: "${body.text}"`,
        temperature: 0.7,
      })

      technicalPrompt = prompt
      console.log('[generate-art] Technical prompt:', prompt.substring(0, 200) + '...')

      ideogramImages = await callIdeogramGenerate(prompt, imageOptions)
    }

    if (ideogramImages.length === 0) {
      throw new Error('Nenhuma imagem foi gerada')
    }

    // --- Step 3: Position text with Vision ---
    console.log('[generate-art] Step 3: Positioning text with Vision...')
    const results: Array<{ imageUrl: string; prompt: string; textLayout?: TextLayout }> = []

    for (const img of ideogramImages) {
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
        prompt: img.prompt || technicalPrompt,
        textLayout,
      })
    }

    // --- Step 4: Build response ---
    // Fetch font URLs for custom fonts (if they exist in DB)
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

    return NextResponse.json({
      images: results,
      prompt: technicalPrompt,
      provider,
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

    if (error instanceof IdeogramError) {
      if (error.code === 'content_policy') {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      if (error.code === 'rate_limit') {
        return NextResponse.json({ error: error.message }, { status: 429 })
      }
    }

    return NextResponse.json(
      { error: 'Erro ao gerar arte. Tente novamente.', debug: errorMessage },
      { status: 500 }
    )
  }
}
