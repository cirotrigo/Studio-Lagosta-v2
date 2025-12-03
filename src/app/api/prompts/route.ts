import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { ensureOrganizationExists } from '@/lib/organizations'

const createPromptSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  content: z.string().min(1, 'Conteúdo é obrigatório'),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

// GET - Buscar todos os prompts do usuário
export async function GET(req: Request) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')
    const category = searchParams.get('category')

    let organizationId: string | null = null

    if (orgId) {
      const organization = await ensureOrganizationExists(orgId)
      organizationId = organization?.id ?? null
    }

    const orFilters = [
      { userId, organizationId: null },
      ...(organizationId ? [{ organizationId }] : []),
    ]

    const andFilters: Array<Record<string, unknown>> = []

    if (category) {
      andFilters.push({ category })
    }

    if (search) {
      andFilters.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
          { tags: { hasSome: [search] } },
        ],
      })
    }

    const where = {
      OR: orFilters,
      ...(andFilters.length > 0 ? { AND: andFilters } : {}),
    } as Parameters<typeof db.prompt.findMany>[0]['where']

    const prompts = await db.prompt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(prompts)
  } catch (error) {
    console.error('[GET /api/prompts] Error:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar prompts' },
      { status: 500 }
    )
  }
}

// POST - Criar novo prompt
export async function POST(req: Request) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    console.log('[POST /api/prompts] Request body:', body)
    console.log('[POST /api/prompts] User ID:', userId)

    const validatedData = createPromptSchema.parse(body)
    console.log('[POST /api/prompts] Validated data:', validatedData)

    let organizationId: string | null = null

    if (orgId) {
      const organization = await ensureOrganizationExists(orgId)

      if (!organization) {
        return NextResponse.json(
          { error: 'Organização não encontrada' },
          { status: 404 }
        )
      }

      organizationId = organization.id
    }

    const promptData = {
      title: validatedData.title,
      content: validatedData.content,
      category: validatedData.category || null,
      userId,
      tags: validatedData.tags || [],
      organizationId,
    }
    console.log('[POST /api/prompts] Creating prompt with data:', promptData)

    const newPrompt = await db.prompt.create({
      data: promptData,
    })

    console.log('[POST /api/prompts] Prompt created successfully:', newPrompt.id)
    return NextResponse.json(newPrompt, { status: 201 })
  } catch (error) {
    console.error('[POST /api/prompts] Error:', error)
    console.error('[POST /api/prompts] Error stack:', error instanceof Error ? error.stack : 'No stack')

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Erro ao criar prompt', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
