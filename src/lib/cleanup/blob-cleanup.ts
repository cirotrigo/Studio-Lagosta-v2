import { db } from '@/lib/db'
import { del } from '@vercel/blob'
import { PostStatus } from '../../../prisma/generated/client'
import { googleDriveService } from '@/server/google-drive-service'
import { reapontarMidiasDosPosts } from './reapontar-midias'
import { ehGeracaoDeVideo } from './geracao-de-video'

interface CleanupStats {
  postsProcessed: number
  blobsDeleted: number
  errors: number
}

export interface GenerationCleanupStats {
  generationsRepointed: number
  /** Posts cujas mídias passaram a apontar para o Drive junto com a Generation. */
  postsReapontados: number
  generationsRecovered: number
  generationsDeleted: number
  /** Vídeos exportados do editor que a limpeza deixou como estão. */
  videosPulados: number
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

/**
 * 🔴 Vídeo exportado do editor NÃO passa pela limpeza de 90 dias. O backup dele
 * no Drive mora em `fieldValues.driveBackupUrl`, não na coluna
 * `googleDriveBackupUrl`: o Pass B o lia como "arte sem backup", reenviava o MP4
 * ao Drive pelo uploader de IMAGEM (PNG) e trocava `resultUrl` e as mídias dos
 * posts por um link lh3 que responde 404 — e, sem pasta no Drive, apagava o MP4
 * e a linha. 12 vídeos ficaram assim até 02/10/2026; um story falhou em 12/09.
 *
 * O filtro é aqui, no código: filtro Json no `where` do Prisma descarta a linha
 * que não TEM o campo, e a limpeza deixaria de limpar quase tudo em silêncio.
 */
function semVideos<T extends { fieldValues: unknown }>(
  geracoes: T[],
  stats: { videosPulados: number },
): T[] {
  const resto = geracoes.filter((g) => !ehGeracaoDeVideo(g.fieldValues))
  stats.videosPulados += geracoes.length - resto.length
  return resto
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
 * Vídeo exportado do editor fica de fora dos dois passes — ver `semVideos`.
 */
export async function cleanupGenerations(): Promise<GenerationCleanupStats> {
  const stats: GenerationCleanupStats = {
    generationsRepointed: 0,
    postsReapontados: 0,
    generationsRecovered: 0,
    generationsDeleted: 0,
    videosPulados: 0,
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
  const antigasComBackup = await db.generation.findMany({
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
      fieldValues: true,
    },
  })
  const repointable = semVideos(antigasComBackup, stats)

  await processInChunks(
    repointable,
    GENERATION_CLEANUP_CONCURRENCY,
    async (gen) => {
      try {
        /*
          🔴 Os POSTS primeiro, o blob depois. Até 05/09/2026 só a Generation era
          reapontada e `SocialPost.mediaUrls` ficava com a URL apagada — 40% das
          artes de posts com mais de 90 dias respondiam 404 (capa quebrada na
          agenda; com repost, URL morta entregue ao Zernio). Se o `del` falhar
          depois disto, o post já aponta para o Drive, que é válido.
        */
        if (gen.resultUrl && gen.googleDriveBackupUrl) {
          const r = await reapontarMidiasDosPosts(gen.resultUrl, gen.googleDriveBackupUrl)
          stats.postsReapontados += r.posts
        }
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
  const antigasSemBackup = await db.generation.findMany({
    where: {
      createdAt: { lt: cutoff },
      googleDriveBackupUrl: null,
    },
    select: {
      id: true,
      resultUrl: true,
      fileName: true,
      projectName: true,
      fieldValues: true,
      Project: {
        select: {
          id: true,
          name: true,
          googleDriveFolderId: true,
        },
      },
    },
  })
  const orphans = semVideos(antigasSemBackup, stats)

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
              // Mesma regra do Pass A: os posts antes do blob.
              if (gen.resultUrl) {
                const r = await reapontarMidiasDosPosts(gen.resultUrl, backup.publicUrl)
                stats.postsReapontados += r.posts
              }
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
 * Vídeo exportado do editor também fica de fora — ver `semVideos`.
 */
export async function cleanupGenerationBlobs(): Promise<{
  generationsRepointed: number
  videosPulados: number
  blobsDeleted: number
  errors: number
}> {
  const stats = { generationsRepointed: 0, videosPulados: 0, blobsDeleted: 0, errors: 0 }
  const cutoff = new Date(Date.now() - GENERATION_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const antigasComBackup = await db.generation.findMany({
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
      fieldValues: true,
    },
  })
  const candidates = semVideos(antigasComBackup, stats)

  for (const gen of candidates) {
    try {
      // Os posts antes do blob — ver o Pass A de `cleanupGenerations`.
      if (gen.resultUrl && gen.googleDriveBackupUrl) {
        await reapontarMidiasDosPosts(gen.resultUrl, gen.googleDriveBackupUrl)
      }
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
