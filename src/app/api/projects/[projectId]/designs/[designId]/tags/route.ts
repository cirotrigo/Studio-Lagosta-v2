import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'

export const runtime = 'nodejs'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string; designId: string }> },
) {
  const { projectId, designId } = await params
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectIdNum = Number(projectId)
  if (!projectIdNum) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!hasProjectWriteAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  try {
    const { tags } = await req.json()

    // Validate tags
    if (!Array.isArray(tags)) {
      return NextResponse.json({ error: 'Tags must be an array' }, { status: 400 })
    }

    // Validate minimum 1 tag
    if (tags.length === 0) {
      return NextResponse.json(
        { error: 'O design deve ter pelo menos 1 tag' },
        { status: 400 },
      )
    }

    // Validate all tags are strings
    if (!tags.every((tag) => typeof tag === 'string' && tag.trim().length > 0)) {
      return NextResponse.json({ error: 'Invalid tag format' }, { status: 400 })
    }

    // Normalize tags (trim whitespace)
    const normalizedTags = tags.map((tag: string) => tag.trim())

    // Find the page (design) and verify it belongs to this project
    const page = await db.page.findFirst({
      where: {
        id: designId,
        Template: {
          projectId: projectIdNum,
        },
      },
      include: {
        Template: {
          select: { id: true, projectId: true },
        },
      },
    })

    if (!page) {
      return NextResponse.json({ error: 'Design not found' }, { status: 404 })
    }

    // Ensure all tags exist in the project (create if not)
    const existingTags = await db.projectTag.findMany({
      where: { projectId: projectIdNum },
      select: { name: true },
    })

    const existingTagNames = new Set(
      existingTags.map((t) => t.name.toLowerCase()),
    )

    // Find tags that need to be created
    const tagsToCreate = normalizedTags.filter(
      (tag) => !existingTagNames.has(tag.toLowerCase()),
    )

    // Create missing tags with auto-assigned colors
    if (tagsToCreate.length > 0) {
      const TAG_COLORS = [
        '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
        '#EC4899', '#EF4444', '#06B6D4', '#84CC16',
      ]

      const existingColors = existingTags.length
      await db.projectTag.createMany({
        data: tagsToCreate.map((name, index) => ({
          name,
          color: TAG_COLORS[(existingColors + index) % TAG_COLORS.length],
          projectId: projectIdNum,
        })),
      })
    }

    // Update the page with new tags
    const updatedPage = await db.page.update({
      where: { id: designId },
      data: {
        tags: normalizedTags,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({
      id: updatedPage.id,
      tags: updatedPage.tags,
      message: 'Tags updated successfully',
    })
  } catch (error) {
    console.error('Failed to update design tags', error)
    return NextResponse.json({ error: 'Failed to update tags' }, { status: 500 })
  }
}
