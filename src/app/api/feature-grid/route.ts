import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET - Listar itens ativos (público)
export async function GET() {
  try {
    const items = await db.featureGridItem.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        icon: true,
        iconColor: true,
        title: true,
        description: true,
        gridArea: true,
      },
    })

    return NextResponse.json({ items })
  } catch (error) {
    console.error('[FEATURE_GRID_PUBLIC_GET]', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
