import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-utils'

export const runtime = 'nodejs'

/**
 * Lightweight check: is the current user an admin?
 * Used by client components to conditionally render admin-only links.
 *
 * Always returns 200 with `{ isAdmin: boolean }` even when unauthenticated,
 * so the client doesn't have to special-case 401.
 */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ isAdmin: false })
    }
    const admin = await isAdmin(userId)
    return NextResponse.json({ isAdmin: admin })
  } catch (error) {
    console.error('[admin/me] error:', error)
    return NextResponse.json({ isAdmin: false })
  }
}
