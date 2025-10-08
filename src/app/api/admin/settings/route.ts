import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/admin-utils'

/**
 * GET /api/admin/settings
 * Get site settings
 */
export async function GET() {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!(await isAdmin(userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const settings = await db.siteSettings.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json({ settings })
  } catch (error) {
    console.error('Error fetching settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/admin/settings
 * Create or update site settings
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!(await isAdmin(userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    console.log('[POST /api/admin/settings] Received body:', JSON.stringify(body, null, 2))

    // Validate required fields
    if (!body.siteName || !body.shortName || !body.description) {
      return NextResponse.json(
        { error: 'Missing required fields: siteName, shortName, description' },
        { status: 400 }
      )
    }

    // Deactivate all existing settings
    await db.siteSettings.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    })

    // Create new settings
    const settings = await db.siteSettings.create({
      data: {
        ...body,
        updatedBy: userId,
        isActive: true,
      },
    })

    console.log('[POST /api/admin/settings] Settings created:', settings.id)
    return NextResponse.json({ settings })
  } catch (error: any) {
    console.error('[POST /api/admin/settings] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/admin/settings
 * Update existing settings
 */
export async function PUT(request: Request) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!(await isAdmin(userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    console.log('[PUT /api/admin/settings] Received body:', JSON.stringify(body, null, 2))

    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ error: 'Settings ID is required' }, { status: 400 })
    }

    // Validate required fields
    if (!data.siteName || !data.shortName || !data.description) {
      return NextResponse.json(
        { error: 'Missing required fields: siteName, shortName, description' },
        { status: 400 }
      )
    }

    const settings = await db.siteSettings.update({
      where: { id },
      data: {
        ...data,
        updatedBy: userId,
      },
    })

    console.log('[PUT /api/admin/settings] Settings updated:', settings.id)
    return NextResponse.json({ settings })
  } catch (error: any) {
    console.error('[PUT /api/admin/settings] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
