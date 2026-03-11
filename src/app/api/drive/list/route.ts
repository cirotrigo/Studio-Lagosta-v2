import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { googleDriveService } from '@/server/google-drive-service'
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { PermissionError, requireProjectAccess } from '@/lib/permissions'
import type { DriveFolderType } from '@/types/drive'
import type { GoogleDriveItem } from '@/types/google-drive'

const querySchema = z.object({
  projectId: z.coerce.number().int().positive(),
  folderId: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
  pageToken: z.string().min(1).optional(),
  folderType: z.enum(['images', 'videos']).optional(),
  type: z.enum(['images', 'videos']).optional(),
})

const DRIVE_LIST_CACHE_TTL_MS = 60_000

interface DriveListRoutePayload {
  items: GoogleDriveItem[]
  nextPageToken?: string
  currentFolderId: string
  folderType: DriveFolderType
  folderName?: string | null
  project: {
    id: number
    name: string
    googleDriveFolderId: string | null
    googleDriveFolderName: string | null
    googleDriveImagesFolderId: string | null
    googleDriveImagesFolderName: string | null
    googleDriveVideosFolderId: string | null
    googleDriveVideosFolderName: string | null
  }
}

const driveListResponseCache = new Map<string, { payload: DriveListRoutePayload; timestamp: number }>()

function resolveFolderType(input?: DriveFolderType | null): DriveFolderType {
  if (input === 'videos') return 'videos'
  return 'images'
}

function getDriveListCacheKey({
  userId,
  projectId,
  folderId,
  folderType,
  pageToken,
  search,
}: {
  userId: string
  projectId: number
  folderId: string
  folderType: DriveFolderType
  pageToken?: string
  search?: string
}) {
  return [
    userId,
    projectId,
    folderType,
    folderId,
    pageToken ?? '',
    search?.trim().toLowerCase() ?? '',
  ].join(':')
}

function getCachedDriveListPayload(cacheKey: string) {
  const cached = driveListResponseCache.get(cacheKey)
  if (!cached) {
    return null
  }

  if (Date.now() - cached.timestamp > DRIVE_LIST_CACHE_TTL_MS) {
    driveListResponseCache.delete(cacheKey)
    return null
  }

  return cached.payload
}

export async function GET(req: Request) {
  let cacheKey: string | null = null
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
    const normalizedSearch = search?.trim() || undefined

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

    cacheKey = getDriveListCacheKey({
      userId,
      projectId,
      folderId: effectiveFolderId,
      folderType: resolvedFolderType,
      pageToken,
      search: normalizedSearch,
    })

    const cachedPayload = getCachedDriveListPayload(cacheKey)
    if (cachedPayload) {
      return NextResponse.json(cachedPayload, {
        headers: { 'X-Drive-Cache': 'HIT' },
      })
    }

    assertRateLimit({
      key: `drive:list:${userId}:${projectId}:${resolvedFolderType}:${effectiveFolderId}`,
    })

    const listResponse = await googleDriveService.listFiles({
      folderId: effectiveFolderId,
      search: normalizedSearch,
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

    const payload: DriveListRoutePayload = {
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
    }

    driveListResponseCache.set(cacheKey, {
      payload,
      timestamp: Date.now(),
    })

    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof RateLimitError) {
      if (cacheKey) {
        const cachedPayload = getCachedDriveListPayload(cacheKey)
        if (cachedPayload) {
          return NextResponse.json(cachedPayload, {
            headers: {
              'Retry-After': String(error.retryAfter),
              'X-Drive-Cache': 'STALE',
            },
          })
        }
      }

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
