/**
 * Admin API: Single Knowledge Base Entry
 * GET: Get entry details
 * PUT: Update entry
 * DELETE: Delete entry
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { updateEntry, deleteEntry } from '@/lib/knowledge/indexer'

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

const UpdateEntrySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
})

/**
 * GET /api/admin/knowledge/[id]
 * Get entry details with chunks
 */
export async function GET(
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

    const entry = await db.knowledgeBaseEntry.findUnique({
      where: { id },
      include: {
        chunks: {
          orderBy: { ordinal: 'asc' },
        },
      },
    })

    if (!entry) {
      return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
    }

    // Verify ownership
    if (entry.userId !== dbUser.id) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    return NextResponse.json(entry)
  } catch (error) {
    console.error('Error fetching knowledge entry:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

/**
 * PUT /api/admin/knowledge/[id]
 * Update entry metadata and optionally reindex if content changed
 */
export async function PUT(
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
    const body = await req.json()

    const parsed = UpdateEntrySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', issues: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const entry = await updateEntry(id, parsed.data, {
      userId: dbUser.id,
    })

    return NextResponse.json(entry)
  } catch (error) {
    console.error('Error updating knowledge entry:', error)

    if (error.message === 'Entry not found') {
      return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
    }

    if (error.message === 'Unauthorized access to entry') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/knowledge/[id]
 * Delete entry and all associated chunks/vectors
 */
export async function DELETE(
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

    await deleteEntry(id, {
      userId: dbUser.id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting knowledge entry:', error)

    if (error.message === 'Entry not found') {
      return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
    }

    if (error.message === 'Unauthorized access to entry') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
