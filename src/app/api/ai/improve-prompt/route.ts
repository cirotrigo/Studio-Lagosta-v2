import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { validateCreditsForFeature, deductCreditsForFeature, refundCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'
import { googleDriveService } from '@/server/google-drive-service'

export const runtime = 'nodejs'
export const maxDuration = 60

// Aspect ratio descriptions for the system prompt (in English for better AI generation)
const ASPECT_RATIO_SPECS: Record<string, { ratio: string; description: string; framing: string }> = {
  '1:1': {
    ratio: '1:1 square',
    description: 'square format ideal for feed posts',
    framing: 'centered composition with equal visual weight on all sides'
  },
  '16:9': {
    ratio: '16:9 landscape',
    description: 'horizontal/landscape format ideal for banners and covers',
    framing: 'wide horizontal composition with subjects positioned using rule of thirds'
  },
  '9:16': {
    ratio: '9:16 portrait',
    description: 'vertical/portrait format ideal for stories and reels',
    framing: 'vertical composition with main subject in the center-lower third, allowing headroom for text overlays'
  },
  '4:5': {
    ratio: '4:5 portrait',
    description: 'slightly vertical format ideal for Instagram feed posts',
    framing: 'portrait orientation with subject centered, slight negative space at top'
  },
}

function buildSystemPrompt(aspectRatio: string, hasImages: boolean): string {
  const spec = ASPECT_RATIO_SPECS[aspectRatio] || ASPECT_RATIO_SPECS['9:16']

  const imageAnalysisSection = hasImages ? `
# REFERENCE IMAGE ANALYSIS (CRITICAL)
The user has provided reference images. You MUST:
1. **Identify every product/object** in the reference images (brand, type, color, shape, packaging, labels)
2. **Describe specific visual details** you see: textures, colors, materials, labels, branding elements
3. **Incorporate these exact objects** into your improved prompt with precise descriptions
4. **Match the style/mood** of the reference images if they suggest a particular aesthetic
5. **Describe products as they appear** - don't guess or change product details, describe what you see
6. If reference images show food/drinks, note specific presentation details (garnishes, glassware, plating style)
7. Your improved prompt should ensure the AI generates an image featuring these EXACT products/items with accurate visual representation
` : ''

  return `# Role
You are a professional Director of Photography specialized in Food Styling and AI Prompt Engineering for generative image models.

# Objective
Transform simple user requests (in Portuguese) into highly technical, descriptive prompts in ENGLISH that will generate photorealistic product/food images.${hasImages ? ' You have reference images to analyze - use them to create an accurate, detailed prompt that preserves the exact products and visual elements shown.' : ' When reference images are provided, ensure all objects appear to have been photographed in the same session with consistent lighting and camera settings.'}

# Input Context
- User description: Will be provided in Portuguese
- Format: ${spec.ratio} (${spec.description})
- Framing guidance: ${spec.framing}
- Reference images: ${hasImages ? 'PROVIDED - analyze them carefully and incorporate specific product details' : 'None provided'}
${imageAnalysisSection}
# Output Requirements
Generate a prompt in ENGLISH containing:

1. **Subject and Scene:** Describe the scene integrating all mentioned elements naturally.${hasImages ? ' Include specific details from the reference images (product names, brands, colors, packaging details).' : ''} Keep the essence of what the user requested - do NOT invent concepts they didn't mention.

2. **Art Direction (CRITICAL for unified look):**
   - Define lighting that "glues" objects to the scene (e.g., "warm golden hour side lighting", "soft diffused window light", "moody bar indoor lighting")
   - Lighting must be consistent across ALL objects - specify shadows, reflections, ambient light as scene-wide attributes
   - Request "shadows cast from one object onto another" when multiple items exist

3. **Camera Specifications (for realism):**
   - Lens: 85mm for product close-ups, 50mm for table scenes, 35mm for wider environments
   - Aperture: f/1.8-f/2.8 for shallow depth of field, f/4-f/5.6 for sharper scenes
   - Camera reference: "shot on Sony A7R IV" or "Canon EOS R5"

4. **Texture and Details:**
   - For beverages: "condensation droplets", "cold mist", "foam texture"
   - For food: "crispy texture", "glistening sauce", "steam rising", "subsurface scattering"
   - For products: "reflective surfaces", "material texture visible", "micro-details"

5. **Style Tags:** "Award-winning food photography", "commercial aesthetic", "8k resolution", "highly detailed", "photorealistic"

6. **Focus Control:** If user mentions focus preference, specify "shallow depth of field, sharp focus on [main subject], [secondary elements] slightly blurred in background"

# Translation of Portuguese Mood Words
- "sofisticado" → soft rim lighting, neutral tones, clean minimalist composition
- "rústico" → natural textures, warm wood surfaces, earthy color palette, rustic props
- "impactante" → high contrast, vibrant colors, dynamic diagonal composition
- "elegante" → clean lines, monochromatic palette, negative space, refined styling
- "aconchegante" → warm tungsten lighting, earth tones, cozy atmosphere, intimate framing
- "moderno" → geometric shapes, sleek surfaces, cool tones, contemporary styling
- "vibrante" → saturated colors, high contrast, energetic visual composition

# Example Transformation
Input (Portuguese): "Brinde com chopp e foco no petisco"
Output (English): "Hyper-realistic close-up shot of a social toast in a dimly lit rustic gastropub. Foreground sharp focus on artisan snack with visible crispy golden texture. In the slight background, a hand holding a glass of draft beer with cold condensation droplets, slightly blurred. Cinematic warm lighting from the side, soft amber bokeh background, shadows cast consistently across table surface. Shot on Sony A7R IV, 85mm lens, f/2.8, ${spec.ratio} format, award-winning food photography, appetizing, highly detailed textures, unified lighting environment, 8k resolution."

# CRITICAL RULES
- NEVER add concepts the user didn't mention${hasImages ? ' (but DO include specific product details visible in reference images)' : ''}
- ALWAYS include format specification (${spec.ratio})
- ALWAYS include camera/lens specs for realism
- ALWAYS unify lighting description for all elements in scene
- Keep it concise but technically complete (aim for 50-100 words)${hasImages ? '\n- ALWAYS reference specific visual details from the provided images' : ''}

# OUTPUT FORMAT (MANDATORY)
You MUST return EXACTLY this JSON format with no additional text:
{
  "pt": "Prompt melhorado em português brasileiro, descritivo e fácil de entender para o usuário",
  "en": "Technical improved prompt in English with all camera specs and photography terminology"
}

The "pt" version should be a natural, readable description in Portuguese that the user can understand.
The "en" version should be the full technical prompt with camera specs, lighting details, and industry terminology.

Example output:
{
  "pt": "Foto hiper-realista de um brinde em um gastropub rústico com iluminação baixa. Foco nítido no petisco artesanal com textura crocante dourada visível. Ao fundo levemente desfocado, uma mão segurando um copo de chopp com gotículas de condensação. Iluminação cinematográfica lateral quente, bokeh âmbar suave.",
  "en": "Hyper-realistic close-up shot of a social toast in a dimly lit rustic gastropub. Foreground sharp focus on artisan snack with visible crispy golden texture. In the slight background, a hand holding a glass of draft beer with cold condensation droplets, slightly blurred. Cinematic warm lighting from the side, soft amber bokeh background, shadows cast consistently across table surface. Shot on Sony A7R IV, 85mm lens, f/2.8, ${spec.ratio} format, award-winning food photography, appetizing, highly detailed textures, unified lighting environment, 8k resolution."
}`
}

const improvePromptSchema = z.object({
  prompt: z.string().min(1, 'Prompt é obrigatório').max(2000, 'Prompt muito longo'),
  projectId: z.number().int().positive(),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:5']).optional().default('9:16'),
  referenceImages: z.array(z.string()).max(5, 'Máximo de 5 imagens de referência').optional(),
})

/**
 * Extract file ID from Google Drive internal API URL
 */
function extractGoogleDriveFileId(url: string): string | null {
  const match = url.match(/\/api\/(?:google-drive\/image|drive\/thumbnail)\/([^/?]+)/)
  return match?.[1] ?? null
}

/**
 * Fetch image from a URL and return as buffer with mime type
 */
async function fetchImageAsBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    // Check if it's a Google Drive internal URL
    const driveFileId = extractGoogleDriveFileId(url)
    if (driveFileId) {
      if (!googleDriveService.isEnabled()) {
        console.warn('[Improve Prompt] Google Drive not configured, skipping image:', url)
        return null
      }

      const { stream, mimeType } = await googleDriveService.getFileStream(driveFileId)
      const chunks: Buffer[] = []
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const buffer = Buffer.concat(chunks)
      return { buffer, mimeType }
    }

    // Regular URL fetch
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!response.ok) {
      console.warn('[Improve Prompt] Failed to fetch image:', url, response.status)
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const mimeType = response.headers.get('content-type') || 'image/jpeg'

    // Skip images larger than 5MB for prompt improvement (they'll be sent inline)
    if (buffer.length > 5 * 1024 * 1024) {
      console.warn('[Improve Prompt] Image too large, skipping:', (buffer.length / (1024 * 1024)).toFixed(1), 'MB')
      return null
    }

    return { buffer, mimeType }
  } catch (error) {
    console.warn('[Improve Prompt] Error fetching image:', url, error instanceof Error ? error.message : error)
    return null
  }
}

export async function POST(request: Request) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { prompt, projectId, aspectRatio, referenceImages } = improvePromptSchema.parse(body)

    const hasReferenceImages = referenceImages && referenceImages.length > 0
    console.log('[Improve Prompt] Starting for user:', userId, 'prompt length:', prompt.length, 'images:', referenceImages?.length || 0)

    // Validate credits (1 credit for text generation)
    try {
      await validateCreditsForFeature(userId, 'ai_text_chat', 1, {
        organizationId: orgId ?? undefined,
      })
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { error: 'Créditos insuficientes', required: err.required, available: err.available },
          { status: 402 }
        )
      }
      throw err
    }

    // Deduct credits before calling LLM
    await deductCreditsForFeature({
      clerkUserId: userId,
      feature: 'ai_text_chat',
      quantity: 1,
      details: {
        action: 'improve_prompt',
        originalPrompt: prompt.substring(0, 100),
        projectId,
        referenceImageCount: referenceImages?.length || 0,
      },
      organizationId: orgId ?? undefined,
      projectId,
    })

    try {
      // Fetch reference images as buffers for multimodal analysis
      let imageBuffers: Array<{ buffer: Buffer; mimeType: string }> = []
      if (hasReferenceImages) {
        console.log('[Improve Prompt] Fetching reference images for analysis...')
        const results = await Promise.all(referenceImages.map(fetchImageAsBuffer))
        imageBuffers = results.filter((r): r is { buffer: Buffer; mimeType: string } => r !== null)
        console.log('[Improve Prompt] Successfully fetched', imageBuffers.length, 'of', referenceImages.length, 'images')
      }

      const hasImages = imageBuffers.length > 0
      const systemPrompt = buildSystemPrompt(aspectRatio, hasImages)

      // Build multimodal content for Gemini
      const userContent: Array<{ type: 'text'; text: string } | { type: 'image'; image: Buffer; mimeType: string }> = []

      // Add reference images first so the model sees them before the prompt
      for (const img of imageBuffers) {
        userContent.push({
          type: 'image' as const,
          image: img.buffer,
          mimeType: img.mimeType,
        })
      }

      // Add the text prompt
      const imageContext = hasImages
        ? `\n\nAs imagens de referência acima mostram os produtos/objetos que devem aparecer na imagem gerada. Analise-as cuidadosamente e incorpore os detalhes visuais específicos no prompt melhorado.`
        : ''
      userContent.push({
        type: 'text' as const,
        text: `Melhore este prompt para geração de imagem:\n\n"${prompt}"${imageContext}`,
      })

      // Use Gemini Flash for multimodal prompt improvement
      const { text } = await generateText({
        model: google('gemini-2.5-flash'),
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userContent,
          },
        ],
        temperature: 0.7,
        maxOutputTokens: 2000, // Increased to avoid truncation of bilingual output
      })

      const rawText = text.trim()
      console.log('[Improve Prompt] Raw response length:', rawText.length, 'chars')
      console.log('[Improve Prompt] Raw response preview:', rawText.substring(0, 300))

      // Parse JSON response with both versions
      let improvedPromptPt: string
      let improvedPromptEn: string

      try {
        // Remove markdown code blocks if present (```json ... ``` or ``` ... ```)
        let cleanedText = rawText
          .replace(/^```(?:json)?\s*\n?/i, '')
          .replace(/\n?```\s*$/i, '')
          .trim()

        // Try to extract JSON from the response
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          throw new Error('No JSON found in response')
        }

        const parsed = JSON.parse(jsonMatch[0])
        improvedPromptPt = parsed.pt || parsed.PT || ''
        improvedPromptEn = parsed.en || parsed.EN || ''

        if (!improvedPromptPt || !improvedPromptEn) {
          throw new Error('Missing pt or en in response')
        }
      } catch (parseError) {
        // Fallback: try to extract content more gracefully
        console.warn('[Improve Prompt] JSON parse failed:', parseError)

        // Try to extract "pt" value directly with regex
        const ptMatch = rawText.match(/"pt"\s*:\s*"((?:[^"\\]|\\.)*)"/)
        const enMatch = rawText.match(/"en"\s*:\s*"((?:[^"\\]|\\.)*)"/)


        if (ptMatch && enMatch) {
          // Unescape JSON string escapes
          improvedPromptPt = ptMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
          improvedPromptEn = enMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
          console.log('[Improve Prompt] Recovered from partial JSON via regex')
        } else {
          // Last resort: use raw text cleaned of JSON artifacts
          const cleanText = rawText
            .replace(/^[\s\S]*?"pt"\s*:\s*"/i, '')
            .replace(/",?\s*"en"\s*:[\s\S]*$/i, '')
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .trim()

          if (cleanText && cleanText.length > 20) {
            improvedPromptPt = cleanText
            improvedPromptEn = cleanText
            console.log('[Improve Prompt] Using cleaned text as fallback')
          } else {
            // Absolute fallback: return original prompt with enhancement note
            improvedPromptPt = `${prompt} - foto profissional com iluminação cinematográfica, alta resolução, detalhes nítidos`
            improvedPromptEn = `${prompt} - professional photography with cinematic lighting, high resolution, sharp details, 8k, photorealistic`
            console.log('[Improve Prompt] Using minimal enhancement fallback')
          }
        }
      }

      console.log('[Improve Prompt] Success - PT:', improvedPromptPt.length, 'chars, EN:', improvedPromptEn.length, 'chars, images analyzed:', imageBuffers.length)

      return NextResponse.json({
        success: true,
        improvedPrompt: improvedPromptPt, // Backwards compatibility
        improvedPromptPt,
        improvedPromptEn,
      })
    } catch (providerError: unknown) {
      // Refund credits on provider error
      const errorDetails = {
        message: (providerError as Error)?.message,
        name: (providerError as Error)?.name,
        cause: (providerError as { cause?: unknown })?.cause,
        stack: (providerError as Error)?.stack?.split('\n').slice(0, 5).join('\n'),
      }
      console.error('[Improve Prompt] Provider error:', JSON.stringify(errorDetails, null, 2))

      await refundCreditsForFeature({
        clerkUserId: userId,
        feature: 'ai_text_chat',
        quantity: 1,
        reason: 'improve_prompt_provider_error',
        details: { error: errorDetails.message || String(providerError) },
        organizationId: orgId ?? undefined,
      })

      // Return more details in development
      const isDev = process.env.NODE_ENV === 'development'
      return NextResponse.json(
        {
          error: 'Erro ao processar com IA. Tente novamente.',
          ...(isDev && { details: errorDetails.message })
        },
        { status: 502 }
      )
    }
  } catch (error) {
    console.error('[Improve Prompt] Error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      )
    }

    const errorMessage = error instanceof Error ? error.message : String(error)

    if (errorMessage.includes('créditos') || errorMessage.includes('credits') || errorMessage.includes('Insufficient')) {
      return NextResponse.json({ error: errorMessage }, { status: 402 })
    }

    return NextResponse.json(
      { error: 'Erro ao melhorar descrição. Tente novamente.' },
      { status: 500 }
    )
  }
}
