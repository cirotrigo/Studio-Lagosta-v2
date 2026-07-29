import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { renderStoryImage } from '@/lib/posts/story-renderer'
import { PostStatus, RenderStatus } from '../../../../../prisma/generated/client'

export const maxDuration = 120

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()

    // Find posts that need rendering.
    //
    // DRAFT entra junto com SCHEDULED: a agenda mostra a arte do rascunho, e
    // editar a página só corrige o que ela mostra se o render acontecer antes
    // da aprovação. `nextRenderAt: asc` mantém a prioridade certa — rascunho
    // reinvalidado a cada autosave volta para o fim da fila, nunca na frente
    // de um agendado esperando desde antes.
    const postsToRender = await db.socialPost.findMany({
      where: {
        renderStatus: RenderStatus.PENDING,
        nextRenderAt: { lte: now },
        renderAttempts: { lt: 3 },
        status: { in: [PostStatus.SCHEDULED, PostStatus.DRAFT] },
        pageId: { not: null },
      },
      orderBy: { nextRenderAt: 'asc' },
      take: 5, // Limit to 5 per execution (Vercel 120s timeout)
    })

    if (postsToRender.length === 0) {
      return NextResponse.json({ success: true, rendered: 0 })
    }

    console.log(`[render-stories] Processing ${postsToRender.length} posts...`)

    let rendered = 0
    let failed = 0

    for (const post of postsToRender) {
      try {
        // Lock: set status to RENDERING
        await db.socialPost.update({
          where: { id: post.id },
          data: { renderStatus: RenderStatus.RENDERING },
        })

        // Render the story image
        const result = await renderStoryImage(
          post.pageId!,
          post.id,
          post.slotValues as Record<string, unknown> | undefined,
        )

        // Success: gravar SÓ se o post ainda está RENDERING. Se uma edição
        // invalidou o render no meio do voo (status voltou a PENDING), gravar
        // aqui ressuscitaria a arte velha por cima da invalidação — o certo é
        // descartar este resultado e deixar o próximo ciclo re-renderizar.
        const confirmed = await db.socialPost.updateMany({
          where: { id: post.id, renderStatus: RenderStatus.RENDERING },
          data: {
            renderStatus: RenderStatus.RENDERED,
            renderedImageUrl: result.url,
            renderedAt: new Date(),
            renderError: null,
            // Also set mediaUrls so the executor can use it
            mediaUrls: [result.url],
          },
        })

        if (confirmed.count === 0) {
          console.log(`[render-stories] ↩ ${post.id} invalidated mid-render — discarding, will re-render`)
          continue
        }

        console.log(`[render-stories] ✓ ${post.id} rendered → ${result.url}`)
        rendered++
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[render-stories] ✗ ${post.id} failed:`, errorMessage)

        const newAttempts = post.renderAttempts + 1

        if (newAttempts >= 3) {
          // Max retries exceeded. Condicional pelo mesmo motivo do sucesso:
          // se uma edição invalidou no meio, o post voltou a PENDING com
          // tentativas zeradas — o dado mudou, a falha antiga não vale mais.
          await db.socialPost.updateMany({
            where: { id: post.id, renderStatus: RenderStatus.RENDERING },
            data: {
              renderStatus: RenderStatus.RENDER_FAILED,
              renderAttempts: newAttempts,
              renderError: errorMessage,
            },
          })
        } else {
          // Schedule retry with exponential backoff: 2^attempts * 2 minutes
          const backoffMs = Math.pow(2, newAttempts) * 2 * 60 * 1000
          await db.socialPost.updateMany({
            where: { id: post.id, renderStatus: RenderStatus.RENDERING },
            data: {
              renderStatus: RenderStatus.PENDING,
              renderAttempts: newAttempts,
              renderError: errorMessage,
              nextRenderAt: new Date(Date.now() + backoffMs),
            },
          })
        }

        failed++
      }
    }

    console.log(`[render-stories] Done: ${rendered} rendered, ${failed} failed`)

    return NextResponse.json({
      success: true,
      processed: postsToRender.length,
      rendered,
      failed,
    })
  } catch (error) {
    console.error('[render-stories] Cron error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
