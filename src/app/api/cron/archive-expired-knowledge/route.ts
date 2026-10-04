import { NextResponse } from 'next/server'
import { previewSideEffectsAreDisabled } from '@/lib/preview-isolation'
import { db } from '@/lib/db'
import { arquivarEntradaBase } from '@/lib/knowledge/archive'
import { LIMPEZA_ARQUIVAMENTO_PENDENTE } from '@/lib/knowledge/marca-de-indexado'
import { hashDoConteudo } from '@/lib/knowledge/entry-fingerprint'
import { expirarSugestoesPendentes } from '@/lib/aprendizado/captura'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

/**
 * Cron job para arquivar entradas de conhecimento expiradas
 * Execução: Diária (ex: 03:00 UTC)
 * Vercel Cron: 0 3 * * *
 *
 * Carona deliberada: a varredura que fecha como `expirada` a SUGESTÃO que
 * ninguém decidiu roda aqui, e não em cron novo. É a mesma natureza de
 * trabalho (o que venceu, vence), a cadência diária basta para uma janela de
 * 14 dias, e cron novo custa uma entrada no `vercel.json` para um `updateMany`
 * que costuma tocar zero linha. Sem ela, proposta ignorada ficaria pendente
 * para sempre e o KPI de aceitação nunca fecharia — indiferença sumiria do
 * denominador em vez de contar como o que é.
 */
export async function GET(req: Request) {
  try {
    if (previewSideEffectsAreDisabled(process.env)) {
      return NextResponse.json({ error: 'Jobs desativados no Preview.' }, { status: 403 })
    }
    // Autenticação do cron (Vercel Cron Secret)
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const startTime = Date.now()

    console.log('[cron:archive-expired-knowledge] Starting job at', now.toISOString())

    // Antes do early return de "nada expirado": as duas varreduras são
    // independentes, e sair cedo por falta de entrada de conhecimento deixaria
    // as sugestões pendentes para sempre.
    const sugestoesExpiradas = await expirarSugestoesPendentes()
    if (sugestoesExpiradas > 0) {
      console.log(
        `[cron:archive-expired-knowledge] ${sugestoesExpiradas} sugestão(ões) sem desfecho marcadas como expiradas`,
      )
    }

    // Expiradas ACTIVE e limpezas ARCHIVED pendentes (inclusive queda antes do recibo).
    const expiredEntries = await db.knowledgeBaseEntry.findMany({
      where: {
        OR: [
          { status: 'ACTIVE', expiresAt: { lte: now } },
          { status: 'ARCHIVED', metadata: { path: [LIMPEZA_ARQUIVAMENTO_PENDENTE], equals: true } },
        ],
      },
      select: {
        id: true,
        projectId: true,
        userId: true,
        workspaceId: true,
        title: true,
        category: true,
        expiresAt: true,
        updatedAt: true,
        content: true,
      },
    })

    if (expiredEntries.length === 0) {
      console.log('[cron:archive-expired-knowledge] No expired entries found')
      return NextResponse.json({
        success: true,
        archived: 0,
        sugestoesExpiradas,
        message: 'No expired entries to archive',
        durationMs: Date.now() - startTime,
      })
    }

    const receipts: Array<Awaited<ReturnType<typeof arquivarEntradaBase>>> = []
    console.log(`[cron:archive-expired-knowledge] Found ${expiredEntries.length} expired entries`)

    let archivedCount = 0
    let vectorsDeletedCount = 0
    const errors: Array<{ entryId: string; error: string }> = []

    // Processar cada entrada expirada
    for (const entry of expiredEntries) {
      try {
        const receipt = await arquivarEntradaBase({ entryId: entry.id, projectId: entry.projectId,
          autor: 'system:cron:archive-expired', updatedAt: entry.updatedAt, contentHash: hashDoConteudo(entry.content) })
        receipts.push(receipt)
        if (receipt.arquivada) archivedCount++
        if (receipt.vectors.status === 'confirmed') vectorsDeletedCount += receipt.vectors.deleted ?? 0

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
      success: errors.length === 0 && receipts.every(receipt => receipt.status === 'complete'),
      archived: archivedCount,
      sugestoesExpiradas,
      total: expiredEntries.length,
      vectorsDeleted: vectorsDeletedCount,
      errors: errors.length > 0 ? errors : undefined,
      cacheInvalidatedProjects: new Set(receipts.filter(receipt => receipt.cache.status === 'confirmed').map(receipt => receipt.cache.projectId)).size,
      partial: receipts.filter(receipt => receipt.status === 'partial').map(({ entradaId, database, vectors, cache, estadoAtual }) => ({ entradaId, database, vectors, cache, estadoAtual })),
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
