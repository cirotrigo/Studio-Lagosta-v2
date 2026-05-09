import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  fetchProjectWithShares,
  hasProjectOwnership,
  hasProjectReadAccess,
} from '@/lib/projects/access'

export const runtime = 'nodejs'

/**
 * DELETE /api/projects/[projectId]/template-pages/[pageId]
 *
 * Curator-only delete of a template page (a "modelo"). Used by the Modelos tab.
 *
 * Behavior:
 * - Refuses if the page isn't a template page in the given project.
 * - Deletes the page.
 * - If the parent Template is left with zero pages, deletes the Template too —
 *   so a "modelo do zero" (1 template + 1 page) is fully cleaned up by deleting
 *   its single page, without leaving an orphan empty Template behind.
 */
export async function DELETE(
  _req: Request,
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
          'Apenas o curador (dono do projeto ou admin da org compartilhada) pode excluir modelos.',
      },
      { status: 403 },
    )
  }

  const page = await db.page.findFirst({
    where: {
      id: pageId,
      isTemplate: true,
      Template: { projectId: projectIdNum },
    },
    select: { id: true, templateId: true },
  })

  if (!page) {
    return NextResponse.json(
      { error: 'Template page not found in this project' },
      { status: 404 },
    )
  }

  // Delete page; if the template is left empty, delete it too.
  const result = await db.$transaction(async (tx) => {
    await tx.page.delete({ where: { id: pageId } })
    const remaining = await tx.page.count({ where: { templateId: page.templateId } })
    if (remaining === 0) {
      await tx.template.delete({ where: { id: page.templateId } })
      return { deletedTemplate: true, templateId: page.templateId }
    }
    return { deletedTemplate: false, templateId: page.templateId }
  })

  return NextResponse.json({
    deleted: true,
    pageId,
    ...result,
  })
}
