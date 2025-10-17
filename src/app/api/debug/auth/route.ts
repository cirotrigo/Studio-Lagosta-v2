import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'

export async function GET() {
  try {
    const authData = await auth()
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
