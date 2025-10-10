import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { isAdmin } from '@/lib/admin-utils'
import { getEffectiveFeatureCosts, getEffectivePlanCredits, upsertAdminSettings } from '@/lib/credits/settings'

/**
 * GET /api/admin/feature-costs
 * Get feature costs and plan credits
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

    const featureCosts = await getEffectiveFeatureCosts()
    const planCredits = await getEffectivePlanCredits()

    return NextResponse.json({ featureCosts, planCredits })
  } catch (_error) {
    console.error('Error fetching admin settings:', _error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/admin/feature-costs
 * Update feature costs
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
    console.log('[PUT /api/admin/feature-costs] Received body:', JSON.stringify(body, null, 2))

    // Update admin settings
    await upsertAdminSettings({
      featureCosts: body.featureCosts || {},
    })

    const featureCosts = await getEffectiveFeatureCosts()
    const planCredits = await getEffectivePlanCredits()

    console.log('[PUT /api/admin/feature-costs] Settings updated')
    return NextResponse.json({ featureCosts, planCredits })
  } catch (error) {
    console.error('[PUT /api/admin/feature-costs] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
