import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  fetchProjectWithShares,
  hasProjectOwnership,
  hasProjectReadAccess,
} from '@/lib/projects/access'

export const runtime = 'nodejs'

const bodySchema = z.object({
  tags: z.array(z.string().trim().min(1)).max(20),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string; pageId: string }> },
) {
  const { projectId, pageId } = await params
  const { userId, orgId, orgRole } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectIdNum = Number(projectId)
  if (!projectIdNum) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  if (!hasProjectOwnership(project, { userId, orgId, orgRole })) {
    return NextResponse.json(
      {
        error:
          'Apenas o curador (dono do projeto ou admin da org compartilhada) pode editar tags de templates.',
      },
      { status: 403 },
    )
  }

  const json = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const normalize = (tag: string) =>
    tag
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')

  const normalizedTags = Array.from(
    new Set(parsed.data.tags.map(normalize).filter(Boolean)),
  )

  // Auto-create ProjectTag entries for any new tag names so they appear
  // in the global suggestion list (mirrors /designs/[designId]/tags pattern).
  if (normalizedTags.length > 0) {
    const existing = await db.projectTag.findMany({
      where: { projectId: projectIdNum },
      select: { name: true },
    })
    const existingNames = new Set(existing.map((t) => t.name.toLowerCase()))
    const toCreate = normalizedTags.filter(
      (tag) => !existingNames.has(tag.toLowerCase()),
    )
    if (toCreate.length > 0) {
      const TAG_COLORS = [
        '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
        '#EC4899', '#EF4444', '#06B6D4', '#84CC16',
      ]
      const offset = existing.length
      await db.projectTag.createMany({
        data: toCreate.map((name, index) => ({
          name,
          color: TAG_COLORS[(offset + index) % TAG_COLORS.length],
          projectId: projectIdNum,
        })),
      })
    }
  }

  const page = await db.page.findFirst({
    where: {
      id: pageId,
      isTemplate: true,
      Template: { projectId: projectIdNum },
    },
    select: { id: true },
  })

  if (!page) {
    return NextResponse.json(
      { error: 'Template page not found in this project' },
      { status: 404 },
    )
  }

  const updated = await db.page.update({
    where: { id: pageId },
    data: { tags: normalizedTags, updatedAt: new Date() },
    select: { id: true, tags: true, updatedAt: true },
  })

  return NextResponse.json(updated)
}
