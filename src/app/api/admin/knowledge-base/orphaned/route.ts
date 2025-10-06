import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * Endpoint para verificar entradas sem usuário associado
 * Útil para identificar dados que precisam ser migrados
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Verificar se é admin (opcional - adicione lógica de admin se necessário)
  // Por enquanto, qualquer usuário autenticado pode verificar

  const orphanedEntries = await db.knowledgeBaseEntry.findMany({
    where: {
      userId: null,
    },
    select: {
      id: true,
      title: true,
      status: true,
      tags: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  const totalEntries = await db.knowledgeBaseEntry.count()
  const orphanedCount = orphanedEntries.length

  return NextResponse.json({
    totalEntries,
    orphanedCount,
    orphanedEntries,
    needsMigration: orphanedCount > 0,
  })
}

/**
 * Endpoint para migrar entradas órfãs para o usuário atual
 */
export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { entryIds } = body

    if (!entryIds || !Array.isArray(entryIds)) {
      return NextResponse.json(
        { error: 'entryIds deve ser um array' },
        { status: 400 }
      )
    }

    // Atualizar entradas específicas
    const result = await db.knowledgeBaseEntry.updateMany({
      where: {
        id: { in: entryIds },
        userId: null, // Apenas migrar se ainda não tiver usuário
      },
      data: {
        userId,
      },
    })

    return NextResponse.json({
      success: true,
      migratedCount: result.count,
      message: `${result.count} entrada(s) migrada(s) com sucesso`,
    })
  } catch (error) {
    console.error('[knowledge-base] Migration error:', error)
    return NextResponse.json(
      { error: 'Erro ao migrar entradas' },
      { status: 500 }
    )
  }
}
