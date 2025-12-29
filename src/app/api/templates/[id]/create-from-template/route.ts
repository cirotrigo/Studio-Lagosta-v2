import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import {
  fetchTemplateWithProject,
  hasTemplateWriteAccess,
} from '@/lib/templates/access'

const createFromTemplateSchema = z.object({
  templatePageId: z.string(),
  images: z.record(z.object({
    type: z.string(),
    url: z.string(),
    pathname: z.string().optional(),
    prompt: z.string().optional(),
    references: z.array(z.string()).optional(),
    model: z.string().optional(),
    driveFileId: z.string().optional(),
    aiImageId: z.string().optional(),
  })).optional().default({}), // layerId -> ImageSource (múltiplas imagens)
  texts: z.record(z.string()).optional().default({}), // layerId -> text content
})

// POST - Criar página a partir de modelo
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

    // Verificar acesso ao template
    const template = await fetchTemplateWithProject(templateId)

    if (!hasTemplateWriteAccess(template, { userId, orgId })) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const body = await request.json()
    const { templatePageId, images, texts } = createFromTemplateSchema.parse(body)

    // Buscar a página modelo (pode ser de qualquer template do projeto)
    const templatePage = await db.page.findFirst({
      where: {
        id: templatePageId,
        isTemplate: true,
        Template: {
          projectId: template.projectId, // Garantir que pertence ao projeto
        },
      },
      include: {
        Template: true, // Incluir para validação adicional
      },
    })

    if (!templatePage) {
      return NextResponse.json({ error: 'Template page not found' }, { status: 404 })
    }

    // Verificar se a página modelo pertence ao mesmo projeto
    if (templatePage.Template.projectId !== template.projectId) {
      return NextResponse.json({ error: 'Template page not found' }, { status: 404 })
    }

    // Deserializar layers do modelo
    const templateLayers = typeof templatePage.layers === 'string'
      ? JSON.parse(templatePage.layers)
      : templatePage.layers

    console.log('[create-from-template] Template has', (templateLayers as any[]).length, 'layers')
    console.log('[create-from-template] Images to apply:', Object.keys(images).length)
    console.log('[create-from-template] Texts to apply:', Object.keys(texts).length)

    // Clonar e modificar layers
    const modifiedLayers = (templateLayers as any[]).map((layer: any) => {
      const newLayer = { ...layer }

      // Atualizar textos se fornecidos
      if (layer.type === 'text' && texts[layer.id]) {
        newLayer.content = texts[layer.id]
        newLayer.text = texts[layer.id]
        console.log('[create-from-template] Updated text layer:', layer.id)
      }

      // Aplicar imagens apenas em layers marcadas como dinâmicas
      if (layer.type === 'image' && layer.isDynamic && images[layer.id]) {
        console.log('[create-from-template] Replacing dynamic image layer:', layer.id, 'old URL:', layer.fileUrl)
        newLayer.fileUrl = images[layer.id].url
        console.log('[create-from-template] Applied new URL:', images[layer.id].url)
      }

      return newLayer
    })

    // Contar páginas existentes para determinar order
    const pageCount = await db.page.count({
      where: { templateId },
    })

    // Criar nova página (NÃO é modelo)
    const newPage = await db.page.create({
      data: {
        name: `Criativo ${new Date().toLocaleDateString('pt-BR')}`,
        width: templatePage.width,
        height: templatePage.height,
        layers: JSON.stringify(modifiedLayers),
        background: templatePage.background,
        order: pageCount,
        templateId,
        isTemplate: false, // Importante: páginas criadas não são modelos
      },
    })

    // Criar registro AICreativeGeneration para marcar como página criativa
    await db.aICreativeGeneration.create({
      data: {
        projectId: template.projectId,
        templateId,
        pageId: newPage.id,
        layoutType: `template:${templatePageId}`, // Salvar o ID do template usado
        imageSource: JSON.stringify(images), // Salvar múltiplas imagens
        textsData: JSON.stringify(texts),
        creditsUsed: 0,
        createdBy: userId,
      },
    })

    console.log('[create-from-template] Created AICreativeGeneration record for page:', newPage.id)

    // Deserializar layers na resposta
    const pageWithParsedLayers = {
      ...newPage,
      layers: typeof newPage.layers === 'string' ? JSON.parse(newPage.layers) : newPage.layers,
    }

    console.log('[create-from-template] Returning page with', pageWithParsedLayers.layers.length, 'layers')
    const imageLayer = pageWithParsedLayers.layers.find((l: any) => l.type === 'image')
    if (imageLayer) {
      console.log('[create-from-template] Image layer in response:', imageLayer.id, 'URL:', imageLayer.fileUrl)
    }

    return NextResponse.json({
      page: pageWithParsedLayers,
      success: true,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating page from template:', error)
    return NextResponse.json(
      { error: 'Failed to create page from template' },
      { status: 500 }
    )
  }
}