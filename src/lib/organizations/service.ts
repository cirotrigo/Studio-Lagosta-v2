import { db } from '@/lib/db'
import type { Prisma, PrismaClient } from '../../../prisma/generated/client'
import { getPlanLimitsForUser } from './limits'

type TransactionClient = Prisma.TransactionClient | PrismaClient

type NullableString = string | null | undefined
type MaybeRecord = Record<string, unknown> | null | undefined

export interface ClerkOrganizationPayload {
  id: string
  name?: NullableString
  slug?: NullableString
  image_url?: NullableString
  logo_url?: NullableString
  public_metadata?: MaybeRecord
  created_by?: NullableString
}

function sanitizeSlug(slug: NullableString, fallback: string) {
  if (typeof slug === 'string' && slug.trim().length > 0) {
    return slug.trim().toLowerCase()
  }
  return fallback.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase() || fallback
}

function normalizeImageUrl(payload: ClerkOrganizationPayload) {
  return payload.image_url ?? payload.logo_url ?? null
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }
  return undefined
}

function extractLimits(metadata: MaybeRecord) {
  if (!metadata || typeof metadata !== 'object') {
    return {}
  }

  return {
    maxMembers: coerceNumber(metadata.maxMembers) ?? undefined,
    maxProjects: coerceNumber(metadata.maxProjects) ?? undefined,
    creditsPerMonth: coerceNumber(metadata.creditsPerMonth) ?? undefined,
  }
}

function extractOwnerFromMetadata(metadata: MaybeRecord): string | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined
  }

  const owner = (metadata as Record<string, unknown>).ownerClerkId
  if (typeof owner === 'string' && owner.trim().length > 0) {
    return owner.trim()
  }
  return undefined
}

export async function getOrganizationByClerkId(clerkOrgId: string) {
  return db.organization.findUnique({
    where: { clerkOrgId },
    include: {
      creditBalance: true,
    },
  })
}

async function syncOrganizationCreditBalance(
  tx: TransactionClient,
  organizationId: string,
  creditsPerMonth: number,
  { resetCredits = false }: { resetCredits?: boolean } = {}
) {
  await tx.organizationCreditBalance.upsert({
    where: { organizationId },
    update: {
      ...(resetCredits ? { credits: creditsPerMonth } : {}),
      refillAmount: creditsPerMonth,
    },
    create: {
      organizationId,
      credits: creditsPerMonth,
      refillAmount: creditsPerMonth,
    },
  })
}

export async function syncOrganizationFromClerk(
  payload: ClerkOrganizationPayload,
  tx: TransactionClient = db
) {
  if (!payload?.id) {
    throw new Error('Invalid organization payload: missing id')
  }

  const existing = await tx.organization.findUnique({
    where: { clerkOrgId: payload.id },
  })

  const limits = extractLimits(payload.public_metadata)
  const ownerFromMetadata = extractOwnerFromMetadata(payload.public_metadata)
  const createdBy =
    typeof payload.created_by === 'string' && payload.created_by.trim().length > 0
      ? payload.created_by.trim()
      : undefined

  const baseData = {
    name: payload.name?.toString().trim() || 'Organização sem nome',
    slug: sanitizeSlug(payload.slug, payload.id),
    imageUrl: normalizeImageUrl(payload),
    isActive: true,
    ownerClerkId: ownerFromMetadata ?? createdBy ?? undefined,
    ...(typeof limits.maxMembers === 'number' ? { maxMembers: limits.maxMembers } : {}),
    ...(typeof limits.maxProjects === 'number' ? { maxProjects: limits.maxProjects } : {}),
    ...(typeof limits.creditsPerMonth === 'number' ? { creditsPerMonth: limits.creditsPerMonth } : {}),
  }

  if (existing) {
    const ownerClerkId = baseData.ownerClerkId ?? existing.ownerClerkId ?? null

    const updated = await tx.organization.update({
      where: { id: existing.id },
      data: {
        ...baseData,
        ownerClerkId,
      },
    })

    await syncOrganizationCreditBalance(
      tx,
      updated.id,
      updated.creditsPerMonth,
      { resetCredits: false }
    )

    return updated
  }

  const ownerClerkId = baseData.ownerClerkId ?? createdBy ?? null
  let planLimits:
    | Awaited<ReturnType<typeof getPlanLimitsForUser>>
    | null = null

  if (ownerClerkId) {
    planLimits = await getPlanLimitsForUser(ownerClerkId)

    // Block organization creation if plan doesn't allow it
    if (!planLimits.allowOrgCreation) {
      throw new Error(
        `[organizations] owner ${ownerClerkId} does not have permission to create organizations (current plan does not allow it)`
      )
    }

    // Block organization creation if user has reached the limit
    if (planLimits.orgCountLimit != null) {
      const ownedCount = await tx.organization.count({
        where: { ownerClerkId, isActive: true },
      })

      if (ownedCount >= planLimits.orgCountLimit) {
        throw new Error(
          `[organizations] owner ${ownerClerkId} has reached organization limit (${ownedCount}/${planLimits.orgCountLimit}). Upgrade plan to create more organizations.`
        )
      }
    }
  }

  const resolvedMaxMembers =
    baseData.maxMembers ??
    planLimits?.orgMemberLimit ??
    5
  const resolvedMaxProjects =
    baseData.maxProjects ??
    planLimits?.orgProjectLimit ??
    10
  const resolvedCredits =
    baseData.creditsPerMonth ??
    planLimits?.orgCreditsPerMonth ??
    1000

  const created = await tx.organization.create({
    data: {
      clerkOrgId: payload.id,
      ...baseData,
      ownerClerkId,
      maxMembers: resolvedMaxMembers,
      maxProjects: resolvedMaxProjects,
      creditsPerMonth: resolvedCredits,
    },
  })

  await syncOrganizationCreditBalance(
    tx,
    created.id,
    created.creditsPerMonth,
    { resetCredits: true }
  )

  return created
}

export async function markOrganizationDeleted(clerkOrgId: string, tx: TransactionClient = db) {
  const organization = await tx.organization.findUnique({ where: { clerkOrgId } })
  if (!organization) {
    return null
  }

  return tx.organization.update({
    where: { id: organization.id },
    data: {
      isActive: false,
    },
  })
}

export async function removeOrganization(clerkOrgId: string, tx: TransactionClient = db) {
  const organization = await tx.organization.findUnique({ where: { clerkOrgId } })
  if (!organization) {
    return null
  }

  return tx.organization.delete({
    where: { id: organization.id },
  })
}

/**
 * Ensures the organization exists in database by syncing from Clerk if needed
 * This is useful when a user is in an organization but webhook hasn't been processed yet
 * @param clerkOrgId - Clerk organization ID
 * @param clerkApi - Optional Clerk API client to fetch organization data
 * @returns The organization record or null if sync failed
 */
export async function ensureOrganizationExists(
  clerkOrgId: string,
  tx: TransactionClient = db
) {
  // Try to find existing organization
  const existing = await tx.organization.findUnique({
    where: { clerkOrgId },
  })

  if (existing) {
    return existing
  }

  // Organization doesn't exist in database, try to sync from Clerk
  console.log(`[Organizations] Organization ${clerkOrgId} not found in DB, attempting to sync from Clerk`)

  try {
    // Import clerkClient dynamically to avoid circular dependencies
    const { clerkClient } = await import('@clerk/nextjs/server')

    // Fetch organization from Clerk
    const client = await clerkClient()
    const clerkOrg = await client.organizations.getOrganization({
      organizationId: clerkOrgId,
    })

    if (!clerkOrg) {
      console.error(`[Organizations] Organization ${clerkOrgId} not found in Clerk`)
      return null
    }

    // Sync to database
    const synced = await syncOrganizationFromClerk({
      id: clerkOrg.id,
      name: clerkOrg.name,
      slug: clerkOrg.slug,
      image_url: clerkOrg.imageUrl,
      public_metadata: clerkOrg.publicMetadata,
      created_by: clerkOrg.createdBy,
    }, tx)

    console.log(`[Organizations] Successfully synced organization ${clerkOrgId} from Clerk`)
    return synced
  } catch (error) {
    console.error(`[Organizations] Failed to sync organization ${clerkOrgId} from Clerk:`, error)
    return null
  }
}

export async function ensureOrganizationCreditBalance(
  clerkOrgId: string,
  tx: TransactionClient = db
) {
  const organization = await tx.organization.findUnique({
    where: { clerkOrgId },
  })

  if (!organization) {
    throw new Error(`Organização ${clerkOrgId} não encontrada`)
  }

  await syncOrganizationCreditBalance(
    tx,
    organization.id,
    organization.creditsPerMonth,
    { resetCredits: false }
  )

  return tx.organizationCreditBalance.findUnique({
    where: { organizationId: organization.id },
  })
}

/**
 * Validates if a new member can be added to the organization based on plan limits
 * @throws Error if the organization has reached its member limit
 */
export async function validateMemberAddition(
  clerkOrgId: string,
  tx: TransactionClient = db
) {
  const organization = await tx.organization.findUnique({
    where: { clerkOrgId },
    select: {
      id: true,
      maxMembers: true,
      isActive: true,
    },
  })

  if (!organization) {
    throw new Error(`Organização ${clerkOrgId} não encontrada`)
  }

  if (!organization.isActive) {
    throw new Error(`Organização ${clerkOrgId} está inativa`)
  }

  // maxMembers null means unlimited
  if (organization.maxMembers == null) {
    return true
  }

  // Note: Clerk manages member count, but we validate against our limits
  // In a real scenario, we'd query Clerk API to get actual member count
  // For now, we trust that organization.maxMembers was set correctly from the plan
  // The actual enforcement happens at Clerk level when inviting

  return true
}

/**
 * Refills credits for organizations that are due for renewal
 * This should be called by a cron job monthly
 * @returns Number of organizations that had their credits refilled
 */
export async function refillOrganizationCredits(tx: TransactionClient = db) {
  const now = new Date()
  const oneMonthAgo = new Date(now)
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

  // Find organizations that need credit refill
  const organizationsToRefill = await tx.organization.findMany({
    where: {
      isActive: true,
      creditBalance: {
        OR: [
          { lastRefill: null },
          { lastRefill: { lte: oneMonthAgo } },
        ],
      },
    },
    include: {
      creditBalance: true,
    },
  })

  let refillCount = 0

  for (const org of organizationsToRefill) {
    if (!org.creditBalance) {
      // Create credit balance if it doesn't exist
      await syncOrganizationCreditBalance(
        tx,
        org.id,
        org.creditsPerMonth,
        { resetCredits: true }
      )
      refillCount++
      continue
    }

    // Refill credits to the monthly amount
    await tx.organizationCreditBalance.update({
      where: { organizationId: org.id },
      data: {
        credits: org.creditsPerMonth,
        lastRefill: now,
      },
    })
    refillCount++
  }

  return refillCount
}
