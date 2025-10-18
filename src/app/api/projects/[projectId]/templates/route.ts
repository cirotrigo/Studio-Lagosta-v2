import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'
import { createTemplateSchema } from '@/lib/validations/studio'
import { createBlankDesign } from '@/lib/studio/defaults'
import type { Prisma } from '@/lib/prisma-types'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const projectIdNum = Number(projectId)
  if (!projectIdNum) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  const templates = await db.template.findMany({
    where: { projectId: projectIdNum },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: {
        select: { Page: true },
      },
    },
  })

  return NextResponse.json(templates)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const authData = await auth()
  if (!authData.userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { projectId } = await params
  const projectIdNum = Number(projectId)
  if (!projectIdNum) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!hasProjectWriteAccess(project, { userId: authData.userId, orgId: authData.orgId, orgRole: authData.orgRole })) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  try {
    const payload = await req.json()
    const parsed = createTemplateSchema.parse(payload)

    const blankDesign = createBlankDesign(parsed.type)

    // Criar template e primeira página juntos em uma transação
    const template = await db.$transaction(async (tx) => {
      // Criar o template
      const newTemplate = await tx.template.create({
        data: {
          name: parsed.name,
          type: parsed.type,
          dimensions: parsed.dimensions,
          projectId: projectIdNum,
          createdBy: authData.userId,
          designData: blankDesign as unknown as Prisma.JsonValue,
          dynamicFields: [] as unknown as Prisma.JsonValue,
        },
      })

      // Criar automaticamente a primeira página (Página 1) com o design inicial
      // Esta página serve como "template base" e preserva o design original
      await tx.page.create({
        data: {
          name: 'Página 1',
          width: blankDesign.canvas.width,
          height: blankDesign.canvas.height,
          layers: JSON.stringify([]), // Página inicial vazia
          background: blankDesign.canvas.backgroundColor,
          order: 0, // Sempre primeira página
          templateId: newTemplate.id,
        },
      })

      return newTemplate
    })

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    console.error('Failed to create template', error)
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }
}
