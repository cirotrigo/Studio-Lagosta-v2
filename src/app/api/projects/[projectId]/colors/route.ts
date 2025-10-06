import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

async function verifyProject(projectId: number, userId: string) {
  return db.project.findFirst({ where: { id: projectId, userId } })
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
  const projectIdNum = Number(projectId)
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (!projectIdNum) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }

  const project = await verifyProject(projectIdNum, userId)
  if (!project) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  const colors = await db.brandColor.findMany({
    where: { projectId: projectIdNum },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(colors)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
  const projectIdNum = Number(projectId)
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (!projectIdNum) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }

  const project = await verifyProject(projectIdNum, userId)
  if (!project) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  const body = (await req.json().catch(() => null)) as { name?: string; hexCode?: string } | null
  const name = body?.name?.trim()
  const hexCode = body?.hexCode?.trim()

  if (!name) {
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
  }

  if (!hexCode || !/^#[0-9A-Fa-f]{6}$/.test(hexCode)) {
    return NextResponse.json({ error: 'Código hex inválido (formato: #RRGGBB)' }, { status: 400 })
  }

  const color = await db.brandColor.create({
    data: {
      name,
      hexCode,
      projectId: projectIdNum,
      uploadedBy: userId,
    },
  })

  return NextResponse.json(color, { status: 201 })
}
