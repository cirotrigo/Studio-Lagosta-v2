import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { googleDriveService } from '@/server/google-drive-service'
import { PermissionError, requireProjectAccess } from '@/lib/permissions'

const querySchema = z.object({
  folderId: z.string().trim().min(1),
  projectId: z.coerce.number().int().positive(),
  fileIds: z.array(z.string().trim().min(1)).optional(),
})

export async function GET(req: Request) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!googleDriveService.isEnabled()) {
      return NextResponse.json({ error: 'Google Drive não configurado' }, { status: 503 })
    }

    const { searchParams } = new URL(req.url)
    const parsed = querySchema.safeParse({
      folderId: searchParams.get('folderId'),
      projectId: searchParams.get('projectId'),
      fileIds: searchParams.getAll('fileIds') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: 'Parâmetros inválidos', details: parsed.error.flatten() }, { status: 400 })
    }

    const { folderId, projectId, fileIds } = parsed.data
    await requireProjectAccess(projectId, { userId, orgId })

    const folderMetaPromise = googleDriveService.getFileMetadata(folderId, 'id, name')
    const filesPromise = fileIds?.length
      ? Promise.all(
          fileIds.map(async (id) => {
            const metadata = await googleDriveService.getFileMetadata(
              id,
              'id, name, mimeType, size, webContentLink',
            )
            const safeId = metadata.id ?? id
            return {
              id: safeId,
              name: metadata.name ?? 'Sem nome',
              mimeType: metadata.mimeType ?? 'application/octet-stream',
              size: metadata.size ? Number(metadata.size) : undefined,
              webContentLink: metadata.webContentLink ?? null,
            }
          }),
        )
      : googleDriveService.listFolderFiles(folderId)

    const [folderMeta, files] = await Promise.all([folderMetaPromise, filesPromise])

    const mapped = files.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      url: file.webContentLink ?? googleDriveService.getPublicUrl(file.id),
    }))

    return NextResponse.json({
      folderId,
      folderName: folderMeta.name ?? undefined,
      files: mapped,
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('[Drive API] Failed to load folder for download', error)
    return NextResponse.json({ error: 'Erro ao preparar download' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
