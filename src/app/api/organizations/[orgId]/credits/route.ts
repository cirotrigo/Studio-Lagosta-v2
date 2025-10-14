import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  OrganizationAccessError,
  requireOrganizationMembership,
} from '@/lib/organizations'
import {
  ensureOrganizationCreditBalance,
  getOrganizationByClerkId,
} from '@/lib/organizations/service'

const updateCreditsSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().max(200).optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: { orgId: string } }
) {
  const { orgId } = params

  try {
    await requireOrganizationMembership(orgId, {
      permissions: ['org:credits:view'],
    })

    const organization = await getOrganizationByClerkId(orgId)
    if (!organization) {
      return NextResponse.json({ error: 'Organização não encontrada' }, { status: 404 })
    }

    const balance =
      organization.creditBalance ?? (await ensureOrganizationCreditBalance(orgId))

    return NextResponse.json({
      organization: {
        id: organization.clerkOrgId,
        name: organization.name,
        slug: organization.slug,
        isActive: organization.isActive,
      },
      credits: {
        current: balance?.credits ?? organization.creditsPerMonth,
        refillAmount: balance?.refillAmount ?? organization.creditsPerMonth,
        lastRefill: balance?.lastRefill ?? null,
      },
      limits: {
        maxMembers: organization.maxMembers,
        maxProjects: organization.maxProjects,
        creditsPerMonth: organization.creditsPerMonth,
      },
    })
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[Org Credits] Failed to fetch credits', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar os créditos da organização' },
      { status: 500 }
    )
  }
}

export async function POST(
  req: Request,
  { params }: { params: { orgId: string } }
) {
  const { orgId } = params

  try {
    const context = await requireOrganizationMembership(orgId, {
      permissions: ['org:credits:manage'],
    })

    const payload = updateCreditsSchema.safeParse(await req.json())
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: payload.error.flatten() },
        { status: 400 }
      )
    }

    const organization = await getOrganizationByClerkId(orgId)
    if (!organization) {
      return NextResponse.json({ error: 'Organização não encontrada' }, { status: 404 })
    }

    const balance =
      organization.creditBalance ??
      (await ensureOrganizationCreditBalance(orgId)) ??
      (await db.organizationCreditBalance.create({
        data: {
          organizationId: organization.id,
          credits: organization.creditsPerMonth,
          refillAmount: organization.creditsPerMonth,
        },
      }))

    const updated = await db.organizationCreditBalance.update({
      where: { id: balance.id },
      data: {
        credits: { increment: payload.data.amount },
      },
    })

    await db.organizationUsage.create({
      data: {
        organizationId: organization.id,
        userId: context.clerkUserId,
        feature: 'manual_credit_adjustment',
        credits: payload.data.amount,
        metadata: {
          reason: payload.data.reason ?? 'manual_adjustment',
          type: 'top_up',
        },
      },
    })

    return NextResponse.json({
      success: true,
      credits: {
        current: updated.credits,
        refillAmount: updated.refillAmount,
        lastRefill: updated.lastRefill,
      },
    })
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[Org Credits] Failed to adjust credits', error)
    return NextResponse.json(
      { error: 'Não foi possível atualizar os créditos da organização' },
      { status: 500 }
    )
  }
}
