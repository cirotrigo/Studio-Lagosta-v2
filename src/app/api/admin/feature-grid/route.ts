import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/admin-utils'
import { z } from 'zod'

const createFeatureSchema = z.object({
  icon: z.string().min(1, 'Ícone é obrigatório'),
  iconColor: z.string().optional(),
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().min(1, 'Descrição é obrigatória'),
  gridArea: z.string().optional(),
  order: z.number().int().default(0),
  isActive: z.boolean().default(true),
})

// GET - Listar todos os itens do grid
export async function GET() {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!(await isAdmin(userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const items = await db.featureGridItem.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    })

    return NextResponse.json({ items })
  } catch (_error) {
    console.error('[FEATURE_GRID_GET]', _error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Criar novo item
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!(await isAdmin(userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = createFeatureSchema.parse(body)

    const item = await db.featureGridItem.create({
      data: {
        icon: validatedData.icon,
        iconColor: validatedData.iconColor,
        title: validatedData.title,
        description: validatedData.description,
        gridArea: validatedData.gridArea,
        order: validatedData.order,
        isActive: validatedData.isActive,
        createdBy: userId,
      },
    })

    return NextResponse.json({ item }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('[FEATURE_GRID_POST]', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
