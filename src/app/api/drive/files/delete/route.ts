import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { googleDriveService } from '@/server/google-drive-service'
import { idsDoDriveNaRotaDoProjeto } from '@/lib/google-drive/escopo'
import { PermissionError, requireAdminUser, requireProjectAccess } from '@/lib/permissions'
import { db } from '@/lib/db'

const naoEncontrado = () => NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

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

    // Todos sob as pastas deste projeto, ou nada. Apaga-se o item pedido
    // (o atalho, nunca o destino dele).
    if (!(await idsDoDriveNaRotaDoProjeto(userId, projectId, fileIds))) {
      return naoEncontrado()
    }

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
    // Projeto inexistente, sem acesso e pasta fora do projeto: a mesma resposta.
    if (error instanceof PermissionError) {
      return naoEncontrado()
    }

    console.error('[Drive API] Failed to delete files', error)
    return NextResponse.json({ error: 'Erro ao deletar arquivos' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
