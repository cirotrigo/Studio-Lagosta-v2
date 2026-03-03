import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'

export const runtime = 'nodejs'

interface BrandAssetsResponse {
  projectId: number
  name: string
  instagramUsername: string | null
  cuisineType: string | null
  logo: {
    url: string
    width: number | null
    height: number | null
  } | null
  colors: string[]
  fonts: string[]
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

  // Fetch brand colors
  const colors = await db.brandColor.findMany({
    where: { projectId: projectIdNum },
    select: { hexCode: true },
    orderBy: { createdAt: 'asc' },
  })

  // Fetch custom fonts
  const fonts = await db.customFont.findMany({
    where: { projectId: projectIdNum },
    select: { name: true },
    orderBy: { createdAt: 'asc' },
  })

  // Get project logo (isProjectLogo = true)
  const projectLogo = project.Logo?.[0] ?? null

  // Access brandStyleDescription and cuisineType safely (may not exist yet)
  const projectData = project as typeof project & {
    brandStyleDescription?: string | null
    cuisineType?: string | null
  }

  const response: BrandAssetsResponse = {
    projectId: project.id,
    name: project.name,
    instagramUsername: project.instagramUsername,
    cuisineType: projectData.cuisineType ?? null,
    logo: projectLogo
      ? {
          url: projectLogo.fileUrl,
          width: null,  // Electron calculates locally with Sharp
          height: null,
        }
      : null,
    colors: colors.map((c) => c.hexCode),
    fonts: fonts.map((f) => f.name),
  }

  return NextResponse.json(response)
}
