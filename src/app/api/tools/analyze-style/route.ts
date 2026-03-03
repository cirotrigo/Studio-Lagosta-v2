import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { z } from 'zod'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 60 // 1 minute for vision analysis

const analyzeStyleSchema = z.object({
  projectId: z.number().int().positive(),
  imageUrls: z.array(z.string().url()).min(1).max(4, 'Máximo de 4 imagens permitidas'),
})

interface StyleAnalysisResponse {
  summary: string
  detectedElements: {
    layouts: string[]
    typography: string[]
    colorTones: string[]
    patterns: string[]
    mood: string
  }
  recommendations: string
}

const VISION_SYSTEM_PROMPT = `Você é um especialista em design gráfico e identidade visual, especializado em analisar artes para restaurantes e estabelecimentos gastronômicos.

Sua tarefa é analisar as imagens de referência fornecidas e extrair informações detalhadas sobre o estilo visual.

ANALISE OS SEGUINTES ASPECTOS:

1. LAYOUTS:
   - Composição (centralizado, assimétrico, grid, etc.)
   - Hierarquia visual
   - Uso de espaço negativo
   - Proporções e alinhamentos

2. TIPOGRAFIA:
   - Famílias tipográficas detectadas (serif, sans-serif, display, script)
   - Pesos e estilos (bold, light, italic)
   - Tratamento de títulos vs corpo de texto

3. TONS DE COR:
   - Paleta predominante (warm, cool, neutral)
   - Saturação (vibrant, muted, pastel)
   - Contraste (alto, baixo)
   - Esquema de cores (monocromático, complementar, análogo)

4. PADRÕES E ELEMENTOS:
   - Formas recorrentes (geométrico, orgânico)
   - Texturas
   - Elementos decorativos
   - Tratamento de imagens/fotos

5. MOOD/ATMOSFERA:
   - Sensação geral transmitida
   - Tom emocional (sofisticado, casual, divertido, luxuoso)
   - Público-alvo aparente

FORMATO DE RESPOSTA (JSON):
{
  "summary": "Descrição textual concisa do estilo visual (2-3 frases)",
  "detectedElements": {
    "layouts": ["lista", "de", "características"],
    "typography": ["lista", "de", "características"],
    "colorTones": ["lista", "de", "características"],
    "patterns": ["lista", "de", "características"],
    "mood": "descrição do mood em uma frase"
  },
  "recommendations": "Sugestões práticas para manter consistência visual (2-3 frases)"
}

Responda APENAS com o JSON válido, sem markdown ou explicações adicionais.`

export async function POST(request: Request) {
  const { userId, orgId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Validate OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'Configuração de IA incompleta. Contate o administrador.' },
      { status: 503 }
    )
  }

  // Parse and validate request
  let body: z.infer<typeof analyzeStyleSchema>
  try {
    const rawBody = await request.json()
    body = analyzeStyleSchema.parse(rawBody)
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

  try {
    console.log('[analyze-style] Analyzing', body.imageUrls.length, 'images with GPT-4o Vision...')

    const openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Build content array with images
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      {
        type: 'text',
        text: `Analise as seguintes ${body.imageUrls.length} imagens de referência para o projeto "${project.name}" e extraia o estilo visual:`,
      },
      ...body.imageUrls.map((url): OpenAI.Chat.Completions.ChatCompletionContentPartImage => ({
        type: 'image_url',
        image_url: {
          url,
          detail: 'high',
        },
      })),
    ]

    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: VISION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content,
        },
      ],
      max_tokens: 1500,
      temperature: 0.3,
    })

    const responseText = response.choices[0]?.message?.content
    if (!responseText) {
      throw new Error('GPT-4o Vision não retornou resposta')
    }

    console.log('[analyze-style] Raw response:', responseText.substring(0, 200) + '...')

    // Parse JSON response
    let analysisResult: StyleAnalysisResponse
    try {
      // Remove potential markdown code blocks
      const cleanedResponse = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
      
      analysisResult = JSON.parse(cleanedResponse)
    } catch (parseError) {
      console.error('[analyze-style] Failed to parse JSON response:', parseError)
      
      // Return a structured error with the raw response for debugging
      return NextResponse.json(
        { 
          error: 'Erro ao processar análise. Resposta da IA não estava no formato esperado.',
          rawResponse: responseText.substring(0, 500),
        },
        { status: 500 }
      )
    }

    // Validate response structure
    if (!analysisResult.summary || !analysisResult.detectedElements || !analysisResult.recommendations) {
      return NextResponse.json(
        { error: 'Análise incompleta. Tente novamente.' },
        { status: 500 }
      )
    }

    console.log('[analyze-style] Analysis completed successfully')

    return NextResponse.json(analysisResult)
  } catch (error) {
    console.error('[analyze-style] Error:', error)

    // Handle specific OpenAI errors
    if (error instanceof OpenAI.APIError) {
      if (error.status === 400) {
        return NextResponse.json(
          { error: 'Não foi possível analisar as imagens fornecidas. Verifique se as URLs são válidas e acessíveis.' },
          { status: 400 }
        )
      }
      if (error.status === 429) {
        return NextResponse.json(
          { error: 'Limite de requisições atingido. Tente novamente em alguns minutos.' },
          { status: 429 }
        )
      }
    }

    return NextResponse.json(
      { error: 'Erro ao analisar estilo. Tente novamente.' },
      { status: 500 }
    )
  }
}
