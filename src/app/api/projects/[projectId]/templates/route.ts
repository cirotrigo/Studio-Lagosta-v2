import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { createTemplateSchema } from '@/lib/validations/studio'
import { createBlankDesign } from '@/lib/studio/defaults'
import type { Prisma } from '@/lib/prisma-types'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: { projectId: string } },
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const projectId = Number(params.projectId)
  if (!projectId) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }

  const project = await db.project.findFirst({ where: { id: projectId, userId } })
  if (!project) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  const templates = await db.template.findMany({
    where: { projectId },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(templates)
}

export async function POST(
  req: Request,
  { params }: { params: { projectId: string } },
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const projectId = Number(params.projectId)
  if (!projectId) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }

  const project = await db.project.findFirst({ where: { id: projectId, userId } })
  if (!project) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  try {
    const payload = await req.json()
    const parsed = createTemplateSchema.parse(payload)

    const template = await db.template.create({
      data: {
        name: parsed.name,
        type: parsed.type,
        dimensions: parsed.dimensions,
        projectId,
        createdBy: userId,
        designData: createBlankDesign(parsed.type) as unknown as Prisma.JsonValue,
        dynamicFields: [] as unknown as Prisma.JsonValue,
      },
    })

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    console.error('Failed to create template', error)
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }
}
