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
