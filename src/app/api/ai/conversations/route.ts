import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validateUserAuthentication, getUserFromClerkId } from '@/lib/auth-utils'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

const CreateConversationSchema = z.object({
  projectId: z.number().int(),
  title: z.string().min(1).max(200).optional(),
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

    const { title, projectId } = parsed.data
    const dbUser = await getUserFromClerkId(clerkUserId)

    const project = await db.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { userId: dbUser.id },
          ...(organizationId
            ? [
                {
                  organizationProjects: {
                    some: { organization: { clerkOrgId: organizationId } },
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

    // Calculate expiration date (7 days from now)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const conversation = await db.chatConversation.create({
      data: {
        userId: dbUser.id,
        clerkUserId,
        organizationId,
        projectId,
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
export async function GET(req: Request) {
  try {
    const clerkUserId = await validateUserAuthentication()
    const { orgId } = await auth()
    const organizationId = orgId ?? null

    const dbUser = await getUserFromClerkId(clerkUserId)

    // Project filter
    const searchParams = new URL(req.url).searchParams
    const projectIdParam = searchParams.get('projectId')
    const projectId = projectIdParam ? Number(projectIdParam) : NaN

    if (!projectIdParam || Number.isNaN(projectId)) {
      return NextResponse.json({ error: 'projectId é obrigatório e deve ser numérico' }, { status: 400 })
    }

    // Get conversations from last 7 days, ordered by last message
    const conversations = await db.chatConversation.findMany({
      where: {
        userId: dbUser.id,
        organizationId,
        projectId,
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
