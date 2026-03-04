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

Sua tarefa é analisar as imagens de referência fornecidas e extrair informações EXTREMAMENTE ESPECÍFICAS sobre o estilo visual. Evite termos genéricos como "moderno" ou "profissional" sem contexto.

ANALISE OS SEGUINTES ASPECTOS:

1. LAYOUTS:
   - Composição (centralizado, assimétrico, grid, etc.)
   - Hierarquia visual (o que chama atenção primeiro, segundo, terceiro)
   - Uso de espaço negativo (quanto e onde)
   - Proporções e alinhamentos
   - Posicionamento do sujeito principal (superior, central, inferior)
   - Densidade visual (minimalista vs. rico em detalhes)
   - Estratégia de área de texto (overlay com gradiente, zona dedicada, integrado ao design)

2. TIPOGRAFIA:
   - Famílias tipográficas detectadas (serif, sans-serif, display, script)
   - Pesos e estilos (bold, light, italic)
   - Tratamento de títulos vs corpo de texto

3. TONS DE COR:
   - Paleta predominante com descritores específicos (ex: "terracota quente", "bordô profundo", não apenas "warm")
   - Saturação (vibrant, muted, pastel)
   - Contraste (alto, baixo)
   - Temperatura de cor (quente/fria, com grau)

4. PADRÕES E ELEMENTOS:
   - Formas recorrentes (geométrico, orgânico)
   - Texturas específicas (madeira, tecido, granulado, liso)
   - Elementos decorativos
   - Tratamento de imagens/fotos (DOF raso, iluminação lateral, overhead, etc.)

5. MOOD/ATMOSFERA:
   - Sensação geral com descritores específicos
   - Iluminação predominante (natural lateral, estúdio suave, dramática, etc.)

EXEMPLOS DE ANÁLISE BEM FEITA:

Exemplo 1 - Restaurante Sofisticado:
{
  "summary": "Composições minimalistas com fotografia profissional de alimentos, paleta terrosa e quente com fundo escuro, foco em texturas naturais e iluminação suave lateral.",
  "detectedElements": {
    "layouts": ["Composição centralizada com sujeito no centro-superior", "35-40% inferior reservado para texto com gradiente escuro", "Espaço negativo generoso nas laterais", "Hierarquia: imagem hero > título > info secundária"],
    "typography": ["Sans-serif moderna em títulos weight 700", "Serif elegante em subtítulos weight 400", "Contraste de tamanho alto entre título e corpo"],
    "colorTones": ["Fundo escuro grafite (#1a1a1a a #2d2d2d)", "Tons terrosos quentes como dourado e terracota", "Saturação média-baixa", "Alto contraste com texto branco"],
    "patterns": ["Texturas orgânicas de madeira escura e pedra", "Fotografia em shallow DOF f/2.8", "Sombras suaves e difusas", "Elementos decorativos sutis como ramos de ervas"],
    "mood": "Elegante e acolhedor com sofisticação artesanal — iluminação natural lateral quente com sombras suaves"
  },
  "recommendations": "Manter composições limpas com 30-40% de espaço negativo. Usar iluminação natural lateral quente. Reservar zona inferior escura (gradiente) para overlays de texto branco/dourado."
}

Exemplo 2 - Marca Jovem:
{
  "summary": "Design gráfico bold com cores saturadas, gradientes vibrantes pink-to-orange, composições assimétricas dinâmicas com elementos geométricos abstratos.",
  "detectedElements": {
    "layouts": ["Assimétrico dinâmico com sujeito deslocado para esquerda", "Elementos gráficos em diagonal criando movimento", "Pouco espaço negativo — composição densa e energética", "Texto integrado como elemento gráfico"],
    "typography": ["Display extra-bold weight 800-900 em títulos", "Tracking apertado", "Título como elemento visual dominante"],
    "colorTones": ["Gradientes vibrantes pink neon (#FF6B9D) para laranja (#FF8C42)", "Saturação muito alta", "Acentos em roxo elétrico (#8B5CF6)", "Contraste extremo"],
    "patterns": ["Blobs orgânicos como frames", "Texturas de granulado digital sutil", "Formas geométricas abstratas sobrepostas", "Fotos com tratamento de cor saturado"],
    "mood": "Energético e ousado — vibrante e contemporâneo com sensação de movimento e urgência"
  },
  "recommendations": "Usar gradientes vibrantes como background. Incorporar formas abstratas como elementos de composição. Manter energia visual alta com cores saturadas e composição densa."
}

IMPORTANTE: Seja TÃO ESPECÍFICO quanto os exemplos acima. Cada item da lista deve ser uma observação concreta sobre o que você VÊ nas imagens, não uma descrição genérica.

FORMATO DE RESPOSTA (JSON):
{
  "summary": "Descrição textual concisa e específica do estilo visual (2-3 frases)",
  "detectedElements": {
    "layouts": ["observação específica 1", "observação específica 2", ...],
    "typography": ["observação específica 1", "observação específica 2", ...],
    "colorTones": ["observação específica 1", "observação específica 2", ...],
    "patterns": ["observação específica 1", "observação específica 2", ...],
    "mood": "descrição específica do mood com referência a iluminação e atmosfera"
  },
  "recommendations": "Sugestões práticas e específicas para manter consistência visual (2-3 frases)"
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
    console.log('[analyze-style] Image URLs:', body.imageUrls.map(u => u.substring(0, 80) + '...'))

    // Validate that image URLs are accessible before sending to OpenAI
    const validUrls: string[] = []
    for (const url of body.imageUrls) {
      try {
        const headResp = await fetch(url, { method: 'HEAD' })
        if (headResp.ok) {
          validUrls.push(url)
        } else {
          console.warn(`[analyze-style] URL not accessible (${headResp.status}):`, url.substring(0, 80))
        }
      } catch (fetchErr) {
        console.warn(`[analyze-style] URL fetch failed:`, url.substring(0, 80), fetchErr instanceof Error ? fetchErr.message : '')
      }
    }

    if (validUrls.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma das URLs de imagem está acessível. Tente fazer upload novamente.' },
        { status: 400 }
      )
    }
    console.log(`[analyze-style] ${validUrls.length}/${body.imageUrls.length} URLs validated as accessible`)

    const openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Build content array with validated images
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      {
        type: 'text',
        text: `Analise as seguintes ${validUrls.length} imagens de referência para o projeto "${project.name}" e extraia o estilo visual:`,
      },
      ...validUrls.map((url): OpenAI.Chat.Completions.ChatCompletionContentPartImage => ({
        type: 'image_url',
        image_url: {
          url,
          detail: 'low',
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
      console.error('[analyze-style] OpenAI API error details:', {
        status: error.status,
        message: error.message,
        code: error.code,
        type: error.type,
      })
      if (error.status === 400) {
        return NextResponse.json(
          { error: `Não foi possível analisar as imagens: ${error.message}` },
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
