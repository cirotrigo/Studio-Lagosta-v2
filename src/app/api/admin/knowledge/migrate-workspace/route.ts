/**
 * Admin endpoint to migrate knowledge base entries to correct Clerk orgId
 * Handles migration from old workspaceId (local DB) to Clerk organization IDs
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'

/**
 * GET /api/admin/knowledge/migrate-workspace
 * List entries that need workspace migration
 */
export async function GET() {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const dbUser = await getUserFromClerkId(clerkUserId)

    // Check if user is admin
    if (dbUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    // Get all entries with their current workspaceId
    const entries = await db.knowledgeBaseEntry.findMany({
      select: {
        id: true,
        title: true,
        workspaceId: true,
        userId: true,
        status: true,
        createdAt: true,
        _count: {
          select: { chunks: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Separate entries by workspace status
    const withWorkspace = entries.filter(e => e.workspaceId !== null)
    const withoutWorkspace = entries.filter(e => e.workspaceId === null)

    // Group by workspaceId
    const workspaceGroups = withWorkspace.reduce((acc, entry) => {
      const wsId = entry.workspaceId!
      if (!acc[wsId]) {
        acc[wsId] = []
      }
      acc[wsId].push(entry)
      return acc
    }, {} as Record<string, typeof entries>)

    return NextResponse.json({
      summary: {
        total: entries.length,
        withWorkspace: withWorkspace.length,
        withoutWorkspace: withoutWorkspace.length,
        workspaceCount: Object.keys(workspaceGroups).length,
      },
      workspaceGroups,
      orphanedEntries: withoutWorkspace,
    })
  } catch (error) {
    console.error('Error fetching migration data:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

/**
 * POST /api/admin/knowledge/migrate-workspace
 * Migrate entries from old workspaceId to Clerk orgId
 */
export async function POST(req: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const dbUser = await getUserFromClerkId(clerkUserId)

    // Check if user is admin
    if (dbUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const body = await req.json()
    const { fromWorkspaceId, toOrgId } = body

    if (!toOrgId) {
      return NextResponse.json(
        { error: 'toOrgId é obrigatório (Clerk organization ID)' },
        { status: 400 }
      )
    }

    // Validate orgId format (Clerk org IDs start with 'org_')
    if (!toOrgId.startsWith('org_')) {
      return NextResponse.json(
        { error: 'toOrgId deve ser um Clerk organization ID (formato: org_...)' },
        { status: 400 }
      )
    }

    // Build where clause
    const where: { workspaceId?: string | null } = {}

    if (fromWorkspaceId === null || fromWorkspaceId === 'null') {
      // Migrate orphaned entries (no workspace)
      where.workspaceId = null
    } else if (fromWorkspaceId) {
      // Migrate from specific old workspaceId
      where.workspaceId = fromWorkspaceId
    } else {
      return NextResponse.json(
        { error: 'fromWorkspaceId é obrigatório (use null para registros órfãos)' },
        { status: 400 }
      )
    }

    // Get entries to migrate
    const entriesToMigrate = await db.knowledgeBaseEntry.findMany({
      where,
      select: {
        id: true,
        title: true,
      },
    })

    if (entriesToMigrate.length === 0) {
      return NextResponse.json({
        message: 'Nenhum registro encontrado para migrar',
        migrated: 0,
      })
    }

    // Perform migration
    const result = await db.knowledgeBaseEntry.updateMany({
      where,
      data: {
        workspaceId: toOrgId,
      },
    })

    return NextResponse.json({
      message: `${result.count} registros migrados com sucesso`,
      migrated: result.count,
      entries: entriesToMigrate,
      from: fromWorkspaceId,
      to: toOrgId,
    })
  } catch (error) {
    console.error('Error migrating workspace:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
