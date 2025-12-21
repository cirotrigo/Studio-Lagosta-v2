import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  fetchTemplateWithProject,
  hasTemplateWriteAccess,
} from '@/lib/templates/access'

// PATCH - Atualizar uma layer específica em uma página
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ pageId: string; layerId: string }> }
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { pageId, layerId } = await params

    // Buscar a página para obter o templateId
    const page = await db.page.findUnique({
      where: { id: pageId },
      select: {
        id: true,
        templateId: true,
        layers: true,
        isTemplate: true,
      },
    })

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    // Verificar acesso ao template
    const template = await fetchTemplateWithProject(page.templateId)

    if (!hasTemplateWriteAccess(template, { userId, orgId })) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Obter os updates do body
    const updates = await request.json()

    // Deserializar layers
    const layers = typeof page.layers === 'string' ? JSON.parse(page.layers) : page.layers

    // Encontrar e atualizar a layer específica
    const layerIndex = (layers as any[]).findIndex((layer) => layer.id === layerId)

    if (layerIndex === -1) {
      return NextResponse.json({ error: 'Layer not found' }, { status: 404 })
    }

    // Atualizar a layer com os novos valores
    const updatedLayer = {
      ...(layers as any[])[layerIndex],
      ...updates,
      // Manter text e content sincronizados para layers de texto
      ...(updates.content !== undefined && {
        text: updates.content,
        content: updates.content,
      }),
      ...(updates.text !== undefined && {
        text: updates.text,
        content: updates.text,
      }),
    }

    // Substituir a layer atualizada no array
    ;(layers as any[])[layerIndex] = updatedLayer

    // Salvar de volta no banco
    const updatedPage = await db.page.update({
      where: { id: pageId },
      data: {
        layers: JSON.stringify(layers),
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      layer: updatedLayer,
      page: {
        ...updatedPage,
        layers: typeof updatedPage.layers === 'string' ? JSON.parse(updatedPage.layers) : updatedPage.layers,
      },
    })
  } catch (error) {
    console.error('Error updating layer:', error)
    return NextResponse.json(
      { error: 'Failed to update layer' },
      { status: 500 }
    )
  }
}
