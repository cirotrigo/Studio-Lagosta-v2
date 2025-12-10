import { NextResponse } from 'next/server'
import { validateUserAuthentication, getUserFromClerkId } from '@/lib/auth-utils'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// GET /api/ai/conversations/[id] - Get conversation with messages
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const clerkUserId = await validateUserAuthentication()
    const dbUser = await getUserFromClerkId(clerkUserId)
    const { id } = params
    const searchParams = new URL(req.url).searchParams
    const projectIdParam = searchParams.get('projectId')
    const projectId = projectIdParam ? Number(projectIdParam) : NaN

    if (!projectIdParam || Number.isNaN(projectId) || projectId <= 0) {
      return NextResponse.json({ error: 'projectId é obrigatório e deve ser numérico' }, { status: 400 })
    }

    // Verify ownership and fetch conversation with messages
    const conversation = await db.chatConversation.findFirst({
      where: {
        id,
        userId: dbUser.id,
      },
      include: {
        messages: {
          select: {
            id: true,
            conversationId: true,
            role: true,
            content: true,
            provider: true,
            model: true,
            attachments: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    })

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
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

    return NextResponse.json(conversation)
  } catch (error) {
    console.error('Error fetching conversation:', error)
    return NextResponse.json(
      { error: 'Internal server error', detail: (error as Error)?.message },
      { status: 500 }
    )
  }
}

// DELETE /api/ai/conversations/[id] - Delete conversation
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const clerkUserId = await validateUserAuthentication()
    const dbUser = await getUserFromClerkId(clerkUserId)
    const { id } = params
    const searchParams = new URL(req.url).searchParams
    const projectIdParam = searchParams.get('projectId')
    const projectId = projectIdParam ? Number(projectIdParam) : NaN

    if (!projectIdParam || Number.isNaN(projectId) || projectId <= 0) {
      return NextResponse.json({ error: 'projectId é obrigatório e deve ser numérico' }, { status: 400 })
    }

    // Verify ownership before deleting
    const conversation = await db.chatConversation.findFirst({
      where: {
        id,
        userId: dbUser.id,
      },
    })

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    if (conversation.projectId && conversation.projectId !== projectId) {
      return NextResponse.json({ error: 'Conversation does not belong to this project' }, { status: 403 })
    }

    // Delete conversation (messages will be cascade deleted)
    await db.chatConversation.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting conversation:', error)
    return NextResponse.json(
      { error: 'Internal server error', detail: (error as Error)?.message },
      { status: 500 }
    )
  }
}

// PATCH /api/ai/conversations/[id] - Update conversation (e.g., title)
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const clerkUserId = await validateUserAuthentication()
    const dbUser = await getUserFromClerkId(clerkUserId)
    const { id } = params
    const body = await req.json()
    const searchParams = new URL(req.url).searchParams
    const projectIdParam = searchParams.get('projectId')
    const projectId = projectIdParam ? Number(projectIdParam) : NaN

    if (!projectIdParam || Number.isNaN(projectId) || projectId <= 0) {
      return NextResponse.json({ error: 'projectId é obrigatório e deve ser numérico' }, { status: 400 })
    }

    // Verify ownership
    const conversation = await db.chatConversation.findFirst({
      where: {
        id,
        userId: dbUser.id,
      },
    })

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
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

    // Update conversation
    const updated = await db.chatConversation.update({
      where: { id },
      data: {
        title: body.title || conversation.title,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating conversation:', error)
    return NextResponse.json(
      { error: 'Internal server error', detail: (error as Error)?.message },
      { status: 500 }
    )
  }
}
