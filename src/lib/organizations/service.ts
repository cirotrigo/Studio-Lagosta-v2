import { db } from '@/lib/db'
import type { Prisma, PrismaClient } from '../../../prisma/generated/client'

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
  const baseData = {
    name: payload.name?.toString().trim() || 'Organização sem nome',
    slug: sanitizeSlug(payload.slug, payload.id),
    imageUrl: normalizeImageUrl(payload),
    isActive: true,
    ...(typeof limits.maxMembers === 'number' ? { maxMembers: limits.maxMembers } : {}),
    ...(typeof limits.maxProjects === 'number' ? { maxProjects: limits.maxProjects } : {}),
    ...(typeof limits.creditsPerMonth === 'number' ? { creditsPerMonth: limits.creditsPerMonth } : {}),
  }

  if (existing) {
    const updated = await tx.organization.update({
      where: { id: existing.id },
      data: baseData,
    })

    await syncOrganizationCreditBalance(
      tx,
      updated.id,
      updated.creditsPerMonth,
      { resetCredits: false }
    )

    return updated
  }

  const created = await tx.organization.create({
    data: {
      clerkOrgId: payload.id,
      ...baseData,
      maxMembers: baseData.maxMembers ?? 5,
      maxProjects: baseData.maxProjects ?? 10,
      creditsPerMonth: baseData.creditsPerMonth ?? 1000,
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
