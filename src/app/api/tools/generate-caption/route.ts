import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { getProjectPromptKnowledgeContext } from '@/lib/knowledge/search'

export const runtime = 'nodejs'
export const maxDuration = 30

const TONE_INSTRUCTIONS: Record<string, string> = {
  casual: 'Use linguagem informal e próxima, como uma conversa entre amigos. Seja acessível e acolhedor.',
  fun: 'Use tom leve e divertido, com humor sutil. Emojis são bem-vindos para criar conexão.',
  inspirational: 'Use tom motivador e positivo, inspirando o leitor. Conecte com aspirações e valores.',
  explanatory: 'Seja informativo e didático, explicando de forma clara e objetiva. Eduque o leitor.',
  professional: 'Use linguagem corporativa e objetiva. Mantenha credibilidade e sofisticação.',
  formal: 'Use linguagem rebuscada e institucional. Tom elegante e respeitoso.',
}

const POST_TYPE_CONFIG: Record<string, { description: string; maxLength: number; hashtagsDefault: boolean }> = {
  POST: {
    description: 'post de feed (imagem única)',
    maxLength: 400,
    hashtagsDefault: true,
  },
  STORY: {
    description: 'story (conteúdo efêmero, mais casual e direto)',
    maxLength: 180,
    hashtagsDefault: false,
  },
  REEL: {
    description: 'reel (vídeo curto e dinâmico)',
    maxLength: 300,
    hashtagsDefault: true,
  },
  CAROUSEL: {
    description: 'carrossel (múltiplas imagens)',
    maxLength: 400,
    hashtagsDefault: true,
  },
}

const requestSchema = z.object({
  projectId: z.number().int().positive(),
  prompt: z.string().min(1).max(500),
  postType: z.enum(['POST', 'STORY', 'REEL', 'CAROUSEL']).default('POST'),
  tone: z.enum(['casual', 'fun', 'inspirational', 'explanatory', 'professional', 'formal']).default('casual'),
  includeHashtags: z.boolean().optional(),
  maxLength: z.number().int().positive().optional(),
})

const responseSchema = z.object({
  caption: z.string(),
  hashtags: z.array(z.string()).optional(),
  knowledgeUsed: z.boolean(),
  tone: z.string(),
})

function buildSystemPrompt(
  tone: string,
  postType: string,
  maxLength: number,
  includeHashtags: boolean,
  projectName: string,
  knowledgeContext: string,
): string {
  const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.casual
  const postConfig = POST_TYPE_CONFIG[postType] || POST_TYPE_CONFIG.POST

  const knowledgeSection = knowledgeContext
    ? `\n\nCONTEXTO DO PROJETO (use quando relevante):\n${knowledgeContext}`
    : ''

  return `Você é um redator sênior de social media especializado em legendas para Instagram.

PROJETO: ${projectName}

TOM DA LEGENDA: ${toneInstruction}

TIPO DE POST: ${postConfig.description}
${knowledgeSection}

REGRAS OBRIGATÓRIAS:
1. A legenda deve ter NO MÁXIMO ${maxLength} caracteres (incluindo emojis e espaços)
2. Comece com um hook que prenda a atenção
3. Seja conciso e direto - cada palavra deve ter propósito
4. Inclua um call-to-action quando apropriado (ex: "Marque alguém", "Comente", "Salve este post")
5. Use emojis de forma estratégica (máximo 3-5)
6. ${includeHashtags ? 'Inclua até 3 hashtags relevantes no final' : 'NÃO inclua hashtags'}
7. Use português brasileiro natural
8. NÃO invente informações como preços, horários ou endereços se não estiverem no contexto
9. Se houver informações do projeto (horários, cardápio, diferenciais), incorpore naturalmente

${postType === 'STORY' ? 'Para stories: seja mais direto e casual, sem hashtags. Máximo 2 linhas.' : ''}
${postType === 'CAROUSEL' ? 'Para carrossel: gere curiosidade, pode mencionar "arrasta para ver mais".' : ''}

FORMATO DA RESPOSTA:
Retorne APENAS a legenda em texto puro, sem markdown, sem aspas, sem explicações.
${includeHashtags ? 'As hashtags devem estar na última linha, separadas por espaço.' : ''}`
}

export async function POST(request: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let body: z.infer<typeof requestSchema>
  try {
    body = requestSchema.parse(await request.json())
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: 'Erro ao processar requisição' }, { status: 400 })
  }

  // Verificar acesso ao projeto
  const project = await fetchProjectWithShares(body.projectId)
  if (!project || !hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  // Buscar nome do projeto
  const projectMeta = await db.project.findUnique({
    where: { id: body.projectId },
    select: { name: true },
  })

  const projectName = projectMeta?.name || 'Projeto'

  // Buscar contexto da base de conhecimento via RAG
  const knowledgeResult = await getProjectPromptKnowledgeContext(
    body.prompt,
    { projectId: body.projectId },
    { topKPerCategory: 2, maxTokens: 800, minScore: 0.6 },
  )

  const postConfig = POST_TYPE_CONFIG[body.postType] || POST_TYPE_CONFIG.POST
  const maxLength = body.maxLength || postConfig.maxLength
  const includeHashtags = body.includeHashtags ?? postConfig.hashtagsDefault

  const systemPrompt = buildSystemPrompt(
    body.tone,
    body.postType,
    maxLength,
    includeHashtags,
    projectName,
    knowledgeResult.context,
  )

  try {
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      prompt: `Gere uma legenda para: ${body.prompt}`,
      temperature: 0.7,
      maxOutputTokens: 500,
    })

    const rawCaption = result.text.trim()

    // Extrair hashtags se incluídas
    let caption = rawCaption
    let hashtags: string[] = []

    if (includeHashtags) {
      const hashtagMatch = rawCaption.match(/(#\w+\s*)+$/)
      if (hashtagMatch) {
        const hashtagsStr = hashtagMatch[0]
        caption = rawCaption.replace(hashtagsStr, '').trim()
        hashtags = hashtagsStr.match(/#\w+/g) || []
      }
    }

    const response = responseSchema.parse({
      caption,
      hashtags: hashtags.length > 0 ? hashtags : undefined,
      knowledgeUsed: knowledgeResult.hits.length > 0,
      tone: body.tone,
    })

    return NextResponse.json(response)
  } catch (error) {
    console.error('[API] POST /api/tools/generate-caption error:', error)

    // Fallback: retornar uma legenda simples baseada no prompt
    const fallbackCaption = body.prompt.length > maxLength
      ? body.prompt.slice(0, maxLength - 3) + '...'
      : body.prompt

    return NextResponse.json({
      caption: fallbackCaption,
      knowledgeUsed: false,
      tone: body.tone,
    })
  }
}
