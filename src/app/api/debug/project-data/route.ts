import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/admin-utils'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const projectName = searchParams.get('name') || 'wine'

  try {
    const project = await db.project.findFirst({
      where: {
        name: {
          contains: projectName,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        name: true,
        brandStyleDescription: true,
        brandVisualElements: true,
        brandReferenceUrls: true,
        titleFontFamily: true,
        bodyFontFamily: true,
        cuisineType: true,
        BrandColor: {
          select: {
            hexCode: true,
            name: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        CustomFont: {
          select: {
            fontFamily: true,
            fileUrl: true,
          },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json(
      {
        project,
        analysis: {
          hasVisualElements: !!project.brandVisualElements,
          hasStyleDescription: !!project.brandStyleDescription,
          referenceUrlsCount: project.brandReferenceUrls?.length || 0,
          colorsCount: project.BrandColor.length,
          fontsCount: project.CustomFont.length,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[debug/project-data] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
