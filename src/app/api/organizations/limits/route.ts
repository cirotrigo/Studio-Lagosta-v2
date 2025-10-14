import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getPlanLimitsForUser } from '@/lib/organizations/limits'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const limits = await getPlanLimitsForUser(userId)
    const activeOwnedCount = await db.organization.count({
      where: {
        ownerClerkId: userId,
        isActive: true,
      },
    })

    const totalOwnedCount = await db.organization.count({
      where: { ownerClerkId: userId },
    })

    const canCreate =
      limits.allowOrgCreation &&
      (limits.orgCountLimit == null || activeOwnedCount < limits.orgCountLimit)

    return NextResponse.json({
      limits,
      ownedCount: totalOwnedCount,
      activeOwnedCount,
      canCreate,
    })
  } catch (error) {
    console.error('[Org Limits] Failed to fetch organization limits', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar os limites do plano' },
      { status: 500 },
    )
  }
}
