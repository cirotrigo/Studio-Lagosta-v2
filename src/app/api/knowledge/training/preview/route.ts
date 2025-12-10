import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { formatPreviewMessage, processTrainingInput } from '@/lib/knowledge/training-pipeline'

export const runtime = 'nodejs'

const PreviewSchema = z.object({
  projectId: z.number().int(),
  message: z.string().min(1),
  conversationId: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const parsed = PreviewSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', issues: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { projectId, message, conversationId } = parsed.data
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

    const preview = await processTrainingInput(message, projectId)

    if (!preview) {
      return NextResponse.json({
        mode: 'query',
        preview: null,
        message:
          'A intenção foi classificada como consulta. Desligue o modo treinamento para fazer perguntas.',
      })
    }

    const formattedPreview = formatPreviewMessage(preview)

    if (conversationIdToUse) {
      const now = new Date()
      const expiresAt = new Date(now)
      expiresAt.setDate(expiresAt.getDate() + 7)

      await db.chatMessage.createMany({
        data: [
          {
            conversationId: conversationIdToUse,
            role: 'user',
            content: message,
          },
          {
            conversationId: conversationIdToUse,
            role: 'assistant',
            content: formattedPreview,
          },
        ],
      })

      await db.chatConversation.update({
        where: { id: conversationIdToUse },
        data: {
          projectId,
          lastMessageAt: now,
          expiresAt,
        },
      })
    }

    return NextResponse.json({
      preview,
      message: formattedPreview,
    })
  } catch (error) {
    console.error('[training/preview] Error generating preview', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
