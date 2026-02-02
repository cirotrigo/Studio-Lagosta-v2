import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { validateCreditsForFeature, deductCreditsForFeature, refundCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'

export const runtime = 'nodejs'
export const maxDuration = 30

const SYSTEM_PROMPT = `Você é um especialista em criar prompts para geração de imagens com IA para stories do Instagram.

REGRAS OBRIGATÓRIAS:
1. SEMPRE especifique formato vertical/portrait (9:16) ideal para stories
2. SEMPRE mencione que os produtos devem ser REALISTAS e fotográficos
3. SEMPRE indique que o ambiente deve ser CONSISTENTE com as imagens de referência
4. NÃO INVENTE conceitos que o usuário não mencionou
5. INTERPRETE corretamente a intenção do usuário
6. ORGANIZE a ideia em linguagem visual objetiva

TRADUÇÃO DE SENSAÇÕES:
- "sofisticado" → iluminação suave, tons neutros, composição limpa
- "rústico" → texturas naturais, madeira, cores terrosas
- "impactante" → alto contraste, cores vibrantes, composição dinâmica
- "elegante" → linhas limpas, paleta monocromática, minimalismo
- "aconchegante" → luz quente, tons terrosos, elementos naturais
- "moderno" → formas geométricas, superfícies lisas, tons frios
- "vibrante" → cores saturadas, alto contraste, energia visual

ESTRUTURA DO PROMPT MELHORADO:
1. Formato: vertical/portrait para stories (9:16)
2. Sujeito principal (produto realista e fotográfico)
3. Estilo visual (fotografia profissional de produto)
4. Iluminação e ambiente (consistente com referências)
5. Cores predominantes
6. Composição/enquadramento

IMPORTANTE:
- Mantenha a essência da ideia original
- Seja específico mas conciso
- Use linguagem visual clara e objetiva
- Produtos devem parecer reais como em fotos profissionais
- Ambiente deve manter consistência com imagens de referência
- Retorne APENAS o prompt melhorado, sem explicações adicionais`

const improvePromptSchema = z.object({
  prompt: z.string().min(1, 'Prompt é obrigatório').max(2000, 'Prompt muito longo'),
  projectId: z.number().int().positive(),
})

export async function POST(request: Request) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { prompt, projectId } = improvePromptSchema.parse(body)

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
      // Call OpenAI to improve the prompt
      const { text } = await generateText({
        model: openai('gpt-4o-mini'),
        system: SYSTEM_PROMPT,
        prompt: `Melhore este prompt para geração de imagem:\n\n"${prompt}"`,
        temperature: 0.7,
        maxTokens: 500,
      })

      const improvedPrompt = text.trim()
      console.log('[Improve Prompt] Success, improved length:', improvedPrompt.length)

      return NextResponse.json({
        success: true,
        improvedPrompt,
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
