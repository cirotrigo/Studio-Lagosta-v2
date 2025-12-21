import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  fetchTemplateWithProject,
  hasTemplateReadAccess,
} from '@/lib/templates/access'

// GET - Listar páginas modelo de todos os templates do projeto
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

    // Verificar acesso ao template considerando organizações
    const template = await fetchTemplateWithProject(templateId)

    if (!hasTemplateReadAccess(template, { userId, orgId })) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Buscar todas as páginas marcadas como modelo de TODOS os templates do projeto
    const templatePages = await db.page.findMany({
      where: {
        Template: {
          projectId: template.projectId, // Buscar em todos os templates do projeto
        },
        isTemplate: true,
      },
      orderBy: [
        { Template: { name: 'asc' } }, // Agrupar por template
        { order: 'asc' }, // Ordenar por ordem dentro do template
      ],
      select: {
        id: true,
        name: true,
        templateName: true,
        templateId: true, // Incluir para identificar de qual template veio
        width: true,
        height: true,
        layers: true,
        background: true,
        thumbnail: true,
        order: true,
        createdAt: true,
        updatedAt: true,
        Template: {
          select: {
            name: true, // Incluir nome do template de origem
          },
        },
      },
    })

    // Deserializar layers de cada página
    const pagesWithParsedLayers = templatePages.map(page => ({
      ...page,
      layers: typeof page.layers === 'string' ? JSON.parse(page.layers) : page.layers,
    }))

    return NextResponse.json(pagesWithParsedLayers)
  } catch (error) {
    console.error('Error fetching template pages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch template pages' },
      { status: 500 }
    )
  }
}