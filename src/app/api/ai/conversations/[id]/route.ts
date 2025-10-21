import { NextResponse } from 'next/server'
import { validateUserAuthentication, getUserFromClerkId } from '@/lib/auth-utils'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// GET /api/ai/conversations/[id] - Get conversation with messages
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clerkUserId = await validateUserAuthentication()
    const dbUser = await getUserFromClerkId(clerkUserId)
    const { id } = await params

    // Verify ownership and fetch conversation with messages
    const conversation = await db.chatConversation.findFirst({
      where: {
        id,
        userId: dbUser.id,
      },
      include: {
        messages: {
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

    return NextResponse.json(conversation)
  } catch (error) {
    console.error('Error fetching conversation:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/ai/conversations/[id] - Delete conversation
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clerkUserId = await validateUserAuthentication()
    const dbUser = await getUserFromClerkId(clerkUserId)
    const { id } = await params

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

    // Delete conversation (messages will be cascade deleted)
    await db.chatConversation.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting conversation:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH /api/ai/conversations/[id] - Update conversation (e.g., title)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clerkUserId = await validateUserAuthentication()
    const dbUser = await getUserFromClerkId(clerkUserId)
    const { id } = await params
    const body = await req.json()

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
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
