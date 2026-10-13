import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { googleDriveService } from '@/server/google-drive-service'
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import type { GoogleDriveItem } from '@/types/google-drive'
import { idDoDriveValido } from '@/lib/google-drive/id'
import { filtrarAtalhosDoEscopo, raizesNaRotaDoProjeto } from '@/lib/google-drive/escopo'

const querySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const PROJECT_DRIVE_IMAGES_CACHE_TTL_MS = 60_000
const PROJECT_DRIVE_IMAGES_RATE_LIMIT = 300

interface ProjectDriveImagesPayload {
  images: Array<Pick<GoogleDriveItem, 'id' | 'name' | 'mimeType' | 'thumbnailLink' | 'webContentLink'>>
  nextOffset?: number
}

/**
 * O cache guarda a listagem INTEIRA como veio do Drive (com
 * `shortcutDetails`): a conferência dos atalhos e a paginação são refeitas a
 * cada resposta, para o offset sempre bater com o que foi devolvido.
 */
const projectDriveImagesCache = new Map<string, { payload: GoogleDriveItem[]; timestamp: number }>()

function getProjectDriveImagesCacheKey({
  userId,
  projectId,
  driveFolderId,
}: {
  userId: string
  projectId: number
  driveFolderId: string
}) {
  return [userId, projectId, driveFolderId].join(':')
}

function getCachedProjectDriveImages(cacheKey: string) {
  const cached = projectDriveImagesCache.get(cacheKey)
  if (!cached) {
    return null
  }

  if (Date.now() - cached.timestamp > PROJECT_DRIVE_IMAGES_CACHE_TTL_MS) {
    projectDriveImagesCache.delete(cacheKey)
    return null
  }

  return cached.payload
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  let cacheKey: string | null = null
  // O cache guarda a listagem, nunca a decisão: toda resposta (cache
  // inclusive) reconfere os atalhos contra as pastas do projeto de AGORA e
  // só DEPOIS pagina (paginação manual: o Drive devolve a pasta inteira).
  let raizes: Set<string> | null = null
  let offset = 0
  let limit = 20
  const responder = async (itens: GoogleDriveItem[]): Promise<ProjectDriveImagesPayload> => {
    const validos = raizes ? await filtrarAtalhosDoEscopo(itens, raizes) : itens
    return {
      images: validos.slice(offset, offset + limit).map((file) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        thumbnailLink: file.thumbnailLink,
        webContentLink: file.webContentLink,
      })),
      nextOffset: offset + limit < validos.length ? offset + limit : undefined,
    }
  }
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!googleDriveService.isEnabled()) {
      return NextResponse.json({ error: 'Google Drive não configurado' }, { status: 503 })
    }

    // Parse projectId
    const { projectId: projectIdStr } = await params
    const projectId = Number(projectIdStr)

    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'ID do projeto inválido' }, { status: 400 })
    }

    // Verificar acesso ao projeto
    const project = await fetchProjectWithShares(projectId)

    if (!project || !hasProjectReadAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    // Buscar pasta configurada do Google Drive
    const driveFolderId =
      project.googleDriveImagesFolderId ?? project.googleDriveFolderId

    if (!driveFolderId) {
      return NextResponse.json({
        error: 'Pasta do Google Drive não configurada para este projeto',
        images: [],
        nextOffset: undefined
      }, { status: 200 })
    }

    // Pasta mal configurada nunca vira chamada ao Drive.
    if (!idDoDriveValido(driveFolderId)) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    // Parse query params
    const { searchParams } = new URL(req.url)
    const parseResult = querySchema.safeParse({
      offset: searchParams.get('offset') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    })

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Parâmetros inválidos', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }

    offset = parseResult.data.offset
    limit = parseResult.data.limit

    // A pasta é a do projeto, os filhos não são conferidos: atalho para fora
    // do projeto sai (admin: Drive inteiro).
    raizes = await raizesNaRotaDoProjeto(userId, projectId)

    // Listar imagens da pasta
    cacheKey = getProjectDriveImagesCacheKey({ userId, projectId, driveFolderId })
    const cachedPayload = getCachedProjectDriveImages(cacheKey)
    if (cachedPayload) {
      return NextResponse.json(await responder(cachedPayload), {
        headers: { 'X-Drive-Cache': 'HIT' },
      })
    }

    assertRateLimit({
      key: `drive:project-images:${userId}:${projectId}:${driveFolderId}`,
      limit: PROJECT_DRIVE_IMAGES_RATE_LIMIT,
    })

    const result = await googleDriveService.listFiles({
      folderId: driveFolderId,
      mode: 'images',
    })

    if (!result.items) {
      return NextResponse.json({
        images: [],
        nextOffset: undefined
      })
    }

    projectDriveImagesCache.set(cacheKey, {
      payload: result.items,
      timestamp: Date.now(),
    })

    return NextResponse.json(await responder(result.items))
  } catch (error) {
    if (error instanceof RateLimitError) {
      if (cacheKey) {
        const cachedPayload = getCachedProjectDriveImages(cacheKey)
        if (cachedPayload) {
          return NextResponse.json(await responder(cachedPayload), {
            headers: {
              'Retry-After': String(error.retryAfter),
              'X-Drive-Cache': 'STALE',
            },
          })
        }
      }

      return NextResponse.json(
        { error: 'Limite de requisições atingido' },
        { status: 429, headers: { 'Retry-After': String(error.retryAfter) } }
      )
    }

    console.error('[API] Failed to list project Google Drive images', error)
    return NextResponse.json(
      { error: 'Erro ao listar imagens do Google Drive' },
      { status: 502 }
    )
  }
}

export const runtime = 'nodejs'
