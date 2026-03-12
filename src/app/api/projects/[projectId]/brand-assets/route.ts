import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { z } from 'zod'

export const runtime = 'nodejs'

interface TextColorPreferences {
  titleColor: string
  subtitleColor: string
  infoColor: string
  ctaColor: string
}

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
  fonts: Array<{ name: string; fontFamily: string; fileUrl: string }>
  // Art generation preferences
  titleFontFamily: string | null
  bodyFontFamily: string | null
  textColorPreferences: TextColorPreferences | null
  overlayStyle: 'gradient' | 'solid' | null
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

  // Fetch custom fonts with fileUrl for rendering
  const fonts = await db.customFont.findMany({
    where: { projectId: projectIdNum },
    select: { name: true, fontFamily: true, fileUrl: true },
    orderBy: { createdAt: 'asc' },
  })

  // Get project logo (isProjectLogo = true)
  const projectLogo = project.Logo?.[0] ?? null

  // Access fields safely
  const projectData = project as typeof project & {
    brandStyleDescription?: string | null
    brandVisualElements?: Record<string, unknown> | null
    cuisineType?: string | null
    titleFontFamily?: string | null
    bodyFontFamily?: string | null
  }

  // Extract textColorPreferences and overlayStyle from brandVisualElements JSON
  const ve = projectData.brandVisualElements as Record<string, unknown> | null
  const textColorPreferences = ve?.textColorPreferences as TextColorPreferences | undefined
  const overlayStyle = ve?.overlayStyle as 'gradient' | 'solid' | undefined

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
    fonts: fonts.map((f) => ({ name: f.name, fontFamily: f.fontFamily, fileUrl: f.fileUrl })),
    titleFontFamily: projectData.titleFontFamily ?? null,
    bodyFontFamily: projectData.bodyFontFamily ?? null,
    textColorPreferences: textColorPreferences ?? null,
    overlayStyle: overlayStyle ?? null,
  }

  return NextResponse.json(response)
}

// Schema for updating art generation preferences
const textColorPreferencesSchema = z.object({
  titleColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  subtitleColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  infoColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  ctaColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
})

const updatePreferencesSchema = z.object({
  titleFontFamily: z.string().nullable().optional(),
  bodyFontFamily: z.string().nullable().optional(),
  textColorPreferences: textColorPreferencesSchema.nullable().optional(),
  overlayStyle: z.enum(['gradient', 'solid']).nullable().optional(),
})

export async function PATCH(
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
  if (!project || !hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  let body: z.infer<typeof updatePreferencesSchema>
  try {
    const rawBody = await req.json()
    body = updatePreferencesSchema.parse(rawBody)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Erro ao processar requisição' }, { status: 400 })
  }

  // Update only the fields that were provided
  const updateData: Record<string, unknown> = {}
  if (body.titleFontFamily !== undefined) {
    updateData.titleFontFamily = body.titleFontFamily
  }
  if (body.bodyFontFamily !== undefined) {
    updateData.bodyFontFamily = body.bodyFontFamily
  }

  // Handle textColorPreferences and overlayStyle — merge into brandVisualElements JSON
  if (body.textColorPreferences !== undefined || body.overlayStyle !== undefined) {
    // Read current brandVisualElements to merge (preserve layouts, typography, patterns)
    const currentProject = await db.project.findUnique({
      where: { id: projectIdNum },
      select: { brandVisualElements: true },
    })
    const currentVe = (currentProject?.brandVisualElements as Record<string, unknown>) ?? {}

    if (body.textColorPreferences !== undefined) {
      currentVe.textColorPreferences = body.textColorPreferences
    }
    if (body.overlayStyle !== undefined) {
      currentVe.overlayStyle = body.overlayStyle
    }

    updateData.brandVisualElements = currentVe
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
  }

  await db.project.update({
    where: { id: projectIdNum },
    data: updateData,
  })

  return NextResponse.json({ success: true })
}
