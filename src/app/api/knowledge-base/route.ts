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
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  const entries = await db.knowledgeBaseEntry.findMany({
    where: {
      userId,
      ...(status && { status: status as 'ACTIVE' | 'DRAFT' | 'ARCHIVED' }),
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(entries)
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const data = createEntrySchema.parse(body)

    const entry = await db.knowledgeBaseEntry.create({
      data: {
        title: data.title,
        content: data.content,
        tags: data.tags,
        status: data.status,
        userId,
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
