import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { isAdmin } from '@/lib/admin-utils'

export async function GET() {
  try {
    const authData = await auth()
    const { userId } = authData
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await isAdmin(userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const user = await currentUser()

    return NextResponse.json({
      auth: {
        userId: authData.userId,
        orgId: authData.orgId,
        orgRole: authData.orgRole,
        orgSlug: authData.orgSlug,
        sessionId: authData.sessionId,
      },
      user: user ? {
        id: user.id,
        email: user.emailAddresses[0]?.emailAddress,
        firstName: user.firstName,
        lastName: user.lastName,
        publicMetadata: user.publicMetadata,
      } : null,
    })
  } catch (error) {
    console.error('Debug auth error:', error)
    return NextResponse.json(
      { error: 'Failed to get auth info' },
      { status: 500 }
    )
  }
}
