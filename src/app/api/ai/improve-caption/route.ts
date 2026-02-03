import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { validateCreditsForFeature, deductCreditsForFeature, refundCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'

export const runtime = 'nodejs'
export const maxDuration = 30

// Post type descriptions for context
const POST_TYPE_CONTEXT: Record<string, string> = {
  'POST': 'um post de feed do Instagram (imagem única)',
  'STORY': 'um story do Instagram (24h de duração, conteúdo mais casual)',
  'REEL': 'um reel do Instagram (vídeo curto, formato vertical, dinâmico)',
  'CAROUSEL': 'um carrossel do Instagram (múltiplas imagens, contar uma história)',
}

function buildSystemPrompt(postType: string): string {
  const typeContext = POST_TYPE_CONTEXT[postType] || POST_TYPE_CONTEXT['POST']

  return `# Role
Você é um especialista em Social Media Marketing, especializado em criar legendas engajadoras para Instagram.

# Objetivo
Transformar uma legenda simples em uma legenda otimizada para ${typeContext}, mantendo a essência da mensagem original mas tornando-a mais engajadora e eficaz.

# Contexto
- Tipo de post: ${postType} (${typeContext})
- Plataforma: Instagram
- Objetivo: Aumentar engajamento, alcance e conexão com a audiência

# Diretrizes de Criação

1. **Hook Inicial (Primeira Linha)**
   - Comece com uma frase impactante que pare o scroll
   - Use perguntas, afirmações ousadas ou curiosidades
   - Máximo de 125 caracteres na primeira linha (visível antes do "ver mais")

2. **Corpo da Legenda**
   - Conte uma micro-história ou compartilhe um insight valioso
   - Use linguagem conversacional e autêntica
   - Inclua um benefício claro para quem está lendo
   - Quebras de linha para facilitar a leitura

3. **Call-to-Action (CTA)**
   - Inclua uma pergunta ou convite à interação
   - Exemplos: "Comenta aqui", "Salva esse post", "Marca quem precisa ver"

4. **Hashtags Estratégicas**
   - Sugira 5-10 hashtags relevantes ao final
   - Mix de hashtags populares e de nicho
   - Separe com uma linha em branco antes das hashtags

5. **Emojis**
   - Use emojis de forma estratégica para destacar pontos importantes
   - Não exagere - 3 a 5 emojis por legenda é ideal
   - Emojis no início de linhas funcionam como bullet points visuais

# Regras Específicas por Tipo

${postType === 'STORY' ? `
**Para Stories:**
- Legendas mais curtas e diretas
- Tom mais casual e urgente
- Foco em interação rápida (enquetes, perguntas)
- Sem hashtags (não aparecem em stories)
` : ''}

${postType === 'REEL' ? `
**Para Reels:**
- Hook MUITO forte nas primeiras palavras
- Legenda complementa o vídeo, não repete
- Hashtags importantes para descoberta
- CTA para assistir até o final ou seguir
` : ''}

${postType === 'CAROUSEL' ? `
**Para Carrossel:**
- Gere curiosidade para passar os slides
- Mencione "Arrasta para o lado" ou similar
- Resumo do conteúdo na legenda
- CTA para salvar (carrosséis salvos = alcance)
` : ''}

# REGRAS CRÍTICAS
- NUNCA invente informações que não estavam na legenda original
- Mantenha o tom e personalidade da marca
- A legenda deve parecer natural, não robótica
- Retorne APENAS a legenda melhorada, sem explicações
- Use português brasileiro

# Formato de Saída
Retorne apenas a legenda melhorada em português, pronta para copiar e colar no Instagram.`
}

const improveCaptionSchema = z.object({
  caption: z.string().min(1, 'Legenda é obrigatória').max(2200, 'Máximo de 2200 caracteres'),
  projectId: z.number().int().positive(),
  postType: z.enum(['POST', 'STORY', 'REEL', 'CAROUSEL']).optional().default('POST'),
})

export async function POST(request: Request) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { caption, projectId, postType } = improveCaptionSchema.parse(body)

    console.log('[Improve Caption] Starting for user:', userId, 'caption length:', caption.length, 'postType:', postType)

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
        action: 'improve_caption',
        originalCaption: caption.substring(0, 100),
        postType,
        projectId,
      },
      organizationId: orgId ?? undefined,
      projectId,
    })

    try {
      const systemPrompt = buildSystemPrompt(postType)
      const { text } = await generateText({
        model: openai('gpt-4o-mini'),
        system: systemPrompt,
        prompt: `Melhore esta legenda para Instagram:\n\n"${caption}"`,
        temperature: 0.7,
        maxOutputTokens: 800,
      })

      const improvedCaption = text.trim()
      console.log('[Improve Caption] Success, improved length:', improvedCaption.length)

      return NextResponse.json({
        success: true,
        improvedCaption,
      })
    } catch (providerError: unknown) {
      const errorDetails = {
        message: (providerError as Error)?.message,
        name: (providerError as Error)?.name,
        cause: (providerError as { cause?: unknown })?.cause,
        stack: (providerError as Error)?.stack?.split('\n').slice(0, 5).join('\n'),
      }
      console.error('[Improve Caption] Provider error:', JSON.stringify(errorDetails, null, 2))

      await refundCreditsForFeature({
        clerkUserId: userId,
        feature: 'ai_text_chat',
        quantity: 1,
        reason: 'improve_caption_provider_error',
        details: { error: errorDetails.message || String(providerError) },
        organizationId: orgId ?? undefined,
      })

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
    console.error('[Improve Caption] Error:', error)

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
      { error: 'Erro ao melhorar legenda. Tente novamente.' },
      { status: 500 }
    )
  }
}
