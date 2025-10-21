import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validateUserAuthentication, getUserFromClerkId } from '@/lib/auth-utils'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

const CreateConversationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  organizationId: z.string().optional(),
})

// POST /api/ai/conversations - Create new conversation
export async function POST(req: Request) {
  try {
    const clerkUserId = await validateUserAuthentication()
    const { orgId } = await auth()
    const organizationId = orgId ?? null

    const body = await req.json()
    const parsed = CreateConversationSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', issues: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { title } = parsed.data
    const dbUser = await getUserFromClerkId(clerkUserId)

    // Calculate expiration date (7 days from now)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const conversation = await db.chatConversation.create({
      data: {
        userId: dbUser.id,
        clerkUserId,
        organizationId,
        title: title || 'Nova Conversa',
        expiresAt,
      },
    })

    return NextResponse.json(conversation)
  } catch (error) {
    console.error('Error creating conversation:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET /api/ai/conversations - List user's conversations (last 7 days)
export async function GET() {
  try {
    const clerkUserId = await validateUserAuthentication()
    const { orgId } = await auth()
    const organizationId = orgId ?? null

    const dbUser = await getUserFromClerkId(clerkUserId)

    // Get conversations from last 7 days, ordered by last message
    const conversations = await db.chatConversation.findMany({
      where: {
        userId: dbUser.id,
        organizationId,
        expiresAt: {
          gte: new Date(), // Only non-expired conversations
        },
      },
      orderBy: {
        lastMessageAt: 'desc',
      },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    })

    return NextResponse.json({ conversations })
  } catch (error) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
