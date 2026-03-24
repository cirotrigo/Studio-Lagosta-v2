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

    // Find posts that need rendering
    const postsToRender = await db.socialPost.findMany({
      where: {
        renderStatus: RenderStatus.PENDING,
        nextRenderAt: { lte: now },
        renderAttempts: { lt: 3 },
        status: PostStatus.SCHEDULED,
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

        // Success: update with rendered image
        await db.socialPost.update({
          where: { id: post.id },
          data: {
            renderStatus: RenderStatus.RENDERED,
            renderedImageUrl: result.url,
            renderedAt: new Date(),
            renderError: null,
            // Also set mediaUrls so the executor can use it
            mediaUrls: [result.url],
          },
        })

        console.log(`[render-stories] ✓ ${post.id} rendered → ${result.url}`)
        rendered++
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[render-stories] ✗ ${post.id} failed:`, errorMessage)

        const newAttempts = post.renderAttempts + 1

        if (newAttempts >= 3) {
          // Max retries exceeded
          await db.socialPost.update({
            where: { id: post.id },
            data: {
              renderStatus: RenderStatus.RENDER_FAILED,
              renderAttempts: newAttempts,
              renderError: errorMessage,
            },
          })
        } else {
          // Schedule retry with exponential backoff: 2^attempts * 2 minutes
          const backoffMs = Math.pow(2, newAttempts) * 2 * 60 * 1000
          await db.socialPost.update({
            where: { id: post.id },
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
