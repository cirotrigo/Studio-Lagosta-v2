import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { invalidateScheduledRenders } from '@/lib/posts/invalidate-renders'
import {
  fetchTemplateWithProject,
  hasTemplateWriteAccess,
} from '@/lib/templates/access'
import { canonicalizeShapeLayerForPersistence } from '@/lib/shape-style'

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
    const updatedLayer = canonicalizeShapeLayerForPersistence({
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
    })

    // Mudança real? O mesmo endpoint recebe autosave; layer idêntica não pode
    // invalidar o render dos posts agendados desta página
    const layerChanged = JSON.stringify((layers as any[])[layerIndex]) !== JSON.stringify(updatedLayer)

    // Substituir a layer atualizada no array
    ;(layers as any[])[layerIndex] = updatedLayer

    // Salvar de volta no banco (e invalidar renders na mesma transação)
    const { updatedPage, invalidated, congelados } = await db.$transaction(async (tx) => {
      const saved = await tx.page.update({
        where: { id: pageId },
        data: {
          layers: JSON.stringify(layers),
          updatedAt: new Date(),
        },
      })
      const r = layerChanged
        ? await invalidateScheduledRenders(tx, { pageIds: [pageId] })
        : { invalidados: 0, congelados: [] as string[] }
      return { updatedPage: saved, invalidated: r.invalidados, congelados: r.congelados }
    })

    if (invalidated > 0) {
      console.log(`[API] Layer ${layerId} changed — invalidated ${invalidated} scheduled render(s)`)
    }
    if (congelados.length > 0) {
      console.warn(
        `[API] Layer ${layerId}: ${congelados.length} post(s) já entregues ao publicador não receberam a alteração`,
      )
    }

    return NextResponse.json({
      success: true,
      layer: updatedLayer,
      page: {
        ...updatedPage,
        layers: typeof updatedPage.layers === 'string' ? JSON.parse(updatedPage.layers) : updatedPage.layers,
      },
      ...(congelados.length > 0 ? { postsCongelados: congelados } : {}),
    })
  } catch (error) {
    console.error('Error updating layer:', error)
    return NextResponse.json(
      { error: 'Failed to update layer' },
      { status: 500 }
    )
  }
}
