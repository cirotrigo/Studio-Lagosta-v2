import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { z } from 'zod'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 120 // 2 minutes for DALL-E generation

const FORMAT_DIMENSIONS: Record<string, { width: number; height: number; label: string }> = {
  FEED_PORTRAIT: { width: 1080, height: 1350, label: 'feed retrato (1080x1350)' },
  STORY: { width: 1080, height: 1920, label: 'story vertical (1080x1920)' },
  SQUARE: { width: 1024, height: 1024, label: 'quadrado (1024x1024)' },
}

const generateArtSchema = z.object({
  projectId: z.number().int().positive(),
  text: z.string().min(1).max(500, 'Texto muito longo (máximo 500 caracteres)'),
  format: z.enum(['FEED_PORTRAIT', 'STORY', 'SQUARE']),
  includeLogo: z.boolean().default(false),
  usePhoto: z.boolean().default(false),
  photoUrl: z.string().url().optional(),
  variations: z.union([z.literal(1), z.literal(2), z.literal(4)]).default(1),
  styleDescription: z.string().max(500).optional(),
})

interface BrandAssets {
  name: string
  colors: string[]
  styleDescription: string | null
  cuisineType: string | null
  instagramUsername: string | null
}

async function fetchBrandAssets(projectId: number): Promise<BrandAssets | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      instagramUsername: true,
    },
  })

  if (!project) return null

  const colors = await db.brandColor.findMany({
    where: { projectId },
    select: { hexCode: true },
    orderBy: { createdAt: 'asc' },
  })

  // Access optional fields safely
  const projectWithBrand = project as typeof project & {
    brandStyleDescription?: string | null
    cuisineType?: string | null
  }

  return {
    name: project.name,
    colors: colors.map((c) => c.hexCode),
    styleDescription: projectWithBrand.brandStyleDescription ?? null,
    cuisineType: projectWithBrand.cuisineType ?? null,
    instagramUsername: project.instagramUsername,
  }
}

function buildPromptGeneratorSystemPrompt(
  brandAssets: BrandAssets,
  format: string,
  includeLogo: boolean,
  usePhoto: boolean,
): string {
  const formatInfo = FORMAT_DIMENSIONS[format]
  const colorList = brandAssets.colors.length > 0 
    ? brandAssets.colors.join(', ') 
    : 'não definidas (usar tons neutros e elegantes)'

  return `Você é um designer gráfico especializado em criar artes visuais para restaurantes e estabelecimentos gastronômicos.

DADOS DA MARCA:
- Nome do estabelecimento: ${brandAssets.name}
- Cores da marca (hex): ${colorList}
- Estilo visual: ${brandAssets.styleDescription || 'moderno, elegante e profissional'}
- Tipo de cozinha: ${brandAssets.cuisineType || 'não especificado'}
- Formato da arte: ${formatInfo.label}

SUA TAREFA:
Converter o texto do usuário em um prompt técnico otimizado para geração de imagem com DALL-E 3.

DIRETRIZES DO PROMPT:
1. Descreva a composição visual detalhadamente (layout, posicionamento de elementos)
2. Especifique as cores da marca de forma explícita
3. Defina o estilo tipográfico compatível com a marca
4. Estabeleça a atmosfera e mood da imagem
5. Mencione o formato ${formatInfo.label}
6. Use linguagem técnica de design
${includeLogo ? '7. Mencione que deve haver espaço para logo no canto superior ou inferior' : ''}
${usePhoto ? '8. A arte deve incorporar fotografia de comida como elemento principal' : ''}

FORMATO DE RESPOSTA:
Responda APENAS com o prompt técnico em inglês, sem explicações adicionais.
O prompt deve ser detalhado mas conciso (máximo 400 palavras).`
}

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
  let body: z.infer<typeof generateArtSchema>
  try {
    const rawBody = await request.json()
    body = generateArtSchema.parse(rawBody)
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

  // Fetch brand assets
  const brandAssets = await fetchBrandAssets(body.projectId)
  if (!brandAssets) {
    return NextResponse.json({ error: 'Erro ao buscar assets da marca' }, { status: 500 })
  }

  // Override style description if provided in request
  if (body.styleDescription) {
    brandAssets.styleDescription = body.styleDescription
  }

  try {
    // Step 1: Generate optimized prompt using GPT-4o-mini
    console.log('[generate-art] Generating technical prompt with GPT-4o-mini...')
    
    const systemPrompt = buildPromptGeneratorSystemPrompt(
      brandAssets,
      body.format,
      body.includeLogo,
      body.usePhoto
    )

    const { text: technicalPrompt } = await generateText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      prompt: `Texto para a arte: "${body.text}"`,
      temperature: 0.7,
    })

    console.log('[generate-art] Technical prompt generated:', technicalPrompt.substring(0, 200) + '...')

    // Step 2: Generate image with DALL-E 3
    console.log('[generate-art] Generating image with DALL-E 3...')
    
    const openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // DALL-E 3 size mapping
    const sizeMap: Record<string, '1024x1024' | '1792x1024' | '1024x1792'> = {
      FEED_PORTRAIT: '1024x1792', // Closest to 1080x1350
      STORY: '1024x1792',          // Closest to 1080x1920
      SQUARE: '1024x1024',
    }

    const dalleResponse = await openaiClient.images.generate({
      model: 'dall-e-3',
      prompt: technicalPrompt,
      n: 1, // DALL-E 3 only supports n=1
      size: sizeMap[body.format],
      quality: 'hd',
      style: 'vivid',
    })

    const imageUrl = dalleResponse.data[0]?.url
    if (!imageUrl) {
      throw new Error('DALL-E não retornou imagem')
    }

    console.log('[generate-art] Image generated successfully')

    // For variations > 1, we need to make multiple calls
    const results: Array<{ imageUrl: string; prompt: string }> = [
      { imageUrl, prompt: technicalPrompt }
    ]

    // Generate additional variations if requested
    if (body.variations > 1) {
      console.log(`[generate-art] Generating ${body.variations - 1} additional variations...`)
      
      for (let i = 1; i < body.variations; i++) {
        try {
          // Slightly modify prompt for variation
          const variationPrompt = `${technicalPrompt}\n\n[Variation ${i + 1}: Create a distinct visual interpretation with different composition and layout while maintaining the same brand identity and message.]`
          
          const variationResponse = await openaiClient.images.generate({
            model: 'dall-e-3',
            prompt: variationPrompt,
            n: 1,
            size: sizeMap[body.format],
            quality: 'hd',
            style: 'vivid',
          })

          if (variationResponse.data[0]?.url) {
            results.push({
              imageUrl: variationResponse.data[0].url,
              prompt: variationPrompt,
            })
          }
        } catch (varError) {
          console.error(`[generate-art] Error generating variation ${i + 1}:`, varError)
          // Continue with other variations
        }
      }
    }

    return NextResponse.json({
      images: results,
      prompt: technicalPrompt,
      provider: 'dall-e-3',
      format: body.format,
      variations: results.length,
    })
  } catch (error) {
    console.error('[generate-art] Error:', error)

    // Handle specific OpenAI errors
    if (error instanceof OpenAI.APIError) {
      if (error.status === 400 && error.message.includes('content_policy')) {
        return NextResponse.json(
          { error: 'O conteúdo solicitado viola as políticas de uso. Tente reformular o texto.' },
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
      { error: 'Erro ao gerar arte. Tente novamente.' },
      { status: 500 }
    )
  }
}
