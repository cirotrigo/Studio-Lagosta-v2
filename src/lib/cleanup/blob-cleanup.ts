import { db } from '@/lib/db'
import { del } from '@vercel/blob'
import { PostStatus } from '../../../prisma/generated/client'

interface CleanupStats {
  postsProcessed: number
  blobsDeleted: number
  errors: number
}

/**
 * Cleanup de blobs baseado em regras de retenção:
 * - Feed posts: 7 dias após envio
 * - Stories recorrentes: 7 dias após última data agendada
 */
export async function cleanupExpiredBlobs(): Promise<CleanupStats> {
  const stats: CleanupStats = {
    postsProcessed: 0,
    blobsDeleted: 0,
    errors: 0,
  }

  const now = new Date()
  const retentionDays = 7

  try {
    // 1. Buscar posts elegíveis para cleanup
    const posts = await db.socialPost.findMany({
      where: {
        status: PostStatus.POSTED,
        blobPathnames: { isEmpty: false },
        OR: [
          // Feed posts: sentAt + 7 dias
          {
            postType: { in: ['POST', 'REEL', 'CAROUSEL'] },
            sentAt: {
              lte: new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000),
            },
          },
          // Stories não recorrentes: sentAt + 7 dias
          {
            postType: 'STORY',
            isRecurring: false,
            sentAt: {
              lte: new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000),
            },
          },
        ],
      },
      select: {
        id: true,
        blobPathnames: true,
        postType: true,
      },
    })

    // 2. Buscar stories recorrentes que terminaram
    const recurringStories = await db.socialPost.findMany({
      where: {
        postType: 'STORY',
        isRecurring: true,
        status: PostStatus.POSTED,
        blobPathnames: { isEmpty: false },
      },
      select: {
        id: true,
        blobPathnames: true,
        recurringConfig: true,
      },
    })

    // Filtrar stories recorrentes que passaram endDate + 7 dias
    const expiredRecurringStories = recurringStories.filter((story) => {
      if (!story.recurringConfig || typeof story.recurringConfig !== 'object') {
        return false
      }

      const config = story.recurringConfig as { endDate?: string }
      if (!config.endDate) return false

      const endDate = new Date(config.endDate)
      const expiryDate = new Date(
        endDate.getTime() + retentionDays * 24 * 60 * 60 * 1000
      )

      return now >= expiryDate
    })

    const allPostsToCleanup = [...posts, ...expiredRecurringStories]

    // 3. Deletar blobs de cada post
    for (const post of allPostsToCleanup) {
      try {
        stats.postsProcessed++

        // Deletar cada blob
        for (const pathname of post.blobPathnames) {
          try {
            await del(pathname)
            stats.blobsDeleted++
          } catch (error) {
            console.error(`Failed to delete blob ${pathname}:`, error)
            stats.errors++
          }
        }

        // Remover pathnames do banco
        await db.socialPost.update({
          where: { id: post.id },
          data: { blobPathnames: [] },
        })

        console.log(`✅ Cleaned up post ${post.id} (${post.blobPathnames.length} blobs)`)
      } catch (error) {
        console.error(`Failed to cleanup post ${post.id}:`, error)
        stats.errors++
      }
    }

    console.log('🧹 Cleanup completed:', stats)
    return stats
  } catch (error) {
    console.error('Cleanup failed:', error)
    throw error
  }
}
