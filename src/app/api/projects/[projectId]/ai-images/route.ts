import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'
import { z } from 'zod'

const createAiImageSchema = z.object({
  fileUrl: z.string().url(),
  prompt: z.string().max(3000).default(''),
  format: z.enum(['FEED_PORTRAIT', 'STORY', 'SQUARE']),
  name: z.string().min(1).max(120).optional(),
  provider: z.string().max(100).optional(),
  model: z.string().max(150).optional(),
  mode: z.enum(['GENERATE', 'EDIT', 'OUTPAINT']).optional(),
  sourceImageId: z.string().optional(),
})

function inferFormat(aspectRatio: string | null, width: number, height: number): 'FEED_PORTRAIT' | 'STORY' | 'SQUARE' {
  if (aspectRatio === '9:16') return 'STORY'
  if (aspectRatio === '1:1') return 'SQUARE'
  if (aspectRatio === '4:5') return 'FEED_PORTRAIT'
  if (height > width * 1.6) return 'STORY'
  if (Math.abs(width - height) <= 20) return 'SQUARE'
  return 'FEED_PORTRAIT'
}

function dimensionsForFormat(format: 'FEED_PORTRAIT' | 'STORY' | 'SQUARE') {
  switch (format) {
    case 'STORY':
      return { width: 1080, height: 1920, aspectRatio: '9:16' as const }
    case 'SQUARE':
      return { width: 1080, height: 1080, aspectRatio: '1:1' as const }
    default:
      return { width: 1080, height: 1350, aspectRatio: '4:5' as const }
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId: projectIdStr } = await params
  const projectId = Number(projectIdStr)

  if (isNaN(projectId)) {
    return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
  }

  try {
    // Verificar ownership do projeto
    const project = await fetchProjectWithShares(projectId)

    if (!project || !hasProjectReadAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Query params para filtros
    const { searchParams } = new URL(request.url)
    const createdBy = searchParams.get('createdBy') || undefined

    // Construir filtro de busca
    const whereFilter = {
      projectId,
      ...(createdBy && { createdBy }),
    }

    // Buscar imagens IA do projeto
    const images = await db.aIGeneratedImage.findMany({
      where: whereFilter,
      orderBy: { createdAt: 'desc' },
    })

    const normalized = images.map((img) => ({
      ...img,
      format: inferFormat(img.aspectRatio, img.width, img.height),
    }))

    return NextResponse.json(normalized)
  } catch (error) {
    console.error('Error fetching AI images:', error)
    return NextResponse.json(
      { error: 'Failed to fetch AI images' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId: projectIdStr } = await params
  const projectId = Number(projectIdStr)
  if (isNaN(projectId)) {
    return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
  }

  let body: z.infer<typeof createAiImageSchema>
  try {
    const raw = await request.json()
    body = createAiImageSchema.parse(raw)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const project = await fetchProjectWithShares(projectId)
    if (!project || !hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const dims = dimensionsForFormat(body.format)
    const created = await db.aIGeneratedImage.create({
      data: {
        projectId,
        name: body.name || `Arte aprovada - ${new Date().toLocaleString('pt-BR')}`,
        prompt: body.prompt || '',
        mode: body.mode || 'GENERATE',
        fileUrl: body.fileUrl,
        thumbnailUrl: body.fileUrl,
        width: dims.width,
        height: dims.height,
        aspectRatio: dims.aspectRatio,
        provider: body.provider || 'lagosta-html-renderer',
        model: body.model || 'html-css-renderer-v1',
        sourceImageId: body.sourceImageId,
        createdBy: userId,
      },
    })

    return NextResponse.json({
      ...created,
      format: body.format,
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating AI image record:', error)
    return NextResponse.json(
      { error: 'Failed to create AI image record' },
      { status: 500 }
    )
  }
}
