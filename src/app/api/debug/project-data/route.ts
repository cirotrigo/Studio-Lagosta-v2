import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(request: Request) {
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
