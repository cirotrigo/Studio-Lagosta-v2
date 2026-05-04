import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { del } from '@vercel/blob'
import { db } from '@/lib/db'
import {
  fetchProjectWithShares,
  hasProjectWriteAccess,
} from '@/lib/projects/access'
import { extractBlobPathname } from '@/lib/cleanup/blob-cleanup'
import { googleDriveService } from '@/server/google-drive-service'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { ids } = body

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 })
    }

    // Buscar gerações com verificação de ownership
    const generations = await db.generation.findMany({
      where: {
        id: { in: ids },
      },
      select: {
        id: true,
        projectId: true,
        resultUrl: true,
        fileName: true,
        googleDriveFileId: true,
      },
    })

    // Verificar se todas as gerações têm acesso válido considerando organizações
    const unauthorizedGenerations = []
    for (const gen of generations) {
      const project = await fetchProjectWithShares(gen.projectId)
      if (!hasProjectWriteAccess(project, { userId, orgId })) {
        unauthorizedGenerations.push(gen)
      }
    }

    if (unauthorizedGenerations.length > 0) {
      return NextResponse.json(
        { error: 'Não autorizado para deletar alguns criativos' },
        { status: 403 }
      )
    }

    // Limpar Drive em batch (uma chamada com todos os fileIds)
    const driveFileIds = generations
      .map((g) => g.googleDriveFileId)
      .filter((id): id is string => Boolean(id))

    if (driveFileIds.length > 0 && googleDriveService.isEnabled()) {
      try {
        await googleDriveService.deleteFiles(driveFileIds)
      } catch (driveError) {
        console.warn('[bulk-delete] Failed to delete some Drive files:', driveError)
      }
    }

    // Limpar blobs do Vercel em paralelo
    const blobPathnames = generations
      .map((g) => g.fileName ?? extractBlobPathname(g.resultUrl))
      .filter((p): p is string => Boolean(p))

    if (blobPathnames.length > 0) {
      const blobResults = await Promise.allSettled(blobPathnames.map((p) => del(p)))
      const failedBlobs = blobResults.filter((r) => r.status === 'rejected').length
      if (failedBlobs > 0) {
        console.warn(`[bulk-delete] Failed to delete ${failedBlobs} blob(s)`)
      }
    }

    // Deletar gerações em lote
    const result = await db.generation.deleteMany({
      where: {
        id: { in: ids },
      },
    })

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    })
  } catch (error) {
    console.error('[API] Failed to bulk delete generations:', error)
    return NextResponse.json(
      { error: 'Erro ao deletar criativos' },
      { status: 500 }
    )
  }
}
