import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  fetchProjectWithShares,
  hasProjectWriteAccess,
} from '@/lib/projects/access'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const { userId, orgId, orgRole } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { ids } = body

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 })
    }

    // Buscar gerações com verificação de ownership
    const generations = await db.generation.findMany({
      where: {
        id: { in: ids },
      },
      include: {
        Project: {
          select: {
            userId: true,
          },
        },
      },
    })

    // Verificar se todas as gerações têm acesso válido considerando organizações
    const unauthorizedGenerations = []
    for (const gen of generations) {
      const project = await fetchProjectWithShares(gen.projectId)
      if (!hasProjectWriteAccess(project, { userId, orgId, orgRole })) {
        unauthorizedGenerations.push(gen)
      }
    }

    if (unauthorizedGenerations.length > 0) {
      return NextResponse.json(
        { error: 'Não autorizado para deletar alguns criativos' },
        { status: 403 }
      )
    }

    // Deletar gerações em lote
    const result = await db.generation.deleteMany({
      where: {
        id: { in: ids },
      },
    })

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    })
  } catch (error) {
    console.error('[API] Failed to bulk delete generations:', error)
    return NextResponse.json(
      { error: 'Erro ao deletar criativos' },
      { status: 500 }
    )
  }
}
