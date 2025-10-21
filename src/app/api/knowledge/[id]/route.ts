/**
 * Organization Knowledge Base API - Individual Entry
 * GET: Get single entry details
 * PUT: Update entry
 * DELETE: Delete entry
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { reindexEntry } from '@/lib/knowledge/indexer'

const UpdateEntrySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
})

/**
 * GET /api/knowledge/[id]
 * Get single knowledge entry (must belong to user's organization)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkUserId, orgId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!orgId) {
      return NextResponse.json(
        { error: 'Você precisa estar em uma organização' },
        { status: 403 }
      )
    }

    const { id } = await params

    const entry = await db.knowledgeBaseEntry.findUnique({
      where: { id },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    })

    if (!entry) {
      return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
    }

    // Verify entry belongs to user's organization
    if (entry.workspaceId !== orgId) {
      return NextResponse.json(
        { error: 'Você não tem permissão para acessar esta entrada' },
        { status: 403 }
      )
    }

    return NextResponse.json(entry)
  } catch (error) {
    console.error('Error fetching knowledge entry:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

/**
 * PUT /api/knowledge/[id]
 * Update knowledge entry (must belong to user's organization)
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkUserId, orgId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!orgId) {
      return NextResponse.json(
        { error: 'Você precisa estar em uma organização' },
        { status: 403 }
      )
    }

    const dbUser = await getUserFromClerkId(clerkUserId)
    const { id } = await params
    const body = await req.json()

    // Validate input
    const parsed = UpdateEntrySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', issues: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Check if entry exists and belongs to organization
    const existingEntry = await db.knowledgeBaseEntry.findUnique({
      where: { id },
    })

    if (!existingEntry) {
      return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
    }

    if (existingEntry.workspaceId !== orgId) {
      return NextResponse.json(
        { error: 'Você não tem permissão para editar esta entrada' },
        { status: 403 }
      )
    }

    const { title, content, tags, status } = parsed.data

    // Check if content changed - if so, need to reindex
    const contentChanged = content && content !== existingEntry.content
    const titleChanged = title && title !== existingEntry.title

    // Update entry
    const updatedEntry = await db.knowledgeBaseEntry.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(content && { content }),
        ...(tags && { tags }),
        ...(status && { status }),
        updatedAt: new Date(),
      },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    })

    // If content or title changed, reindex
    if (contentChanged || titleChanged) {
      try {
        await reindexEntry(id, {
          userId: existingEntry.userId || undefined,
          workspaceId: existingEntry.workspaceId || undefined,
        })
      } catch (reindexError) {
        console.error('Error reindexing after update:', reindexError)
        // Don't fail the update if reindex fails
      }
    }

    return NextResponse.json(updatedEntry)
  } catch (error) {
    console.error('Error updating knowledge entry:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

/**
 * DELETE /api/knowledge/[id]
 * Delete knowledge entry (must belong to user's organization)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkUserId, orgId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!orgId) {
      return NextResponse.json(
        { error: 'Você precisa estar em uma organização' },
        { status: 403 }
      )
    }

    const { id } = await params

    // Check if entry exists and belongs to organization
    const entry = await db.knowledgeBaseEntry.findUnique({
      where: { id },
    })

    if (!entry) {
      return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
    }

    if (entry.workspaceId !== orgId) {
      return NextResponse.json(
        { error: 'Você não tem permissão para excluir esta entrada' },
        { status: 403 }
      )
    }

    // Delete entry (chunks will be cascade deleted)
    await db.knowledgeBaseEntry.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Entrada excluída com sucesso' })
  } catch (error) {
    console.error('Error deleting knowledge entry:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
