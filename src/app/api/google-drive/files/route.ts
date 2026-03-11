import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { googleDriveService } from '@/server/google-drive-service'
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit'
import type { GoogleDriveListResponse } from '@/types/google-drive'

const querySchema = z.object({
  folderId: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
  pageToken: z.string().min(1).optional(),
  mode: z.enum(['folders', 'images', 'videos', 'both']).default('folders'),
})

const DRIVE_FILES_CACHE_TTL_MS = 60_000
const DRIVE_FILES_RATE_LIMIT = 300

const driveFilesResponseCache = new Map<string, { payload: GoogleDriveListResponse; timestamp: number }>()

function getDriveFilesCacheKey({
  userId,
  folderId,
  mode,
  pageToken,
  search,
}: {
  userId: string
  folderId?: string
  mode: 'folders' | 'images' | 'videos' | 'both'
  pageToken?: string
  search?: string
}) {
  return [userId, folderId ?? 'root', mode, pageToken ?? '', search?.trim().toLowerCase() ?? ''].join(':')
}

function getCachedDriveFilesPayload(cacheKey: string) {
  const cached = driveFilesResponseCache.get(cacheKey)
  if (!cached) {
    return null
  }

  if (Date.now() - cached.timestamp > DRIVE_FILES_CACHE_TTL_MS) {
    driveFilesResponseCache.delete(cacheKey)
    return null
  }

  return cached.payload
}

export async function GET(req: Request) {
  let cacheKey: string | null = null
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!googleDriveService.isEnabled()) {
      return NextResponse.json({ error: 'Google Drive não configurado' }, { status: 503 })
    }

    const { searchParams } = new URL(req.url)
    const parseResult = querySchema.safeParse({
      folderId: searchParams.get('folderId') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      pageToken: searchParams.get('pageToken') ?? undefined,
      mode: searchParams.get('mode') ?? undefined,
    })

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Parâmetros inválidos', details: parseResult.error.flatten() }, { status: 400 })
    }

    const payload = {
      ...parseResult.data,
      search: parseResult.data.search?.trim() || undefined,
    }

    cacheKey = getDriveFilesCacheKey({
      userId,
      folderId: payload.folderId,
      mode: payload.mode,
      pageToken: payload.pageToken,
      search: payload.search,
    })

    const cachedPayload = getCachedDriveFilesPayload(cacheKey)
    if (cachedPayload) {
      return NextResponse.json(cachedPayload, {
        headers: { 'X-Drive-Cache': 'HIT' },
      })
    }

    assertRateLimit({
      key: `drive:files:${userId}:${payload.mode}:${payload.folderId ?? 'root'}`,
      limit: DRIVE_FILES_RATE_LIMIT,
    })

    const result = await googleDriveService.listFiles(payload)
    driveFilesResponseCache.set(cacheKey, {
      payload: result,
      timestamp: Date.now(),
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof RateLimitError) {
      if (cacheKey) {
        const cachedPayload = getCachedDriveFilesPayload(cacheKey)
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

    console.error('[API] Failed to list Google Drive files', error)
    return NextResponse.json({ error: 'Erro ao listar arquivos do Google Drive' }, { status: 502 })
  }
}
export const runtime = 'nodejs'
