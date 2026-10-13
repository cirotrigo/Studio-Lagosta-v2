import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { googleDriveService } from '@/server/google-drive-service'
import { idsDoDriveNaRotaDoProjeto } from '@/lib/google-drive/escopo'
import { PermissionError, requireProjectAccess } from '@/lib/permissions'
import { db } from '@/lib/db'

const naoEncontrado = () => NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

const bodySchema = z.object({
  fileIds: z.array(z.string().trim().min(1)).min(1, 'Selecione ao menos um arquivo'),
  targetFolderId: z.string().trim().min(1),
  projectId: z.coerce.number().int().positive(),
})

export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!googleDriveService.isEnabled()) {
      return NextResponse.json({ error: 'Google Drive não configurado' }, { status: 503 })
    }

    const json = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 })
    }

    const { fileIds, targetFolderId, projectId } = parsed.data
    await requireProjectAccess(projectId, { userId, orgId, write: true })

    // Arquivos e destino sob as pastas deste projeto, ou nada; o destino é
    // pasta de verdade (não atalho). Move-se o item pedido, nunca o destino
    // de um atalho.
    const permitidos = await idsDoDriveNaRotaDoProjeto(userId, projectId, [...fileIds, targetFolderId])
    if (!permitidos || permitidos[permitidos.length - 1] !== targetFolderId) {
      return naoEncontrado()
    }

    await googleDriveService.moveFiles(fileIds, targetFolderId)

    try {
      await db.driveFileCache.updateMany({
        where: { googleFileId: { in: fileIds } },
        data: {
          parentId: targetFolderId,
          lastSynced: new Date(),
        },
      })
    } catch (cacheError) {
      console.error('[Drive API] Failed to update cache after move', cacheError)
    }

    return NextResponse.json({ moved: fileIds.length })
  } catch (error) {
    // Projeto inexistente, sem acesso e pasta fora do projeto: a mesma resposta.
    if (error instanceof PermissionError) {
      return naoEncontrado()
    }

    console.error('[Drive API] Failed to move files', error)
    return NextResponse.json({ error: 'Erro ao mover arquivos' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
