import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { googleDriveService } from '@/server/google-drive-service'
import { PermissionError, requireAdminUser, requireProjectAccess } from '@/lib/permissions'
import { db } from '@/lib/db'

const bodySchema = z.object({
  fileIds: z.array(z.string().trim().min(1)).min(1, 'Selecione ao menos um arquivo'),
  projectId: z.coerce.number().int().positive(),
})

export async function DELETE(req: Request) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!googleDriveService.isEnabled()) {
      return NextResponse.json({ error: 'Google Drive não configurado' }, { status: 503 })
    }

    await requireAdminUser()

    const json = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 })
    }

    const { fileIds, projectId } = parsed.data
    await requireProjectAccess(projectId, { userId, orgId, write: true })

    await googleDriveService.deleteFiles(fileIds)

    try {
      await db.driveFileCache.deleteMany({
        where: { googleFileId: { in: fileIds } },
      })
    } catch (cacheError) {
      console.error('[Drive API] Failed to update cache after delete', cacheError)
    }

    return NextResponse.json({ deleted: fileIds.length })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('[Drive API] Failed to delete files', error)
    return NextResponse.json({ error: 'Erro ao deletar arquivos' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
