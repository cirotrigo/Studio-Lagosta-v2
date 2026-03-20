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
# REFERENCE IMAGE ANALYSIS (MANDATORY - HIGHEST PRIORITY)
The user has provided reference images. These are the ONLY source of truth for objects in the scene.

**YOU MUST:**
1. **REPRODUCE EXACTLY** what you see in the reference images - same products, same environment, same setting
2. **DESCRIBE ONLY what exists** in the reference images - do NOT invent or add any objects, props, or elements
3. **PRESERVE the exact environment/setting** shown in the references (same table, same background, same surfaces)
4. **MAINTAIN product identity** - if you see a specific brand, packaging, or product, describe it exactly as shown
5. **COPY the lighting mood** from the reference images - don't change the atmosphere

**YOU MUST NOT:**
- Add decorative elements not present in references (candles, flowers, extra props, etc.)
- Change the environment or setting
- Add food items not shown in references
- Invent "complementary" objects
- Suggest "enhancements" or "additions" to the scene
` : ''

  return `# Role
You are a professional photographer assistant specialized in recreating real product photos with AI.

# Objective
Transform the user's simple request into a technical prompt that will FAITHFULLY REPRODUCE the products and environment from the reference images.${hasImages ? ' Your job is to PRESERVE what exists, not to be creative.' : ''}

# GOLDEN RULE
**ONLY describe what the user explicitly requested + what is visible in reference images. NEVER invent elements.**

# Input Context
- User description: Will be provided in Portuguese (this defines the action/arrangement, NOT the objects)
- Format: ${spec.ratio} (${spec.description})
- Framing guidance: ${spec.framing}
- Reference images: ${hasImages ? 'PROVIDED - these define EXACTLY what objects/products should appear' : 'None provided'}
${imageAnalysisSection}
# Output Requirements
Generate a prompt in ENGLISH containing:

1. **Products/Objects (FROM REFERENCES ONLY):**${hasImages ? `
   - List ONLY the exact products visible in the reference images
   - Describe them exactly as they appear (brand, color, packaging, labels)
   - Do NOT add any products or props not shown in references` : `
   - Describe only what the user mentioned
   - Do NOT add extra elements or decorations`}

2. **Environment (FROM REFERENCES ONLY):**${hasImages ? `
   - Describe the SAME surface/table/background from the reference images
   - Maintain the exact setting and atmosphere
   - Do NOT change the environment` : `
   - Keep the environment minimal unless user specifies`}

3. **Technical Photography Specs:**
   - Lens: 85mm for product close-ups, 50mm for table scenes
   - Aperture: f/2.8 for shallow depth, f/4 for sharper scenes
   - Camera: "shot on Sony A7R IV"
   - Style: "photorealistic, 8k resolution, professional product photography"

4. **Lighting (MATCH REFERENCES):**${hasImages ? `
   - Describe lighting that matches the reference images mood
   - Keep the same warm/cool tone as references` : `
   - Use neutral professional product lighting`}

# CRITICAL RULES - READ CAREFULLY
1. **NEVER add objects not requested by user or shown in references**
2. **NEVER add decorative props** (candles, flowers, napkins, utensils) unless explicitly shown
3. **NEVER "enhance" or "complete" the scene** with your own ideas
4. **ALWAYS preserve the exact products** from reference images
5. **ALWAYS maintain the same environment/setting** from references
6. Keep prompts focused but complete: 80-150 words
7. Include format specification (${spec.ratio})

# What the user prompt defines:
- The ACTION or ARRANGEMENT (e.g., "product in center", "close-up of the drink")
- The MOOD if specified (e.g., "elegante", "rústico")
- The FOCUS if specified (e.g., "foco no produto")

# What the reference images define:
- WHICH products/objects appear in the scene
- WHICH environment/surface/background to use
- The overall lighting mood and atmosphere

# OUTPUT FORMAT (MANDATORY)
Return EXACTLY this JSON format with no additional text:
{
  "pt": "Descrição simples em português do que será gerado (sem termos técnicos)",
  "en": "Technical prompt in English with camera specs - ONLY describing elements from references + user request"
}

Example with references showing a beer bottle on wooden table:
User input: "close-up do produto"
{
  "pt": "Close-up da garrafa de cerveja sobre a mesa de madeira, com foco nítido no produto.",
  "en": "Close-up product shot of beer bottle on rustic wooden table surface, sharp focus on bottle label and condensation droplets, same warm ambient lighting as reference, shot on Sony A7R IV, 85mm lens, f/2.8, ${spec.ratio} format, photorealistic, 8k resolution."
}

Notice: NO extra elements were added. Only the beer bottle and wooden table from the reference were described.`
}

const improvePromptSchema = z.object({
  prompt: z.string().min(1, 'Prompt é obrigatório').max(2000, 'Prompt muito longo'),
  projectId: z.number().int().positive(),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:5']).optional().default('9:16'),
  referenceImages: z.array(z.string()).max(14, 'Máximo de 14 imagens de referência').optional(),
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

        // Try multiple extraction strategies

        // Strategy 1: Try to extract with greedy regex (handles longer texts)
        // Look for "pt": " ... " (stops at ", "en" or end of object)
        const ptGreedyMatch = rawText.match(/"pt"\s*:\s*"([\s\S]*?)"\s*,\s*"en"/)
        const enGreedyMatch = rawText.match(/"en"\s*:\s*"([\s\S]*?)"\s*\}/)

        if (ptGreedyMatch && enGreedyMatch) {
          // Unescape JSON string escapes
          improvedPromptPt = ptGreedyMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim()
          improvedPromptEn = enGreedyMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim()
          console.log('[Improve Prompt] Recovered via greedy regex - PT:', improvedPromptPt.length, 'chars, EN:', improvedPromptEn.length, 'chars')
        } else {
          // Strategy 2: Try simple regex for each field
          const ptMatch = rawText.match(/"pt"\s*:\s*"((?:[^"\\]|\\.)*)"/)
          const enMatch = rawText.match(/"en"\s*:\s*"((?:[^"\\]|\\.)*)"/)

          if (ptMatch && enMatch) {
            improvedPromptPt = ptMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim()
            improvedPromptEn = enMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim()
            console.log('[Improve Prompt] Recovered via simple regex')
          } else {
            // Strategy 3: Last resort - extract text between quotes after "pt": and "en":
            const ptStart = rawText.indexOf('"pt"')
            const enStart = rawText.indexOf('"en"')

            if (ptStart !== -1 && enStart !== -1 && enStart > ptStart) {
              const ptSection = rawText.substring(ptStart, enStart)
              const enSection = rawText.substring(enStart)

              // Extract content between first and last quote
              const ptContent = ptSection.match(/"pt"\s*:\s*"([\s\S]+)"\s*,?\s*$/)
              const enContent = enSection.match(/"en"\s*:\s*"([\s\S]+)"\s*\}?\s*$/)

              if (ptContent && enContent) {
                improvedPromptPt = ptContent[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim()
                improvedPromptEn = enContent[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim()
                console.log('[Improve Prompt] Recovered via section extraction')
              } else {
                // Absolute fallback
                improvedPromptPt = `${prompt} - foto profissional com iluminação cinematográfica, alta resolução, detalhes nítidos`
                improvedPromptEn = `${prompt} - professional photography with cinematic lighting, high resolution, sharp details, 8k, photorealistic`
                console.log('[Improve Prompt] Using minimal enhancement fallback')
              }
            } else {
              // Absolute fallback
              improvedPromptPt = `${prompt} - foto profissional com iluminação cinematográfica, alta resolução, detalhes nítidos`
              improvedPromptEn = `${prompt} - professional photography with cinematic lighting, high resolution, sharp details, 8k, photorealistic`
              console.log('[Improve Prompt] Using minimal enhancement fallback')
            }
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
