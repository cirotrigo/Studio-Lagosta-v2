import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { PostingProvider } from '../../../../../prisma/generated/client'

export const runtime = 'nodejs'

/**
 * TEMPORARY ENDPOINT: Fix Later configuration for Project ID: 8
 * DELETE THIS FILE AFTER RUNNING ONCE
 */
export async function POST() {
  try {
    // TEMPORARY: Removed auth check for one-time fix
    // TODO: DELETE THIS ENDPOINT AFTER RUNNING ONCE
    console.log('[Admin] Fixing Later configuration for Project ID: 8...')

    // Get current config
    const project = await db.project.findUnique({
      where: { id: 8 },
      select: {
        id: true,
        name: true,
        instagramUsername: true,
        laterAccountId: true,
        laterProfileId: true,
        postingProvider: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project ID: 8 not found' }, { status: 404 })
    }

    console.log('[Admin] Current config:', project)

    // Update with correct Later IDs
    const updatedProject = await db.project.update({
      where: { id: 8 },
      data: {
        laterAccountId: '6951bef24207e06f4ca82e68',
        laterProfileId: '6950a7dfbf2041fa31e82829',
        postingProvider: PostingProvider.LATER,
      },
    })

    console.log('[Admin] Updated config:', {
      id: updatedProject.id,
      name: updatedProject.name,
      laterAccountId: updatedProject.laterAccountId,
      laterProfileId: updatedProject.laterProfileId,
      postingProvider: updatedProject.postingProvider,
    })

    return NextResponse.json({
      success: true,
      message: 'Later configuration fixed for Project ID: 8',
      before: {
        laterAccountId: project.laterAccountId,
        laterProfileId: project.laterProfileId,
        postingProvider: project.postingProvider,
      },
      after: {
        laterAccountId: updatedProject.laterAccountId,
        laterProfileId: updatedProject.laterProfileId,
        postingProvider: updatedProject.postingProvider,
      },
    })
  } catch (error) {
    console.error('[Admin] Error fixing Later config:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
