import { db } from '@/lib/db'
import { del } from '@vercel/blob'
import { PostStatus } from '../../../prisma/generated/client'
import { googleDriveService } from '@/server/google-drive-service'

interface CleanupStats {
  postsProcessed: number
  blobsDeleted: number
  errors: number
}

export interface GenerationCleanupStats {
  generationsRepointed: number
  generationsRecovered: number
  generationsDeleted: number
  blobsDeleted: number
  errors: number
  budgetExceeded: boolean
}

const VERCEL_BLOB_HOST_FRAGMENT = 'blob.vercel-storage.com'
const GENERATION_RETENTION_DAYS = 90
const GENERATION_CLEANUP_CONCURRENCY = 5
const GENERATION_CLEANUP_BUDGET_MS = 50_000

/**
 * Extracts the blob pathname from a Vercel Blob URL.
 * Returns null if the URL is not a Vercel Blob URL or is invalid.
 */
export function extractBlobPathname(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes(VERCEL_BLOB_HOST_FRAGMENT)) {
      return null
    }
    return parsed.pathname.replace(/^\//, '') || null
  } catch {
    return null
  }
}

function isVercelBlobUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return url.includes(VERCEL_BLOB_HOST_FRAGMENT)
}

async function processInChunks<T>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<void>,
  shouldStop: () => boolean,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    if (shouldStop()) return
    const chunk = items.slice(i, i + size)
    await Promise.allSettled(chunk.map(worker))
  }
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

/**
 * Cleanup de Generations baseado em retenção:
 * - Pass A: gerações > 90 dias COM Drive backup → repointa resultUrl pra Drive, deleta o blob, mantém a linha.
 * - Pass B: gerações > 90 dias SEM Drive backup → tenta retry de backup; se sucesso vira A, senão deleta blob+linha.
 *
 * Idempotente: filtra por resultUrl ainda apontando pra Vercel Blob.
 */
export async function cleanupGenerations(): Promise<GenerationCleanupStats> {
  const stats: GenerationCleanupStats = {
    generationsRepointed: 0,
    generationsRecovered: 0,
    generationsDeleted: 0,
    blobsDeleted: 0,
    errors: 0,
    budgetExceeded: false,
  }

  const startedAt = Date.now()
  const shouldStop = () => {
    if (Date.now() - startedAt > GENERATION_CLEANUP_BUDGET_MS) {
      if (!stats.budgetExceeded) {
        console.warn('[cleanupGenerations] WARN_BUDGET_EXCEEDED — skipping remainder, next run will catch')
      }
      stats.budgetExceeded = true
      return true
    }
    return false
  }

  const cutoff = new Date(Date.now() - GENERATION_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  // Pass A: gerações antigas COM Drive backup ainda apontando pra Vercel Blob
  const repointable = await db.generation.findMany({
    where: {
      createdAt: { lt: cutoff },
      googleDriveBackupUrl: { not: null },
      resultUrl: { contains: VERCEL_BLOB_HOST_FRAGMENT },
    },
    select: {
      id: true,
      resultUrl: true,
      fileName: true,
      googleDriveBackupUrl: true,
    },
  })

  await processInChunks(
    repointable,
    GENERATION_CLEANUP_CONCURRENCY,
    async (gen) => {
      try {
        const pathname = gen.fileName ?? extractBlobPathname(gen.resultUrl)
        if (pathname) {
          try {
            await del(pathname)
            stats.blobsDeleted++
          } catch (error) {
            console.warn(`[cleanupGenerations] Failed to delete blob for ${gen.id}:`, error)
          }
        }
        await db.generation.update({
          where: { id: gen.id },
          data: {
            resultUrl: gen.googleDriveBackupUrl,
            fileName: null,
          },
        })
        stats.generationsRepointed++
      } catch (error) {
        console.error(`[cleanupGenerations] Pass A failed for ${gen.id}:`, error)
        stats.errors++
      }
    },
    shouldStop,
  )

  if (stats.budgetExceeded) {
    return stats
  }

  // Pass B: gerações antigas SEM Drive backup
  const orphans = await db.generation.findMany({
    where: {
      createdAt: { lt: cutoff },
      googleDriveBackupUrl: null,
    },
    select: {
      id: true,
      resultUrl: true,
      fileName: true,
      projectName: true,
      Project: {
        select: {
          id: true,
          name: true,
          googleDriveFolderId: true,
        },
      },
    },
  })

  await processInChunks(
    orphans,
    GENERATION_CLEANUP_CONCURRENCY,
    async (gen) => {
      try {
        // Tentar retry de backup se o projeto tem Drive
        if (
          gen.Project?.googleDriveFolderId &&
          googleDriveService.isEnabled() &&
          gen.resultUrl &&
          isVercelBlobUrl(gen.resultUrl)
        ) {
          try {
            const response = await fetch(gen.resultUrl)
            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer()
              const buffer = Buffer.from(arrayBuffer)
              const backup = await googleDriveService.uploadCreativeToArtesLagosta(
                buffer,
                gen.Project.googleDriveFolderId,
                gen.Project.name,
              )
              const pathname = gen.fileName ?? extractBlobPathname(gen.resultUrl)
              if (pathname) {
                try {
                  await del(pathname)
                  stats.blobsDeleted++
                } catch (delError) {
                  console.warn(`[cleanupGenerations] Failed to delete blob after recovery ${gen.id}:`, delError)
                }
              }
              await db.generation.update({
                where: { id: gen.id },
                data: {
                  googleDriveFileId: backup.fileId,
                  googleDriveBackupUrl: backup.publicUrl,
                  resultUrl: backup.publicUrl,
                  fileName: null,
                },
              })
              stats.generationsRecovered++
              return
            }
          } catch (recoveryError) {
            console.warn(`[cleanupGenerations] Backup retry failed for ${gen.id}:`, recoveryError)
          }
        }

        // Sem chance de recovery — deletar blob + linha
        const pathname = gen.fileName ?? extractBlobPathname(gen.resultUrl)
        if (pathname) {
          try {
            await del(pathname)
            stats.blobsDeleted++
          } catch (error) {
            console.warn(`[cleanupGenerations] Failed to delete blob for ${gen.id}:`, error)
          }
        }
        await db.generation.delete({ where: { id: gen.id } })
        stats.generationsDeleted++
      } catch (error) {
        console.error(`[cleanupGenerations] Pass B failed for ${gen.id}:`, error)
        stats.errors++
      }
    },
    shouldStop,
  )

  console.log('🧹 Generation cleanup completed:', stats)
  return stats
}

/**
 * Cleanup diário e idempotente: repõe URLs Vercel pra Drive em gerações > 90 dias com backup.
 * Mesma lógica do Pass A do cleanupGenerations(), defesa em profundidade caso o cron semanal falhe.
 */
export async function cleanupGenerationBlobs(): Promise<{
  generationsRepointed: number
  blobsDeleted: number
  errors: number
}> {
  const stats = { generationsRepointed: 0, blobsDeleted: 0, errors: 0 }
  const cutoff = new Date(Date.now() - GENERATION_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const candidates = await db.generation.findMany({
    where: {
      createdAt: { lt: cutoff },
      googleDriveBackupUrl: { not: null },
      resultUrl: { contains: VERCEL_BLOB_HOST_FRAGMENT },
    },
    select: {
      id: true,
      resultUrl: true,
      fileName: true,
      googleDriveBackupUrl: true,
    },
  })

  for (const gen of candidates) {
    try {
      const pathname = gen.fileName ?? extractBlobPathname(gen.resultUrl)
      if (pathname) {
        try {
          await del(pathname)
          stats.blobsDeleted++
        } catch (error) {
          console.warn(`[cleanupGenerationBlobs] Failed to delete blob for ${gen.id}:`, error)
        }
      }
      await db.generation.update({
        where: { id: gen.id },
        data: {
          resultUrl: gen.googleDriveBackupUrl,
          fileName: null,
        },
      })
      stats.generationsRepointed++
    } catch (error) {
      console.error(`[cleanupGenerationBlobs] Failed for ${gen.id}:`, error)
      stats.errors++
    }
  }

  console.log('🧹 Generation blobs cleanup completed:', stats)
  return stats
}
