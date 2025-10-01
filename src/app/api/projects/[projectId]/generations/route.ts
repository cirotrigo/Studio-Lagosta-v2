import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { createGenerationSchema } from '@/lib/validations/studio'
import { renderGeneration } from '@/lib/generation-utils'

export const runtime = 'nodejs'
export const maxDuration = 60 // 60 segundos para renderização

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { projectId } = await params
    const projectIdNum = parseInt(projectId)

    // Verificar ownership do projeto
    const project = await db.project.findFirst({
      where: { id: projectIdNum, userId },
    })

    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    // Query params para paginação
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '18')
    const skip = (page - 1) * pageSize

    // Buscar gerações do projeto
    const [generations, total] = await Promise.all([
      db.generation.findMany({
        where: { projectId: projectIdNum },
        include: {
          template: {
            select: {
              id: true,
              name: true,
              type: true,
              dimensions: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      db.generation.count({ where: { projectId: projectIdNum } }),
    ])

    return NextResponse.json({
      generations,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('[API] Failed to list generations:', error)
    return NextResponse.json({ error: 'Erro ao buscar criativos' }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { projectId } = await params
    const projectIdNum = parseInt(projectId)

    // Verificar ownership do projeto
    const project = await db.project.findFirst({
      where: { id: projectIdNum, userId },
    })

    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    // Validar payload
    const payload = await req.json()
    const validated = createGenerationSchema.parse(payload)

    // Verificar se template existe e pertence ao projeto
    const template = await db.template.findFirst({
      where: {
        id: validated.templateId,
        projectId: projectIdNum,
      },
    })

    if (!template) {
      return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
    }

    // Criar generation com status PROCESSING
    const generation = await db.generation.create({
      data: {
        projectId: projectIdNum,
        templateId: validated.templateId,
        fieldValues: validated.fieldValues,
        status: 'PROCESSING',
        createdBy: userId,
        projectName: project.name,
        templateName: template.name,
      },
      include: {
        template: true,
      },
    })

    // Renderizar criativo
    try {
      const resultUrl = await renderGeneration(generation)

      // Atualizar com resultado
      const completed = await db.generation.update({
        where: { id: generation.id },
        data: {
          status: 'COMPLETED',
          resultUrl,
          completedAt: new Date(),
        },
        include: {
          template: {
            select: {
              id: true,
              name: true,
              type: true,
              dimensions: true,
            },
          },
        },
      })

      return NextResponse.json(completed, { status: 201 })
    } catch (renderError) {
      console.error('[API] Failed to render generation:', renderError)

      // Atualizar status para FAILED
      await db.generation.update({
        where: { id: generation.id },
        data: { status: 'FAILED' },
      })

      return NextResponse.json(
        { error: 'Erro ao renderizar criativo', details: String(renderError) },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('[API] Failed to create generation:', error)

    if (error instanceof Error && 'issues' in error) {
      return NextResponse.json({ error: 'Dados inválidos', details: error }, { status: 400 })
    }

    return NextResponse.json({ error: 'Erro ao criar criativo' }, { status: 500 })
  }
}
