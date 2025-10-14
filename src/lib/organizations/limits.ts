import { clerkClient } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

type NullableInt = number | null

export type PlanOrganizationLimits = {
  allowOrgCreation: boolean
  orgMemberLimit: NullableInt
  orgProjectLimit: NullableInt
  orgCreditsPerMonth: NullableInt
  orgCountLimit: NullableInt
}

const DEFAULT_LIMITS: PlanOrganizationLimits = {
  allowOrgCreation: false,
  orgMemberLimit: null,
  orgProjectLimit: null,
  orgCreditsPerMonth: null,
  orgCountLimit: null,
}

export async function getPlanLimitsForUser(clerkUserId: string): Promise<PlanOrganizationLimits> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(clerkUserId)
    const planKeyRaw = (user.publicMetadata as { subscriptionPlan?: string }).subscriptionPlan
    const planKey = typeof planKeyRaw === 'string' && planKeyRaw.trim().length > 0 ? planKeyRaw.trim() : null

    if (!planKey) {
      return DEFAULT_LIMITS
    }

    const plan = await db.plan.findFirst({
      where: {
        OR: [
          { clerkId: planKey },
          { id: planKey },
          { name: { equals: planKey, mode: 'insensitive' } },
        ],
      },
    })

    if (!plan) {
      return DEFAULT_LIMITS
    }

    return {
      allowOrgCreation: plan.allowOrgCreation ?? false,
      orgMemberLimit: plan.orgMemberLimit ?? null,
      orgProjectLimit: plan.orgProjectLimit ?? null,
      orgCreditsPerMonth: plan.orgCreditsPerMonth ?? null,
      orgCountLimit: plan.orgCountLimit ?? null,
    }
  } catch (error) {
    console.error('[plan-limits] failed to resolve limits', error)
    return DEFAULT_LIMITS
  }
}
*** End PATCH
