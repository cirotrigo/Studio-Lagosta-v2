import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { validateCreditsForFeature, deductCreditsForFeature, refundCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'

export const runtime = 'nodejs'
export const maxDuration = 30

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

function buildSystemPrompt(aspectRatio: string): string {
  const spec = ASPECT_RATIO_SPECS[aspectRatio] || ASPECT_RATIO_SPECS['9:16']

  return `# Role
You are a professional Director of Photography specialized in Food Styling and AI Prompt Engineering for generative image models.

# Objective
Transform simple user requests (in Portuguese) into highly technical, descriptive prompts in ENGLISH that will generate photorealistic product/food images. When reference images are provided, ensure all objects appear to have been photographed in the same session with consistent lighting and camera settings.

# Input Context
- User description: Will be provided in Portuguese
- Format: ${spec.ratio} (${spec.description})
- Framing guidance: ${spec.framing}
- Reference images: User may have provided 1-3 reference images of products

# Output Requirements
Generate a prompt in ENGLISH containing:

1. **Subject and Scene:** Describe the scene integrating all mentioned elements naturally. Keep the essence of what the user requested - do NOT invent concepts they didn't mention.

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
- NEVER add concepts the user didn't mention
- ALWAYS include format specification (${spec.ratio})
- ALWAYS include camera/lens specs for realism
- ALWAYS unify lighting description for all elements in scene
- Keep it concise but technically complete (aim for 50-100 words)

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
})

export async function POST(request: Request) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { prompt, projectId, aspectRatio } = improvePromptSchema.parse(body)

    console.log('[Improve Prompt] Starting for user:', userId, 'prompt length:', prompt.length)

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
        originalPrompt: prompt.substring(0, 100), // Log first 100 chars
        projectId,
      },
      organizationId: orgId ?? undefined,
      projectId,
    })

    try {
      // Call OpenAI to improve the prompt with aspect ratio context
      const systemPrompt = buildSystemPrompt(aspectRatio)
      const { text } = await generateText({
        model: openai('gpt-4o-mini'),
        system: systemPrompt,
        prompt: `Melhore este prompt para geração de imagem:\n\n"${prompt}"`,
        temperature: 0.7,
        maxOutputTokens: 800,
      })

      const rawText = text.trim()
      console.log('[Improve Prompt] Raw response:', rawText.substring(0, 200))

      // Parse JSON response with both versions
      let improvedPromptPt: string
      let improvedPromptEn: string

      try {
        // Try to extract JSON from the response (may have markdown code blocks)
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
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
        // Fallback: if JSON parsing fails, use the raw text for both (backwards compatibility)
        console.warn('[Improve Prompt] JSON parse failed, using raw text:', parseError)
        improvedPromptPt = rawText
        improvedPromptEn = rawText
      }

      console.log('[Improve Prompt] Success - PT:', improvedPromptPt.length, 'chars, EN:', improvedPromptEn.length, 'chars')

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
