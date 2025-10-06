import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { createProjectSchema } from '@/lib/validations/studio'

export const runtime = 'nodejs'

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const projects = await db.project.findMany({
    where: { userId },
    include: {
      _count: {
        select: { Template: true, Generation: true },
      },
      Logo: {
        where: { isProjectLogo: true },
        take: 1,
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(projects)
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const payload = await req.json()
    const parsed = createProjectSchema.parse(payload)

    const project = await db.project.create({
      data: {
        name: parsed.name,
        description: parsed.description,
        logoUrl: parsed.logoUrl,
        status: parsed.status ?? 'ACTIVE',
        userId,
      },
    })

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    console.error('Failed to create project', error)
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }
}
