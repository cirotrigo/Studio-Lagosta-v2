import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const runtime = 'nodejs'

const createEntrySchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  content: z.string().min(1, 'Conteúdo é obrigatório'),
  tags: z.array(z.string()).default([]),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).default('ACTIVE'),
})

export async function GET(request: Request) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let organizationId: string | null = null

  if (orgId) {
    const organization = await db.organization.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    })

    organizationId = organization?.id ?? null
  }

  const where: NonNullable<
    Parameters<typeof db.knowledgeBaseEntry.findMany>[0]
  >['where'] = {
    OR: [
      { userId, workspaceId: null },
      ...(organizationId ? [{ workspaceId: organizationId }] : []),
    ],
  }

  if (status) {
    where.status = status as 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  }

  const entries = await db.knowledgeBaseEntry.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(entries)
}

export async function POST(request: Request) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const data = createEntrySchema.parse(body)

    let workspaceId: string | null = null

    if (orgId) {
      const organization = await db.organization.findUnique({
        where: { clerkOrgId: orgId },
        select: { id: true },
      })

      if (!organization) {
        return NextResponse.json(
          { error: 'Organização não encontrada' },
          { status: 404 }
        )
      }

      workspaceId = organization.id
    }

    const entry = await db.knowledgeBaseEntry.create({
      data: {
        title: data.title,
        content: data.content,
        tags: data.tags,
        status: data.status,
        userId,
        workspaceId,
      },
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      )
    }
    console.error('[knowledge-base] Failed to create entry', error)
    return NextResponse.json(
      { error: 'Erro ao criar entrada' },
      { status: 500 }
    )
  }
}
