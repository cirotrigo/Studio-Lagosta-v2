import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { googleDriveService } from '@/server/google-drive-service'
import { db } from '@/lib/db'
import { PermissionError, requireProjectAccess } from '@/lib/permissions'
import type { DriveFolderType } from '@/types/drive'

const bodySchema = z.object({
  name: z.string().trim().min(1, 'Nome da pasta é obrigatório'),
  parentId: z.string().trim().min(1).optional(),
  projectId: z.coerce.number().int().positive(),
  folderType: z.enum(['images', 'videos']).optional(),
})

function resolveFolderType(folderType?: DriveFolderType | null): DriveFolderType {
  return folderType === 'videos' ? 'videos' : 'images'
}

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

    const { name, parentId, projectId, folderType } = parsed.data
    const resolvedFolderType = resolveFolderType(folderType)
    const project = await requireProjectAccess(projectId, { userId, orgId, write: true })

    const defaultParentId =
      resolvedFolderType === 'videos'
        ? project.googleDriveVideosFolderId ?? project.googleDriveFolderId
        : project.googleDriveImagesFolderId ?? project.googleDriveFolderId

    const targetParent = parentId ?? defaultParentId
    if (!targetParent) {
      return NextResponse.json({ error: 'Projeto não possui pasta configurada' }, { status: 400 })
    }

    const folderId = await googleDriveService.createFolder(name, targetParent)

    try {
      await db.driveFileCache.upsert({
        where: { googleFileId: folderId },
        update: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          kind: 'folder',
          parentId: targetParent,
          thumbnailUrl: null,
          lastSynced: new Date(),
        },
        create: {
          googleFileId: folderId,
          name,
          mimeType: 'application/vnd.google-apps.folder',
          kind: 'folder',
          parentId: targetParent,
        },
      })
    } catch (cacheError) {
      console.error('[Drive API] Failed to update folder cache', cacheError)
    }

    return NextResponse.json({ id: folderId, name, parentId: targetParent })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('[Drive API] Failed to create folder', error)
    return NextResponse.json({ error: 'Erro ao criar pasta no Drive' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
