/**
 * Later Accounts API
 * Returns list of Instagram accounts connected to Later
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getLaterClient } from '@/lib/later/client'

export async function GET(req: NextRequest) {
  try {
    // Authenticate user
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get Later client
    const laterClient = getLaterClient()

    // Fetch accounts from Later API
    const accounts = await laterClient.listAccounts()

    // Map to simpler format for frontend
    const mappedAccounts = accounts.map((account) => {
      return {
        id: account._id,
        username: account.username,
        displayName: account.displayName,
        platform: account.platform,
        isActive: account.isActive,
        profileId: typeof account.profileId === 'string' ? account.profileId : account.profileId._id,
        followers: account.metadata?.profileData?.followersCount || null,
      }
    })

    return NextResponse.json({
      accounts: mappedAccounts,
      total: mappedAccounts.length,
    })
  } catch (error) {
    console.error('[Later Accounts API] Error:', error)

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to fetch Later accounts' },
      { status: 500 }
    )
  }
}
