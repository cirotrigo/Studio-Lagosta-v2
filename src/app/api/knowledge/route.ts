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
import { invalidateProjectCache } from '@/lib/knowledge/cache'
import { KnowledgeCategory } from '@prisma/client'

// Schemas
const CreateEntrySchema = z.object({
  projectId: z.number().int(),
  category: z.nativeEnum(KnowledgeCategory),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional().default('ACTIVE'),
})

const UploadFileSchema = z.object({
  projectId: z.number().int(),
  category: z.nativeEnum(KnowledgeCategory),
  title: z.string().min(1).max(500),
  filename: z.string().min(1),
  fileContent: z.string().min(1),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
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

    const projectIdParam = req.nextUrl.searchParams.get('projectId')
    const projectId = projectIdParam ? Number(projectIdParam) : NaN
    if (!projectIdParam || Number.isNaN(projectId)) {
      return NextResponse.json({ error: 'projectId é obrigatório e deve ser numérico' }, { status: 400 })
    }

    const categoryParam = req.nextUrl.searchParams.get('category') as KnowledgeCategory | null

    const organization = await db.organization.findUnique({
      where: { clerkOrgId: orgId },
    })

    if (!organization) {
      return NextResponse.json({ error: 'Organização não encontrada' }, { status: 404 })
    }

    const dbUser = await getUserFromClerkId(clerkUserId)

    // Verifica acesso ao projeto (projeto compartilhado com org ou do próprio usuário)
    const project = await db.project.findFirst({
      where: {
        id: projectId,
        OR: [
          {
            organizationProjects: {
              some: { organization: { clerkOrgId: orgId } },
            },
          },
          { userId: dbUser.id },
        ],
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado ou acesso negado' }, { status: 404 })
    }

    // Parse query params
    const searchParams = req.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') as 'ACTIVE' | 'DRAFT' | 'ARCHIVED' | null

    // Build where clause - filter by organization
    const where: Record<string, unknown> = {
      projectId,
    }

    if (status) {
      where.status = status
    }

    if (categoryParam) {
      where.category = categoryParam
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

      const { title, filename, fileContent, tags, status, projectId, category, metadata } = parsed.data

      // Verificar acesso ao projeto
      const project = await db.project.findFirst({
        where: {
          id: projectId,
          organizationProjects: {
            some: { organization: { clerkOrgId: orgId } },
          },
        },
      })

      if (!project) {
        return NextResponse.json({ error: 'Projeto não encontrado ou acesso negado' }, { status: 404 })
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
          workspaceId: orgId, // Deprecated, mantido durante migração
        },
      })

      try {
        await invalidateProjectCache(projectId)
      } catch (cacheError) {
        console.error('[knowledge] Failed to invalidate RAG cache after file upload', cacheError)
      }

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

      // Verificar acesso ao projeto
      const project = await db.project.findFirst({
        where: {
          id: projectId,
          organizationProjects: {
            some: { organization: { clerkOrgId: orgId } },
          },
        },
      })

      if (!project) {
        return NextResponse.json({ error: 'Projeto não encontrado ou acesso negado' }, { status: 404 })
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
          workspaceId: orgId, // Organization knowledge (legado)
        },
      })

      try {
        await invalidateProjectCache(projectId)
      } catch (cacheError) {
        console.error('[knowledge] Failed to invalidate RAG cache after entry create', cacheError)
      }

      return NextResponse.json(result, { status: 201 })
    }
  } catch (error) {
    console.error('Error creating organization knowledge:', error)

    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message?.includes('Unsupported file type')) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      if (error.message?.includes('OPENAI_API_KEY')) {
        return NextResponse.json({
          error: 'OpenAI API key não configurada. Configure OPENAI_API_KEY nas variáveis de ambiente.'
        }, { status: 500 })
      }

      if (error.message?.includes('UPSTASH_VECTOR')) {
        return NextResponse.json({
          error: 'Upstash Vector não configurado. Configure UPSTASH_VECTOR_REST_URL e UPSTASH_VECTOR_REST_TOKEN nas variáveis de ambiente.'
        }, { status: 500 })
      }

      // In development, show the actual error message
      if (process.env.NODE_ENV === 'development') {
        return NextResponse.json({
          error: 'Erro ao criar conhecimento',
          details: error.message,
          stack: error.stack
        }, { status: 500 })
      }
    }

    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
