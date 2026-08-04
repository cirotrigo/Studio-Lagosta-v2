import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { renderPostArt } from '@/lib/posts/render-post-art'
import { PRIORIDADE_RENDER_MS } from '@/lib/posts/freeze-window'
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
    const filaBase = {
      renderStatus: RenderStatus.PENDING,
      nextRenderAt: { lte: now },
      renderAttempts: { lt: 3 },
      status: { in: [PostStatus.SCHEDULED, PostStatus.DRAFT] },
      pageId: { not: null },
    }

    /**
     * Quem congela primeiro renderiza primeiro.
     *
     * A ordem por `nextRenderAt` é justa mas cega ao horário de publicação:
     * um rascunho sem data reinvalidado agora entrava na frente de um story
     * que vai ser entregue ao publicador em 3 minutos. Com a janela de
     * congelamento isso passou a ser a diferença entre a arte nova entrar ou
     * o post sair com a anterior — o executor até renderiza na hora, mas
     * gastando o orçamento do cron de publicação.
     */
    const urgentes = await db.socialPost.findMany({
      where: {
        ...filaBase,
        status: PostStatus.SCHEDULED,
        laterPostId: null,
        scheduledDatetime: {
          gt: now,
          lte: new Date(now.getTime() + PRIORIDADE_RENDER_MS),
        },
      },
      orderBy: { scheduledDatetime: 'asc' },
      take: 5,
    })

    const restantes = urgentes.length < 5
      ? await db.socialPost.findMany({
          where: { ...filaBase, id: { notIn: urgentes.map((p) => p.id) } },
          orderBy: { nextRenderAt: 'asc' },
          take: 5 - urgentes.length,
        })
      : []

    const postsToRender = [...urgentes, ...restantes]

    if (postsToRender.length === 0) {
      return NextResponse.json({ success: true, rendered: 0 })
    }

    console.log(`[render-stories] Processing ${postsToRender.length} posts...`)

    let rendered = 0
    let failed = 0

    // A reserva, o render e o descarte-em-voo vivem em `renderPostArt`, porque
    // o executor precisa do mesmo comportamento quando um post entra na janela
    // de congelamento sem a arte pronta.
    for (const post of postsToRender) {
      const result = await renderPostArt({
        id: post.id,
        pageId: post.pageId,
        slotValues: post.slotValues,
        renderAttempts: post.renderAttempts,
      })

      if (result.ok) {
        console.log(`[render-stories] ✓ ${post.id} rendered → ${result.url}`)
        rendered++
        continue
      }

      if (result.motivo === 'falhou') {
        console.error(`[render-stories] ✗ ${post.id} failed:`, result.erro)
        failed++
      } else {
        console.log(`[render-stories] ↩ ${post.id} ${result.motivo} — será renderizado no próximo ciclo`)
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
