import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'

export const runtime = 'nodejs'

const DEFAULT_TAG_NAME = 'Template'

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ projectId: string; tagId: string }> },
) {
  const authData = await auth()
  if (!authData.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId, tagId } = await params
  const projectIdNum = Number(projectId)
  if (!projectIdNum) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!hasProjectWriteAccess(project, { userId: authData.userId, orgId: authData.orgId })) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  try {
    const { name } = await req.json()

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Tag name is required' }, { status: 400 })
    }

    const trimmedName = name.trim()

    // Find the tag
    const existingTag = await db.projectTag.findFirst({
      where: { id: tagId, projectId: projectIdNum },
    })

    if (!existingTag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }

    // Prevent renaming the default "Template" tag
    if (existingTag.name.toLowerCase() === DEFAULT_TAG_NAME.toLowerCase()) {
      return NextResponse.json({ error: 'Cannot rename the default Template tag' }, { status: 400 })
    }

    // Check for duplicate name (case-insensitive)
    const duplicateTag = await db.projectTag.findFirst({
      where: {
        projectId: projectIdNum,
        name: { equals: trimmedName, mode: 'insensitive' },
        id: { not: tagId },
      },
    })

    if (duplicateTag) {
      return NextResponse.json({ error: 'Tag name already exists' }, { status: 409 })
    }

    // Update page tags to use the new name
    const oldName = existingTag.name

    // Update pages that have this tag
    await db.$executeRaw`
      UPDATE "Page"
      SET tags = array_replace(tags, ${oldName}, ${trimmedName})
      WHERE ${oldName} = ANY(tags)
    `

    const tag = await db.projectTag.update({
      where: { id: tagId },
      data: { name: trimmedName },
    })

    return NextResponse.json(tag)
  } catch (error) {
    console.error('Failed to update tag', error)
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; tagId: string }> },
) {
  const authData = await auth()
  if (!authData.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId, tagId } = await params
  const projectIdNum = Number(projectId)
  if (!projectIdNum) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!hasProjectWriteAccess(project, { userId: authData.userId, orgId: authData.orgId })) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Find the tag
  const existingTag = await db.projectTag.findFirst({
    where: { id: tagId, projectId: projectIdNum },
  })

  if (!existingTag) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  // Prevent deleting the default "Template" tag
  if (existingTag.name.toLowerCase() === DEFAULT_TAG_NAME.toLowerCase()) {
    return NextResponse.json({ error: 'Cannot delete the default Template tag' }, { status: 400 })
  }

  // Remove this tag from all pages
  const tagName = existingTag.name
  await db.$executeRaw`
    UPDATE "Page"
    SET tags = array_remove(tags, ${tagName})
    WHERE ${tagName} = ANY(tags)
  `

  // Delete the tag
  await db.projectTag.delete({
    where: { id: tagId },
  })

  return NextResponse.json({ success: true })
}
