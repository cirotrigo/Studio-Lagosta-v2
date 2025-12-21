import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getLayoutById } from '@/lib/ai-creative-generator/layout-templates'
import type { Layer } from '@/types/template'

export const runtime = 'nodejs'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { pageId } = await params

    console.log('[API] Checking if page is creative:', pageId)

    // Buscar a geração criativa associada a esta página
    const creativeGeneration = await db.aICreativeGeneration.findFirst({
      where: { pageId },
      select: {
        layoutType: true,
        textsData: true,
      },
    })

    console.log('[API] Creative generation found:', !!creativeGeneration)

    // Se não encontrou, não é uma página criativa
    if (!creativeGeneration) {
      return NextResponse.json({
        isCreative: false,
      })
    }

    // Buscar a página para pegar os layers
    const page = await db.page.findUnique({
      where: { id: pageId },
      select: {
        layers: true,
        templateId: true,
      },
    })

    if (!page) {
      return NextResponse.json({ error: 'Página não encontrada' }, { status: 404 })
    }

    // Verificar acesso ao projeto (através do template)
    const template = await db.template.findUnique({
      where: { id: page.templateId },
      select: { projectId: true },
    })

    if (!template) {
      return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
    }

    const project = await db.project.findUnique({
      where: { id: template.projectId },
      select: { userId: true },
    })

    if (!project || project.userId !== userId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    // Reconstruir bindings a partir dos layers
    console.log('[API] Layout type:', creativeGeneration.layoutType)

    // Converter layers para array se necessário
    let layers: Layer[]
    if (typeof page.layers === 'string') {
      layers = JSON.parse(page.layers) as Layer[]
    } else if (Array.isArray(page.layers)) {
      layers = page.layers as Layer[]
    } else if (typeof page.layers === 'object' && page.layers !== null) {
      // Se for um objeto, converter os values para array
      layers = Object.values(page.layers) as Layer[]
    } else {
      console.error('[API] Invalid layers format:', typeof page.layers)
      layers = []
    }

    console.log('[API] Page has', layers.length, 'layers (type:', typeof page.layers, ')')

    // Mapa de fieldName → layerId
    const bindings: Array<{ fieldName: string; layerId: string }> = []

    // Verificar se é um layoutType baseado em template (novo sistema)
    const isTemplateBased = creativeGeneration.layoutType.startsWith('template:')

    if (isTemplateBased) {
      // Novo sistema: criar bindings diretamente dos layers
      console.log('[API] Template-based creative page detected')

      // Para cada layer, criar um binding usando o layerId como fieldName
      for (const layer of layers) {
        if (layer.type === 'text') {
          bindings.push({
            fieldName: layer.id,
            layerId: layer.id
          })
        }
      }
    } else {
      // Sistema antigo: usar zonas de layout fixo
      console.log('[API] Layout-based creative page detected')

      let layoutTemplate
      try {
        layoutTemplate = getLayoutById(creativeGeneration.layoutType as any)
        console.log('[API] Layout template found:', layoutTemplate.id)
      } catch (layoutError) {
        console.error('[API] Error getting layout:', layoutError)
        return NextResponse.json({ error: 'Layout não encontrado' }, { status: 500 })
      }

      // Para cada zona do template, encontrar a layer correspondente
      for (const zone of layoutTemplate.zones) {
        let fieldName: string | undefined

        // Determinar o fieldName baseado no tipo e id da zona
        if (zone.id === 'background') {
          fieldName = 'background'
        } else if (zone.id === 'overlay') {
          fieldName = 'overlay'
        } else if (zone.id === 'logo') {
          fieldName = 'logo'
        } else if (zone.type === 'text' && zone.textField) {
          fieldName = zone.textField
        }

        if (!fieldName) continue

        // Procurar layer com nome correspondente (capitalizado)
        const expectedName = capitalizeFieldName(fieldName)
        const layer = layers.find((l) => l.name === expectedName)

        if (layer) {
          bindings.push({ fieldName, layerId: layer.id })
        }
      }
    }

    console.log('[API] Created', bindings.length, 'bindings')

    return NextResponse.json({
      isCreative: true,
      layoutType: creativeGeneration.layoutType,
      bindings,
    })
  } catch (error) {
    console.error('[API] Error checking creative page:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[API] Error message:', errorMessage)
    console.error('[API] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json(
      { error: 'Erro ao verificar página criativa', details: errorMessage },
      { status: 500 }
    )
  }
}

function capitalizeFieldName(field: string): string {
  return field.charAt(0).toUpperCase() + field.slice(1)
}
