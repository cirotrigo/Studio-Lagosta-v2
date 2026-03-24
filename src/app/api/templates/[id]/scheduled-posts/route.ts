import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { hasProjectReadAccess } from '@/lib/projects/access'
import { PostStatus } from '../../../../../../prisma/generated/client'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params
  const templateId = Number(id)
  if (!templateId) {
    return NextResponse.json({ error: 'Template inválido' }, { status: 400 })
  }

  const template = await db.template.findFirst({
    where: { id: templateId },
    include: {
      Project: {
        include: {
          organizationProjects: {
            include: {
              organization: {
                select: { clerkOrgId: true, name: true },
              },
            },
          },
        },
      },
    },
  })

  if (!template) {
    return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
  }

  if (!hasProjectReadAccess(template.Project, { userId, orgId })) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const posts = await db.socialPost.findMany({
    where: {
      templateId,
      status: { in: [PostStatus.SCHEDULED, PostStatus.DRAFT] },
    },
    select: {
      id: true,
      pageId: true,
      status: true,
      renderStatus: true,
      scheduledDatetime: true,
      renderedImageUrl: true,
      caption: true,
      createdAt: true,
    },
    orderBy: { scheduledDatetime: 'asc' },
  })

  return NextResponse.json(posts)
}
