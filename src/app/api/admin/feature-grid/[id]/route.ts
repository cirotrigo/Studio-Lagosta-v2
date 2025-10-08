import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/admin-utils'
import { z } from 'zod'

const updateFeatureSchema = z.object({
  icon: z.string().min(1, 'Ícone é obrigatório').optional(),
  iconColor: z.string().optional(),
  title: z.string().min(1, 'Título é obrigatório').optional(),
  description: z.string().min(1, 'Descrição é obrigatória').optional(),
  gridArea: z.string().optional(),
  order: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

type RouteContext = {
  params: Promise<{ id: string }>
}

// GET - Buscar item específico
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!(await isAdmin(userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await context.params

    const item = await db.featureGridItem.findUnique({
      where: { id },
    })

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    return NextResponse.json({ item })
  } catch (error) {
    console.error('[FEATURE_GRID_GET_BY_ID]', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Atualizar item
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!(await isAdmin(userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await context.params
    const body = await request.json()
    const validatedData = updateFeatureSchema.parse(body)

    const item = await db.featureGridItem.update({
      where: { id },
      data: {
        ...validatedData,
        updatedBy: userId,
      },
    })

    return NextResponse.json({ item })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('[FEATURE_GRID_PUT]', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Remover item
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!(await isAdmin(userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await context.params

    await db.featureGridItem.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[FEATURE_GRID_DELETE]', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
