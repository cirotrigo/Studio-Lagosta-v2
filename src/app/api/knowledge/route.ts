/**
 * Organization Knowledge Base API
 * Allows organization members to contribute to shared knowledge base
 * GET: List organization's knowledge entries
 * POST: Create new entry for organization
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { indexEntry, indexFile } from '@/lib/knowledge/indexer'

// Schemas
const CreateEntrySchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional().default('ACTIVE'),
})

const UploadFileSchema = z.object({
  title: z.string().min(1).max(500),
  filename: z.string().min(1),
  fileContent: z.string().min(1),
  tags: z.array(z.string()).optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional().default('ACTIVE'),
})

/**
 * GET /api/knowledge
 * List organization's knowledge base entries
 */
export async function GET(req: NextRequest) {
  try {
    const { userId: clerkUserId, orgId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!orgId) {
      return NextResponse.json(
        { error: 'Você precisa estar em uma organização para acessar a base de conhecimento compartilhada' },
        { status: 403 }
      )
    }

    // Parse query params
    const searchParams = req.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') as 'ACTIVE' | 'DRAFT' | 'ARCHIVED' | null

    // Build where clause - filter by organization
    const where: Record<string, unknown> = {
      workspaceId: orgId,
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
    console.error('Error fetching organization knowledge:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

/**
 * POST /api/knowledge
 * Create new knowledge base entry for organization
 */
export async function POST(req: NextRequest) {
  try {
    const { userId: clerkUserId, orgId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!orgId) {
      return NextResponse.json(
        { error: 'Você precisa estar em uma organização para contribuir à base de conhecimento' },
        { status: 403 }
      )
    }

    const dbUser = await getUserFromClerkId(clerkUserId)
    const body = await req.json()

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

      const { title, filename, fileContent, tags, status } = parsed.data

      const result = await indexFile({
        title,
        filename,
        fileContent,
        tags,
        status,
        tenant: {
          userId: dbUser.id,
          workspaceId: orgId, // Organization knowledge
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

      const { title, content, tags, status } = parsed.data

      const result = await indexEntry({
        title,
        content,
        tags,
        status,
        tenant: {
          userId: dbUser.id,
          workspaceId: orgId, // Organization knowledge
        },
      })

      return NextResponse.json(result, { status: 201 })
    }
  } catch (error) {
    console.error('Error creating organization knowledge:', error)

    if (error.message?.includes('Unsupported file type')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
