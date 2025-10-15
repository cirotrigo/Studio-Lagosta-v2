import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'

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

    return NextResponse.json(images)
  } catch (error) {
    console.error('Error fetching AI images:', error)
    return NextResponse.json(
      { error: 'Failed to fetch AI images' },
      { status: 500 }
    )
  }
}
