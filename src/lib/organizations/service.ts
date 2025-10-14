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

    if (planLimits.allowOrgCreation && planLimits.orgCountLimit != null) {
      const ownedCount = await tx.organization.count({
        where: { ownerClerkId, isActive: true },
      })

      if (ownedCount >= planLimits.orgCountLimit) {
        console.warn(
          `[organizations] owner ${ownerClerkId} reached plan organization limit (${planLimits.orgCountLimit})`,
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
