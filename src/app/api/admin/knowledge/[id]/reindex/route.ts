/**
 * Admin API: Reindex Knowledge Base Entry
 * POST: Reindex entry chunks and vectors
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { reindexEntry } from '@/lib/knowledge/indexer'

export const runtime = 'nodejs'
export const maxDuration = 120 // 2 minutes for reindexing with embedding generation

// Admin check utility
async function isAdmin(clerkUserId: string): Promise<boolean> {
  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []
  const adminUserIds = process.env.ADMIN_USER_IDS?.split(',').map(id => id.trim()) || []

  if (adminUserIds.includes(clerkUserId)) {
    return true
  }

  const user = await getUserFromClerkId(clerkUserId)
  if (user.email && adminEmails.includes(user.email)) {
    return true
  }

  return false
}

/**
 * POST /api/admin/knowledge/[id]/reindex
 * Reindex entry by regenerating chunks and embeddings
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const admin = await isAdmin(clerkUserId)
    if (!admin) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const dbUser = await getUserFromClerkId(clerkUserId)
    const { id } = await params

    const result = await reindexEntry(id, {
      userId: dbUser.id,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error reindexing knowledge entry:', error)

    if (error.message === 'Entry not found') {
      return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
    }

    if (error.message === 'Unauthorized access to entry') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
