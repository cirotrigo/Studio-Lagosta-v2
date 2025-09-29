import { NextResponse } from 'next/server'
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createMistral } from '@ai-sdk/mistral'
import { z } from 'zod'
import { validateUserAuthentication } from '@/lib/auth-utils'
import { InsufficientCreditsError } from '@/lib/credits/errors'
import { validateCreditsForFeature, deductCreditsForFeature, refundCreditsForFeature } from '@/lib/credits/deduct'
import { type FeatureKey } from '@/lib/credits/feature-config'

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })
const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY })
// OpenRouter is OpenAI-compatible
const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
})

function getModel(provider: string, model: string) {
  switch (provider) {
    case 'openai':
      return openai(model)
    case 'anthropic':
      return anthropic(model)
    case 'google':
      return google(model)
    case 'mistral':
      return mistral(model)
    case 'openrouter':
      return openrouter(model)
    default:
      throw new Error('Unsupported provider')
  }
}

const ProviderSchema = z.enum(['openai', 'anthropic', 'google', 'mistral', 'openrouter'])

// Known-safe models for direct providers. OpenRouter models are dynamic; validate format below.
const ALLOWED_MODELS: Record<z.infer<typeof ProviderSchema>, string[]> = {
  openai: ['gpt-5'],
  anthropic: ['claude-4-sonnet'],
  google: ['gemini-2.5-pro'],
  mistral: ['mistral-small-latest'],
  openrouter: [
    // Representative defaults; OpenRouter validated by pattern
    'openai/gpt-4o-mini',
    'anthropic/claude-3.5-sonnet',
    'google/gemini-2.0-flash-001',
    'mistralai/mistral-small',
  ],
}

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(20000),
})

const AttachmentSchema = z.object({ name: z.string().min(1).max(500), url: z.string().url() })

const BodySchema = z
  .object({
    provider: ProviderSchema,
    model: z.string().min(1),
    messages: z.array(MessageSchema).min(1),
    temperature: z.number().min(0).max(2).optional(),
    attachments: z.array(AttachmentSchema).optional(),
  })
  .strict()

function isAllowedModel(provider: z.infer<typeof ProviderSchema>, model: string) {
  if (provider === 'openrouter') {
    // Basic sanity for OpenRouter model IDs: vendor/model and restricted charset
    return /^[a-z0-9-]+\/[a-z0-9_.:-]+$/i.test(model) && model.length <= 100
  }
  return ALLOWED_MODELS[provider].includes(model)
}

export async function POST(req: Request) {
  try {
    // AuthN: require logged-in user for chat usage
    try {
      // clerk user id
      const userId = await validateUserAuthentication()
      // Pre-parse to also include in credits usage details if valid
      const parsed = BodySchema.safeParse(await req.json())
      if (!parsed.success) {
        return NextResponse.json({ error: 'Corpo da requisição inválido', issues: parsed.error.flatten() }, { status: 400 })
      }
      const { provider, model, messages, temperature = 0.4, attachments } = parsed.data

      if (!isAllowedModel(provider, model)) {
        return NextResponse.json({ error: 'Modelo não permitido para este provedor' }, { status: 400 })
      }

      // quick key presence check
      const missingKey =
        (provider === 'openai' && !process.env.OPENAI_API_KEY) ||
        (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) ||
        (provider === 'google' && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) ||
        (provider === 'mistral' && !process.env.MISTRAL_API_KEY) ||
        (provider === 'openrouter' && !process.env.OPENROUTER_API_KEY)

      if (missingKey) {
        return NextResponse.json({ error: `Chave API ausente para ${provider}.` }, { status: 400 })
      }

      // If there are attachments, append a user message listing them so the model can reference the files
      let mergedMessages = messages
      if (attachments && attachments.length > 0) {
        const lines = attachments.map(a => `- ${a.name}: ${a.url}`).join('\n')
        const attachNote = `Anexos:\n${lines}`
        mergedMessages = [...messages, { role: 'user' as const, content: attachNote }]
      }

      // Credits: 1 credit per LLM request
      const feature: FeatureKey = 'ai_text_chat'
      try {
        await validateCreditsForFeature(userId, feature)
        await deductCreditsForFeature({
          clerkUserId: userId,
          feature,
          details: { provider, model },
        })
      } catch (err: unknown) {
        if (err instanceof InsufficientCreditsError) {
          return NextResponse.json(
            { error: 'insufficient_credits', required: err.required, available: err.available },
            { status: 402 }
          )
        }
        throw err
      }

      try {
        const result = await streamText({
          model: getModel(provider, model),
          messages: mergedMessages,
          temperature,
        })
        return result.toAIStreamResponse()
      } catch (providerErr: unknown) {
        // Provider call failed after deduction — reimburse user
        await refundCreditsForFeature({
          clerkUserId: userId,
          feature,
          quantity: 1,
          reason: (providerErr as { message?: string })?.message || 'chat_provider_error',
          details: { provider, model },
        })
        return NextResponse.json({ error: 'Erro do provedor' }, { status: 502 })
      }
    } catch (e: unknown) {
      if ((e as { message?: string })?.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
      }
      throw e
    }
  } catch {
    // Avoid leaking provider errors verbosely
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
