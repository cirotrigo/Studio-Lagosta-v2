import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'
import { z } from 'zod'

export const runtime = 'nodejs'

// Schema for PUT request
const brandStyleSchema = z.object({
  styleDescription: z.string().max(2000).optional(),
  visualElements: z.object({
    layouts: z.array(z.string()).optional(),
    typography: z.array(z.string()).optional(),
    patterns: z.array(z.string()).optional(),
  }).optional(),
  referenceImageUrls: z.array(z.string().url()).max(10).optional(),
})

interface VisualElements {
  layouts?: string[]
  typography?: string[]
  patterns?: string[]
}

interface BrandStyleResponse {
  styleDescription: string | null
  visualElements: VisualElements | null
  referenceImageUrls: string[]
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
  const projectIdNum = Number(projectId)
  const { userId, orgId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (!projectIdNum || isNaN(projectIdNum)) {
    return NextResponse.json({ error: 'ID do projeto inválido' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!project || !hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  // Access fields safely (may not exist in database yet)
  const projectData = project as typeof project & {
    brandStyleDescription?: string | null
    brandVisualElements?: VisualElements | null
    brandReferenceUrls?: string[]
  }

  const response: BrandStyleResponse = {
    styleDescription: projectData.brandStyleDescription ?? null,
    visualElements: projectData.brandVisualElements ?? null,
    referenceImageUrls: projectData.brandReferenceUrls ?? [],
  }

  return NextResponse.json(response)
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
  const projectIdNum = Number(projectId)
  const { userId, orgId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (!projectIdNum || isNaN(projectIdNum)) {
    return NextResponse.json({ error: 'ID do projeto inválido' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!project || !hasProjectWriteAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto não encontrado ou sem permissão' }, { status: 404 })
  }

  // Parse and validate request body
  let body: z.infer<typeof brandStyleSchema>
  try {
    const rawBody = await req.json()
    body = brandStyleSchema.parse(rawBody)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Erro ao processar requisição' }, { status: 400 })
  }

  // Update project with brand style data
  // Note: These fields need to exist in the database schema
  try {
    await db.project.update({
      where: { id: projectIdNum },
      data: {
        brandStyleDescription: body.styleDescription ?? null,
        brandVisualElements: body.visualElements ?? null,
        brandReferenceUrls: body.referenceImageUrls ?? [],
      } as Record<string, unknown>,
    })

    return NextResponse.json({
      success: true,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[brand-style] Error updating project:', error)
    
    // Check if error is due to missing columns
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    if (errorMessage.includes('Unknown argument')) {
      return NextResponse.json(
        { 
          error: 'Campos de brand-style ainda não disponíveis no banco de dados. Execute a migration primeiro.',
          code: 'SCHEMA_NOT_MIGRATED'
        },
        { status: 503 }
      )
    }
    
    return NextResponse.json({ error: 'Erro ao salvar estilo' }, { status: 500 })
  }
}
