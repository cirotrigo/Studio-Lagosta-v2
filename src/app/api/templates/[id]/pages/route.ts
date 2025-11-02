import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'

const createPageSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  layers: z.array(z.any()).default([]),
  background: z.string().optional(),
  order: z.number().int().default(0),
})

// GET - Listar páginas de um template
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const templateId = Number(id)

    // Verificar acesso ao template através do projeto
    const template = await db.template.findFirst({
      where: { id: templateId },
      include: {
        Project: {
          include: {
            organizationProjects: {
              include: {
                organization: {
                  select: {
                    clerkOrgId: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    if (!hasProjectReadAccess(template.Project, { userId, orgId })) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Buscar todas as páginas do template
    const pages = await db.page.findMany({
      where: { templateId },
      orderBy: { order: 'asc' },
    })

    // Deserializar layers de cada página
    const pagesWithParsedLayers = pages.map(page => ({
      ...page,
      layers: typeof page.layers === 'string' ? JSON.parse(page.layers) : page.layers,
    }))

    return NextResponse.json(pagesWithParsedLayers)
  } catch (error) {
    console.error('Error fetching pages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pages' },
      { status: 500 }
    )
  }
}

// POST - Criar nova página
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const templateId = Number(id)

    // Verificar permissão de escrita no template através do projeto
    const template = await db.template.findFirst({
      where: { id: templateId },
      include: {
        Project: {
          include: {
            organizationProjects: {
              include: {
                organization: {
                  select: {
                    clerkOrgId: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    if (!hasProjectWriteAccess(template.Project, { userId, orgId })) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()

    console.log('[API] Creating page with data:', body)

    const validatedData = createPageSchema.parse(body)

    console.log('[API] Validated data:', validatedData)

    // Criar página
    const page = await db.page.create({
      data: {
        name: validatedData.name,
        width: validatedData.width,
        height: validatedData.height,
        layers: JSON.stringify(validatedData.layers), // Serializar para JSON
        background: validatedData.background,
        order: validatedData.order,
        templateId,
      },
    })

    console.log('[API] Page created successfully:', page.id)

    return NextResponse.json(page, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating page:', error)
    return NextResponse.json(
      { error: 'Failed to create page' },
      { status: 500 }
    )
  }
}
