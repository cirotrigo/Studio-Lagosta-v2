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

  const tagName = existingTag.name

  // Count pages that have this tag (within this project's templates)
  const pagesWithTag = await db.page.findMany({
    where: {
      Template: { projectId: projectIdNum },
      tags: { has: tagName },
    },
    select: { id: true },
  })

  const pageCount = pagesWithTag.length

  // Parse request body for transfer option
  let transferToTagId: string | null = null
  let forceDelete = false

  try {
    const body = await req.json()
    transferToTagId = body.transferToTagId || null
    forceDelete = body.forceDelete === true
  } catch {
    // No body provided, which is fine for simple delete
  }

  // If there are pages with this tag and no transfer/force option, return error with count
  if (pageCount > 0 && !transferToTagId && !forceDelete) {
    return NextResponse.json(
      {
        error: 'Tag has associated pages',
        code: 'TAG_HAS_PAGES',
        pageCount,
        message: `Esta tag está associada a ${pageCount} página(s). Escolha uma tag para transferir ou force a exclusão.`,
      },
      { status: 409 },
    )
  }

  // If transfer is requested, validate and perform transfer
  if (transferToTagId) {
    const targetTag = await db.projectTag.findFirst({
      where: { id: transferToTagId, projectId: projectIdNum },
    })

    if (!targetTag) {
      return NextResponse.json({ error: 'Target tag not found' }, { status: 404 })
    }

    // Transfer: replace old tag with new tag in all pages
    // First, remove old tag and add new tag (avoiding duplicates)
    await db.$executeRaw`
      UPDATE "Page" p
      SET tags = (
        SELECT array_agg(DISTINCT t)
        FROM (
          SELECT unnest(array_remove(tags, ${tagName})) AS t
          UNION
          SELECT ${targetTag.name}
        ) sub
        WHERE t IS NOT NULL
      )
      FROM "Template" tpl
      WHERE p."templateId" = tpl.id
        AND tpl."projectId" = ${projectIdNum}
        AND ${tagName} = ANY(p.tags)
    `
  } else if (forceDelete || pageCount === 0) {
    // Just remove the tag from all pages without transfer
    await db.$executeRaw`
      UPDATE "Page" p
      SET tags = array_remove(tags, ${tagName})
      FROM "Template" tpl
      WHERE p."templateId" = tpl.id
        AND tpl."projectId" = ${projectIdNum}
        AND ${tagName} = ANY(p.tags)
    `
  }

  // Delete the tag
  await db.projectTag.delete({
    where: { id: tagId },
  })

  return NextResponse.json({ success: true, pagesUpdated: pageCount })
}
