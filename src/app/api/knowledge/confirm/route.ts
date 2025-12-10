import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { KnowledgeCategory } from '@prisma/client'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { indexEntry, updateEntry } from '@/lib/knowledge/indexer'
import { deleteVectorsByEntry } from '@/lib/knowledge/vector-client'
import { invalidateProjectCache } from '@/lib/knowledge/cache'

export const runtime = 'nodejs'

const MatchSchema = z.object({
  entryId: z.string(),
  title: z.string(),
  content: z.string(),
  score: z.number(),
  category: z.nativeEnum(KnowledgeCategory),
})

const PreviewSchema = z.object({
  operation: z.enum(['CREATE', 'UPDATE', 'REPLACE', 'DELETE']),
  category: z.nativeEnum(KnowledgeCategory),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  metadata: z.record(z.any()).optional().nullable(),
  targetEntryId: z.string().optional(),
  matchType: z.enum(['none', 'single', 'multiple', 'duplicate_warning']).optional(),
  matches: z.array(MatchSchema).optional(),
})

const BodySchema = z.object({
  projectId: z.number().int(),
  preview: PreviewSchema,
  conversationId: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', issues: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { projectId, preview, conversationId } = parsed.data
    const dbUser = await getUserFromClerkId(userId)

    const project = await db.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { userId: dbUser.id },
          ...(orgId
            ? [
                {
                  organizationProjects: {
                    some: { organization: { clerkOrgId: orgId } },
                  },
                },
              ]
            : []),
        ],
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado ou acesso negado' }, { status: 404 })
    }

    let conversationIdToUse: string | null = null

    if (conversationId) {
      const conversation = await db.chatConversation.findFirst({
        where: {
          id: conversationId,
          userId: dbUser.id,
        },
      })

      if (!conversation) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      }

      if (conversation.projectId && conversation.projectId !== projectId) {
        return NextResponse.json({ error: 'Conversation does not belong to this project' }, { status: 403 })
      }

      if (!conversation.projectId) {
        await db.chatConversation.update({
          where: { id: conversation.id },
          data: { projectId },
        })
      }

      conversationIdToUse = conversation.id
    }

    let entryId: string | null = null

    if (preview.operation === 'CREATE') {
      const { entry } = await indexEntry({
        title: preview.title,
        content: preview.content,
        tags: preview.tags,
        metadata: preview.metadata ?? undefined,
        status: 'ACTIVE',
        category: preview.category,
        createdBy: dbUser.id,
        tenant: {
          projectId,
          userId: dbUser.id,
          workspaceId: orgId ?? undefined,
        },
      })

      entryId = entry.id
    } else if (preview.operation === 'UPDATE' || preview.operation === 'REPLACE') {
      if (!preview.targetEntryId) {
        return NextResponse.json(
          { error: 'targetEntryId é obrigatório para UPDATE/REPLACE' },
          { status: 400 }
        )
      }

      const existingEntry = await db.knowledgeBaseEntry.findFirst({
        where: {
          id: preview.targetEntryId,
          projectId,
        },
      })

      if (!existingEntry) {
        return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
      }

      await updateEntry(
        preview.targetEntryId,
        {
          title: preview.title,
          content: preview.content,
          tags: preview.tags,
          metadata: preview.metadata ?? null,
          category: preview.category,
          updatedBy: dbUser.id,
        },
        {
          projectId,
          userId: dbUser.id,
          workspaceId: orgId ?? undefined,
        }
      )

      entryId = preview.targetEntryId
    } else if (preview.operation === 'DELETE') {
      if (!preview.targetEntryId) {
        return NextResponse.json(
          { error: 'targetEntryId é obrigatório para DELETE' },
          { status: 400 }
        )
      }

      const existingEntry = await db.knowledgeBaseEntry.findFirst({
        where: {
          id: preview.targetEntryId,
          projectId,
        },
      })

      if (!existingEntry) {
        return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
      }

      await deleteVectorsByEntry(preview.targetEntryId, {
        projectId,
        userId: dbUser.id,
        workspaceId: orgId ?? undefined,
      })

      await db.knowledgeBaseEntry.update({
        where: { id: preview.targetEntryId },
        data: {
          status: 'ARCHIVED',
          updatedBy: dbUser.id,
        },
      })

      entryId = preview.targetEntryId
    }

    if (conversationIdToUse && entryId) {
      // Atualiza apenas o timestamp da conversa; omitimos metadata enquanto a coluna não existe no DB
      await db.chatConversation.update({
        where: { id: conversationIdToUse },
        data: { lastMessageAt: new Date() },
      })
    }

    // Invalidar cache do projeto após modificação
    await invalidateProjectCache(projectId)

    return NextResponse.json({ success: true, entryId })
  } catch (error) {
    console.error('[knowledge/confirm] Error confirming knowledge action', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
