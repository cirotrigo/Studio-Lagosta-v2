/**
 * Debug endpoint to get current organization ID from Clerk
 * Temporary - should be removed after migration
 */

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

export async function GET() {
  try {
    const { userId, orgId, orgRole, orgSlug } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    return NextResponse.json({
      userId,
      orgId,
      orgRole,
      orgSlug,
      hasOrganization: !!orgId,
      message: orgId
        ? 'You are in an organization. Use this orgId to update knowledge entries.'
        : 'You are not currently in an organization. Please select one first.',
    })
  } catch (error) {
    console.error('Error fetching org info:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
