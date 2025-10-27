import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const UpdateSettingsSchema = z.object({
  projectId: z.number().int(),
  weeklyFeedGoal: z.number().int().min(1).max(30).optional(),
  dailyStoryGoal: z.number().int().min(1).max(20).optional(),
  isActive: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const projectId = parseInt(url.searchParams.get('projectId') || '0')

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
    }

    // Verificar acesso
    const project = await db.project.findFirst({
      where: {
        id: projectId,
        userId,
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Buscar ou criar configurações
    let settings = await db.instagramGoalSettings.findUnique({
      where: { projectId },
    })

    if (!settings) {
      settings = await db.instagramGoalSettings.create({
        data: {
          projectId,
        },
      })
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error fetching Instagram settings:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = UpdateSettingsSchema.parse(body)

    // Verificar acesso
    const project = await db.project.findFirst({
      where: {
        id: data.projectId,
        userId,
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Atualizar configurações
    const settings = await db.instagramGoalSettings.upsert({
      where: { projectId: data.projectId },
      create: {
        projectId: data.projectId,
        weeklyFeedGoal: data.weeklyFeedGoal || 4,
        dailyStoryGoal: data.dailyStoryGoal || 3,
        isActive: data.isActive ?? true,
      },
      update: {
        weeklyFeedGoal: data.weeklyFeedGoal,
        dailyStoryGoal: data.dailyStoryGoal,
        isActive: data.isActive,
      },
    })

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error updating Instagram settings:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
