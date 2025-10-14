import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  OrganizationAccessError,
  requireOrganizationMembership,
} from '@/lib/organizations'

const settingsSchema = z
  .object({
    maxMembers: z.number().int().positive().max(10000).optional(),
    maxProjects: z.number().int().positive().max(10000).optional(),
    creditsPerMonth: z.number().int().positive().max(1_000_000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Nenhuma configuração enviada',
  })

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params

  try {
    const context = await requireOrganizationMembership(orgId)

    const organization = await db.organization.findUnique({
      where: { clerkOrgId: orgId },
    })

    if (!organization) {
      return NextResponse.json({ error: 'Organização não encontrada' }, { status: 404 })
    }

    return NextResponse.json({
      organization: {
        id: organization.clerkOrgId,
        name: organization.name,
        slug: organization.slug,
        isActive: organization.isActive,
        role: context.organizationRole,
      },
      settings: {
        maxMembers: organization.maxMembers,
        maxProjects: organization.maxProjects,
        creditsPerMonth: organization.creditsPerMonth,
      },
    })
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('[Org Settings] Failed to fetch settings', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar as configurações da organização' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params

  try {
    const context = await requireOrganizationMembership(orgId)

    if (context.organizationRole !== 'org:admin') {
      return NextResponse.json(
        { error: 'Somente administradores podem atualizar configurações da organização' },
        { status: 403 }
      )
    }

    const payload = settingsSchema.safeParse(await req.json())
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: payload.error.flatten() },
        { status: 400 }
      )
    }

    const organization = await db.organization.update({
      where: { clerkOrgId: orgId },
      data: payload.data,
    })

    if (payload.data.creditsPerMonth) {
      await db.organizationCreditBalance.updateMany({
        where: { organizationId: organization.id },
        data: { refillAmount: payload.data.creditsPerMonth },
      })
    }

    return NextResponse.json({
      success: true,
      settings: {
        maxMembers: organization.maxMembers,
        maxProjects: organization.maxProjects,
        creditsPerMonth: organization.creditsPerMonth,
      },
    })
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('[Org Settings] Failed to update settings', error)
    return NextResponse.json(
      { error: 'Não foi possível atualizar as configurações da organização' },
      { status: 500 }
    )
  }
}
