/**
 * Admin API: Knowledge Base Management
 * GET: List all entries with pagination/search
 * POST: Create new entry or upload file
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { indexEntry, indexFile } from '@/lib/knowledge/indexer'
import { KnowledgeCategory } from '@prisma/client'

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

// Schemas
const CreateEntrySchema = z.object({
  projectId: z.number().int(),
  category: z.nativeEnum(KnowledgeCategory),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
})

const UploadFileSchema = z.object({
  projectId: z.number().int(),
  category: z.nativeEnum(KnowledgeCategory),
  title: z.string().min(1).max(500),
  filename: z.string().min(1),
  fileContent: z.string().min(1),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
})

/**
 * GET /api/admin/knowledge
 * List knowledge base entries with pagination and search
 */
export async function GET(req: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const admin = await isAdmin(clerkUserId)
    if (!admin) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    // Parse query params
    const searchParams = req.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') as 'ACTIVE' | 'DRAFT' | 'ARCHIVED' | null
    const projectIdParam = searchParams.get('projectId')
    const projectId = projectIdParam ? Number(projectIdParam) : undefined
    const categoryParam = searchParams.get('category') as KnowledgeCategory | null

    // Build where clause
    // NOTE: Admins can see ALL entries, not just their own
    const where: Record<string, unknown> = {}

    if (projectId) {
      where.projectId = projectId
    }

    if (categoryParam) {
      where.category = categoryParam
    }

    if (status) {
      where.status = status
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Get total count
    const total = await db.knowledgeBaseEntry.count({ where })

    // Get entries
    const entries = await db.knowledgeBaseEntry.findMany({
      where,
      include: {
        _count: {
          select: { chunks: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    })

    return NextResponse.json({
      entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching knowledge entries:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

/**
 * POST /api/admin/knowledge
 * Create new knowledge base entry or upload file
 */
export async function POST(req: NextRequest) {
  try {
    const { userId: clerkUserId, orgId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const admin = await isAdmin(clerkUserId)
    if (!admin) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const dbUser = await getUserFromClerkId(clerkUserId)
    const body = await req.json()

    // If user is in an organization, use that as workspace
    // Otherwise use the workspaceId from request body or null
    const effectiveWorkspaceId = orgId || body.workspaceId || null

    // Check if it's a file upload or text entry
    const isFileUpload = 'filename' in body && 'fileContent' in body

    if (isFileUpload) {
      // Validate file upload
      const parsed = UploadFileSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Dados inválidos', issues: parsed.error.flatten() },
          { status: 400 }
        )
      }

      const { title, filename, fileContent, tags, status, projectId, category, metadata } = parsed.data

      const project = await db.project.findUnique({
        where: { id: projectId },
      })

      if (!project) {
        return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
      }

      const result = await indexFile({
        title,
        filename,
        fileContent,
        tags,
        status,
        metadata,
        category,
        createdBy: dbUser.id,
        tenant: {
          projectId,
          userId: dbUser.id,
          workspaceId: effectiveWorkspaceId || undefined,
        },
      })

      return NextResponse.json(result, { status: 201 })
    } else {
      // Validate text entry
      const parsed = CreateEntrySchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Dados inválidos', issues: parsed.error.flatten() },
          { status: 400 }
        )
      }

      const { title, content, tags, status, projectId, category, metadata } = parsed.data

      const project = await db.project.findUnique({
        where: { id: projectId },
      })

      if (!project) {
        return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
      }

      const result = await indexEntry({
        title,
        content,
        tags,
        status,
        metadata,
        category,
        createdBy: dbUser.id,
        tenant: {
          projectId,
          userId: dbUser.id,
          workspaceId: effectiveWorkspaceId || undefined,
        },
      })

      return NextResponse.json(result, { status: 201 })
    }
  } catch (error) {
    console.error('Error creating knowledge entry:', error)

    if (error.message?.includes('Unsupported file type')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
