import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  fetchProjectWithShares,
  hasProjectOwnership,
  hasProjectReadAccess,
} from '@/lib/projects/access'
import { createBlankDesign } from '@/lib/studio/defaults'
import type { Prisma } from '@/lib/prisma-types'

export const runtime = 'nodejs'

const bodySchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório'),
  type: z.enum(['STORY', 'FEED', 'SQUARE']),
  dimensions: z.string().regex(/^\d+x\d+$/, 'Formato inválido'),
  tags: z.array(z.string().trim().min(1)).max(20).default([]),
})

function normalizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
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
          'Apenas o curador (dono do projeto ou admin da org compartilhada) pode criar modelos.',
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

  const normalizedTags = Array.from(
    new Set(parsed.data.tags.map(normalizeTag).filter(Boolean)),
  )

  const blankDesign = createBlankDesign(parsed.data.type)

  const result = await db.$transaction(async (tx) => {
    const template = await tx.template.create({
      data: {
        name: parsed.data.name,
        type: parsed.data.type,
        dimensions: parsed.data.dimensions,
        projectId: projectIdNum,
        createdBy: userId,
        designData: blankDesign as unknown as Prisma.JsonValue,
        dynamicFields: [] as unknown as Prisma.JsonValue,
        tags: normalizedTags,
      },
    })

    const page = await tx.page.create({
      data: {
        name: parsed.data.name,
        width: blankDesign.canvas.width,
        height: blankDesign.canvas.height,
        layers: JSON.stringify([]),
        background: blankDesign.canvas.backgroundColor,
        order: 0,
        templateId: template.id,
        isTemplate: true,
        tags: normalizedTags,
      },
    })

    return { template, page }
  })

  return NextResponse.json(
    {
      templateId: result.template.id,
      pageId: result.page.id,
      name: result.template.name,
      type: result.template.type,
      dimensions: result.template.dimensions,
      tags: normalizedTags,
    },
    { status: 201 },
  )
}
