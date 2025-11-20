import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { googleDriveService } from '@/server/google-drive-service'
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { PermissionError, requireProjectAccess } from '@/lib/permissions'
import type { DriveFolderType } from '@/types/drive'

const querySchema = z.object({
  projectId: z.coerce.number().int().positive(),
  folderId: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
  pageToken: z.string().min(1).optional(),
  folderType: z.enum(['images', 'videos']).optional(),
  type: z.enum(['images', 'videos']).optional(),
})

function resolveFolderType(input?: DriveFolderType | null): DriveFolderType {
  if (input === 'videos') return 'videos'
  return 'images'
}

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
    const parseResult = querySchema.safeParse({
      projectId: searchParams.get('projectId'),
      folderId: searchParams.get('folderId') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      pageToken: searchParams.get('pageToken') ?? undefined,
      folderType: searchParams.get('folder') ?? undefined,
      type: searchParams.get('type') ?? undefined,
    })

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Parâmetros inválidos', details: parseResult.error.flatten() }, { status: 400 })
    }

    const { projectId, folderId, search, pageToken, folderType, type } = parseResult.data
    const resolvedFolderType = resolveFolderType(type ?? folderType ?? null)

    const project = await requireProjectAccess(projectId, { userId, orgId })

    const defaultFolderId =
      resolvedFolderType === 'videos'
        ? project.googleDriveVideosFolderId ?? project.googleDriveFolderId
        : project.googleDriveImagesFolderId ?? project.googleDriveFolderId

    const effectiveFolderId = folderId ?? defaultFolderId

    if (!effectiveFolderId) {
      return NextResponse.json({
        error: 'Projeto não possui pasta configurada para este tipo',
      }, { status: 400 })
    }

    assertRateLimit({ key: `drive:list:${userId}` })

    const listResponse = await googleDriveService.listFiles({
      folderId: effectiveFolderId,
      search,
      pageToken,
      mode: resolvedFolderType === 'videos' ? 'videos' : 'images',
    })

    // Cache file metadata for faster future loads
    try {
      await Promise.all(
        listResponse.items
          .filter((item) => item.kind === 'file')
          .map((item) =>
            db.driveFileCache.upsert({
              where: { googleFileId: item.id },
              update: {
                name: item.name,
                mimeType: item.mimeType,
                kind: item.kind,
                parentId: effectiveFolderId,
                size: item.size ?? null,
                thumbnailUrl: item.thumbnailLink ?? null,
                lastSynced: new Date(),
              },
              create: {
                googleFileId: item.id,
                name: item.name,
                mimeType: item.mimeType,
                kind: item.kind,
                parentId: effectiveFolderId,
                size: item.size ?? null,
                thumbnailUrl: item.thumbnailLink ?? null,
              },
            }),
          ),
      )
    } catch (cacheError) {
      console.error('[Drive API] Failed to update cache', cacheError)
    }

    return NextResponse.json({
      ...listResponse,
      currentFolderId: effectiveFolderId,
      folderType: resolvedFolderType,
      folderName:
        resolvedFolderType === 'videos'
          ? project.googleDriveVideosFolderName ?? project.googleDriveFolderName
          : project.googleDriveImagesFolderName ?? project.googleDriveFolderName,
      project: {
        id: project.id,
        name: project.name,
        googleDriveFolderId: project.googleDriveFolderId,
        googleDriveFolderName: project.googleDriveFolderName,
        googleDriveImagesFolderId: project.googleDriveImagesFolderId,
        googleDriveImagesFolderName: project.googleDriveImagesFolderName,
        googleDriveVideosFolderId: project.googleDriveVideosFolderId,
        googleDriveVideosFolderName: project.googleDriveVideosFolderName,
      },
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Limite de requisições atingido' },
        { status: 429, headers: { 'Retry-After': String(error.retryAfter) } },
      )
    }

    console.error('[Drive API] Failed to list files', error)
    return NextResponse.json({ error: 'Erro ao listar arquivos do Drive' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
