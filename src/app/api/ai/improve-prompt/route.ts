import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { validateCreditsForFeature, deductCreditsForFeature, refundCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'

export const runtime = 'nodejs'
export const maxDuration = 30

const SYSTEM_PROMPT = `Você é um especialista em criar prompts para geração de imagens com IA.

REGRAS:
1. NÃO INVENTE conceitos que o usuário não mencionou
2. INTERPRETE corretamente a intenção do usuário
3. ORGANIZE a ideia em linguagem visual objetiva
4. TRADUZA sensações subjetivas em elementos visuais concretos:
   - "sofisticado" → iluminação suave, tons neutros, composição limpa
   - "rústico" → texturas naturais, madeira, cores terrosas
   - "impactante" → alto contraste, cores vibrantes, composição dinâmica
   - "elegante" → linhas limpas, paleta monocromática, minimalismo
   - "aconchegante" → luz quente, tons terrosos, elementos naturais
   - "moderno" → formas geométricas, superfícies lisas, tons frios
   - "vibrante" → cores saturadas, alto contraste, energia visual

ESTRUTURA DO PROMPT MELHORADO:
1. Sujeito principal (o que está na imagem)
2. Estilo visual (fotográfico, ilustrado, minimalista, etc.)
3. Iluminação e ambiente (natural, estúdio, dramática, etc.)
4. Cores predominantes
5. Composição/enquadramento (close-up, plano aberto, vista aérea, etc.)

IMPORTANTE:
- Mantenha a essência da ideia original
- Seja específico mas conciso
- Use linguagem visual clara e objetiva
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
      // Call Gemini to improve the prompt
      const { text } = await generateText({
        model: google('gemini-2.0-flash-exp'),
        system: SYSTEM_PROMPT,
        prompt: `Melhore este prompt para geração de imagem:\n\n"${prompt}"`,
        temperature: 0.7,
        maxOutputTokens: 500,
      })

      const improvedPrompt = text.trim()
      console.log('[Improve Prompt] Success, improved length:', improvedPrompt.length)

      return NextResponse.json({
        success: true,
        improvedPrompt,
      })
    } catch (providerError) {
      // Refund credits on provider error
      console.error('[Improve Prompt] Provider error:', providerError)
      await refundCreditsForFeature({
        clerkUserId: userId,
        feature: 'ai_text_chat',
        quantity: 1,
        reason: 'improve_prompt_provider_error',
        details: { error: String(providerError) },
        organizationId: orgId ?? undefined,
      })

      return NextResponse.json(
        { error: 'Erro ao processar com IA. Tente novamente.' },
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
