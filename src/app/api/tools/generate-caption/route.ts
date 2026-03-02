import { auth } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 30

const TONE_MAP: Record<string, string> = {
  professional: 'profissional e sofisticado',
  casual: 'casual e descontraído',
  fun: 'divertido e criativo, com humor leve',
  inspirational: 'inspiracional e motivador',
}

const POST_TYPE_MAP: Record<string, string> = {
  POST: 'post de feed (imagem única)',
  STORY: 'story (conteúdo efêmero, mais casual)',
  REEL: 'reel (vídeo curto e dinâmico)',
  CAROUSEL: 'carrossel (múltiplas imagens, contar uma história)',
}

const requestSchema = z.object({
  context: z.string().min(1).max(500),
  postType: z.enum(['POST', 'STORY', 'REEL', 'CAROUSEL']).default('POST'),
  tone: z.enum(['professional', 'casual', 'fun', 'inspirational']).default('casual'),
  projectName: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await request.json()
    const { context, postType, tone, projectName } = requestSchema.parse(body)

    const toneDescription = TONE_MAP[tone]
    const postTypeDescription = POST_TYPE_MAP[postType]
    const projectLabel = projectName ? `do restaurante "${projectName}"` : 'de um restaurante'

    const systemPrompt = `Você é um especialista em marketing gastronômico e social media para restaurantes no Brasil.

Sua tarefa é gerar uma legenda criativa para ${postTypeDescription} no Instagram ${projectLabel}.

Tom desejado: ${toneDescription}

Diretrizes:
1. Comece com um hook que prenda a atenção (primeira linha impactante)
2. Desenvolva o tema com linguagem envolvente e autêntica
3. Use emojis de forma estratégica (3 a 5 no máximo)
4. Inclua um call-to-action claro no final
5. Máximo de 2200 caracteres
6. Use português brasileiro natural

${postType === 'STORY' ? 'Para stories: seja mais direto e casual, sem hashtags.' : ''}
${postType === 'CAROUSEL' ? 'Para carrossel: gere curiosidade para o próximo slide, mencione "arrasta para o lado".' : ''}
${postType === 'REEL' ? 'Para reels: hook muito forte, complementar ao vídeo, com hashtags para descoberta.' : ''}

Após a legenda, em uma linha separada, sugira 10 a 15 hashtags relevantes para gastronomia, restaurantes e o tema do post.

Formato da resposta:
[legenda aqui]

---
[hashtags aqui, separadas por espaço]`

    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      prompt: `Contexto do post: ${context}`,
      temperature: 0.8,
      maxOutputTokens: 1000,
    })

    return result.toTextStreamResponse()
  } catch (error) {
    console.error('[API] POST /api/tools/generate-caption error:', error)

    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: 'Invalid request data', details: error.errors }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Failed to generate caption' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
