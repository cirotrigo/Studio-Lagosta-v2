import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { googleDriveService } from '@/server/google-drive-service'
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'

const querySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
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

    const { offset, limit } = parseResult.data

    // Rate limiting
    assertRateLimit({ key: `drive:project-images:${userId}:${projectId}` })

    // Listar imagens da pasta
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

    // Aplicar paginação manual (já que o Google Drive retorna todos os arquivos)
    const paginatedFiles = result.items.slice(offset, offset + limit)
    const hasMore = offset + limit < result.items.length
    const nextOffset = hasMore ? offset + limit : undefined

    // Mapear para o formato esperado
    const images = paginatedFiles.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      thumbnailLink: file.thumbnailLink,
      webContentLink: file.webContentLink,
    }))

    return NextResponse.json({
      images,
      nextOffset,
    })
  } catch (error) {
    if (error instanceof RateLimitError) {
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
