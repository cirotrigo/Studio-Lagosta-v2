import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { googleDriveService } from '@/server/google-drive-service'
import { PermissionError, requireAdminUser, requireProjectAccess } from '@/lib/permissions'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!googleDriveService.isEnabled()) {
      return NextResponse.json({ error: 'Google Drive não configurado' }, { status: 503 })
    }

    await requireAdminUser()

    const formData = await req.formData()
    const folderId = formData.get('folderId')?.toString().trim()
    const projectIdValue = formData.get('projectId')?.toString()
    const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File)

    if (!folderId) {
      return NextResponse.json({ error: 'folderId é obrigatório' }, { status: 400 })
    }

    const projectId = projectIdValue ? Number(projectIdValue) : NaN
    if (!projectIdValue || Number.isNaN(projectId)) {
      return NextResponse.json({ error: 'projectId inválido' }, { status: 400 })
    }

    if (!files.length) {
      return NextResponse.json({ error: 'Envie pelo menos um arquivo' }, { status: 400 })
    }

    await requireProjectAccess(projectId, { userId, orgId, write: true })

    const uploads = await Promise.all(
      files.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer())
        const mimeType = file.type || 'application/octet-stream'
        const uploadResult = await googleDriveService.uploadFileToFolder({
          buffer,
          folderId,
          mimeType,
          fileName: file.name,
          makePublic: false,
        })

        try {
          await db.driveFileCache.upsert({
            where: { googleFileId: uploadResult.fileId },
            update: {
              name: file.name,
              mimeType,
              kind: 'file',
              parentId: folderId,
              thumbnailUrl: null,
              lastSynced: new Date(),
            },
            create: {
              googleFileId: uploadResult.fileId,
              name: file.name,
              mimeType,
              kind: 'file',
              parentId: folderId,
            },
          })
        } catch (cacheError) {
          console.error('[Drive API] Failed to update cache after upload', cacheError)
        }

        return {
          id: uploadResult.fileId,
          name: file.name,
          mimeType,
          webViewLink: uploadResult.webViewLink,
          webContentLink: uploadResult.webContentLink,
        }
      }),
    )

    return NextResponse.json({ files: uploads })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('[Drive API] Failed to upload files', error)
    return NextResponse.json({ error: 'Erro ao enviar arquivos' }, { status: 500 })
  }
}
