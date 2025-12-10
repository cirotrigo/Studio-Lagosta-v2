import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { deleteVectorsByEntry } from '@/lib/knowledge/vector-client'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

/**
 * Cron job para arquivar entradas de conhecimento expiradas
 * Execução: Diária (ex: 03:00 UTC)
 * Vercel Cron: 0 3 * * *
 */
export async function GET(req: Request) {
  try {
    // Autenticação do cron (Vercel Cron Secret)
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const startTime = Date.now()

    console.log('[cron:archive-expired-knowledge] Starting job at', now.toISOString())

    // Buscar entradas expiradas que ainda estão ACTIVE
    const expiredEntries = await db.knowledgeBaseEntry.findMany({
      where: {
        expiresAt: {
          lte: now, // Menor ou igual a agora (já expirou)
        },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        projectId: true,
        userId: true,
        workspaceId: true,
        title: true,
        category: true,
        expiresAt: true,
      },
    })

    if (expiredEntries.length === 0) {
      console.log('[cron:archive-expired-knowledge] No expired entries found')
      return NextResponse.json({
        success: true,
        archived: 0,
        message: 'No expired entries to archive',
        durationMs: Date.now() - startTime,
      })
    }

    console.log(`[cron:archive-expired-knowledge] Found ${expiredEntries.length} expired entries`)

    let archivedCount = 0
    let vectorsDeletedCount = 0
    const errors: Array<{ entryId: string; error: string }> = []

    // Processar cada entrada expirada
    for (const entry of expiredEntries) {
      try {
        // 1. Deletar vetores do Upstash
        const deletedVectors = await deleteVectorsByEntry(entry.id, {
          projectId: entry.projectId,
          userId: entry.userId ?? undefined,
          workspaceId: entry.workspaceId ?? undefined,
        })

        vectorsDeletedCount += deletedVectors

        // 2. Arquivar entrada no banco
        await db.knowledgeBaseEntry.update({
          where: { id: entry.id },
          data: {
            status: 'ARCHIVED',
            updatedBy: 'system:cron:archive-expired',
          },
        })

        archivedCount++

        console.log(
          `[cron:archive-expired-knowledge] Archived entry ${entry.id} - "${entry.title}" (expired at ${entry.expiresAt?.toISOString()})`
        )
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        errors.push({ entryId: entry.id, error: errorMessage })
        console.error(`[cron:archive-expired-knowledge] Error archiving entry ${entry.id}:`, error)
      }
    }

    const durationMs = Date.now() - startTime

    console.log(
      `[cron:archive-expired-knowledge] Job completed in ${durationMs}ms - Archived: ${archivedCount}/${expiredEntries.length}, Vectors deleted: ${vectorsDeletedCount}`
    )

    return NextResponse.json({
      success: true,
      archived: archivedCount,
      total: expiredEntries.length,
      vectorsDeleted: vectorsDeletedCount,
      errors: errors.length > 0 ? errors : undefined,
      durationMs,
    })
  } catch (error) {
    console.error('[cron:archive-expired-knowledge] Fatal error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
