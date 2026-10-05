import { NextResponse, after } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { invalidateScheduledRenders } from '@/lib/posts/invalidate-renders'
import {
  fetchTemplateWithProject,
  hasTemplateWriteAccess,
} from '@/lib/templates/access'
import { canonicalizeShapeLayerForPersistence } from '@/lib/shape-style'
import { lerCamadas } from '@/lib/posts/page-layers'
import { gravarCamadasComRevisao } from '@/lib/copy-autoral/persistir'
import { CreativeError } from '@/lib/creatives/errors'

class CamadaNaoEncontrada extends Error {}

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

    /** A camada editada fundida numa lista de camadas (a da página COMO ESTÁ no banco). */
    const fundir = (camada: Record<string, unknown>) =>
      canonicalizeShapeLayerForPersistence({
        ...camada,
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

    /**
     * 🔴 A camada é fundida na página RELIDA e gravada COM a revisão do
     * contrato da copy, por compare-and-set (`gravarCamadasComRevisao`, PR3-F03
     * da revisão FINAL do Codex sobre abac9b34, 18/09/2026). Antes este
     * endpoint (autosave de camada, `use-auto-save-layer`) escrevia `layers`
     * sem revisar `copyAutoral`: a página mostrava um texto e o contrato outro,
     * e a próxima edição no editor assinava a mudança com a autoria errada.
     */
    let updatedLayer: Record<string, unknown> | null = null
    let layerChanged = false
    let avisoDaCopy: string | null = null
    const { updatedPage, invalidated, congelados } = await db.$transaction(async (tx) => {
      const g = await gravarCamadasComRevisao(tx, {
        pageId,
        humana: true,
        quem: { autor: 'equipe', motivo: 'edição de camada no editor', superficie: 'editor' },
        camadas: (base) => {
          const lidas = lerCamadas(base.layers)
          if (!lidas.legivel) throw new Error('camadas ilegíveis')
          const layers = lidas.camadas as Array<Record<string, unknown>>
          const i = layers.findIndex((layer) => layer.id === layerId)
          if (i === -1) throw new CamadaNaoEncontrada()
          updatedLayer = fundir(layers[i])
          // Mudança real? O mesmo endpoint recebe autosave; layer idêntica não pode
          // invalidar o render dos posts agendados desta página
          layerChanged = JSON.stringify(layers[i]) !== JSON.stringify(updatedLayer)
          return JSON.stringify(layers.map((l, j) => (j === i ? updatedLayer : l)))
        },
      })
      if (!g) throw new CamadaNaoEncontrada()
      avisoDaCopy = g.aviso
      const saved = await tx.page.findUnique({ where: { id: pageId } })
      const r = layerChanged
        ? await invalidateScheduledRenders(tx, { pageIds: [pageId] })
        : { invalidados: 0, congelados: [] as string[] }
      return { updatedPage: saved!, invalidated: r.invalidados, congelados: r.congelados }
    })
    if (avisoDaCopy) console.warn(`[API] Layer ${layerId}: camada gravada sem revisão do contrato da copy — ${avisoDaCopy}`)

    if (invalidated > 0) {
      console.log(`[API] Layer ${layerId} changed — invalidated ${invalidated} scheduled render(s)`)
    }
    if (congelados.length > 0) {
      console.warn(
        `[API] Layer ${layerId}: ${congelados.length} post(s) já entregues ao publicador não receberam a alteração`,
      )
    }

    /**
     * O outro lado da invalidação: a arte CONGELADA desta página (o slide de
     * carrossel) não volta para a fila de render. Ver `recompor.ts`.
     */
    if (layerChanged) {
      // Fora da resposta: este endpoint também recebe autosave, e o
      // levantamento custa duas idas ao banco.
      after(async () => {
        const { pedirRecomposicaoDaArteCongelada } = await import('@/lib/compositor/recompor')
        await pedirRecomposicaoDaArteCongelada([pageId])
      })
    }

    return NextResponse.json({
      success: true,
      layer: updatedLayer,
      page: {
        ...updatedPage,
        layers: typeof updatedPage.layers === 'string' ? JSON.parse(updatedPage.layers) : updatedPage.layers,
      },
      ...(congelados.length > 0 ? { postsCongelados: congelados } : {}),
      // A camada foi gravada e o contrato da copy ficou como estava (histórico cheio, copy que não cabe).
      ...(avisoDaCopy ? { avisoDaCopy } : {}),
    })
  } catch (error) {
    if (error instanceof CamadaNaoEncontrada) {
      return NextResponse.json({ error: 'Layer not found' }, { status: 404 })
    }
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('Error updating layer:', error)
    return NextResponse.json(
      { error: 'Failed to update layer' },
      { status: 500 }
    )
  }
}
