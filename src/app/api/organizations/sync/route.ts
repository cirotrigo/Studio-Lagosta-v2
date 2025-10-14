import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  OrganizationAccessError,
  requireOrganizationMembership,
  syncOrganizationFromClerk,
} from '@/lib/organizations'
import type { ClerkOrganizationPayload } from '@/lib/organizations'

const syncSchema = z.object({
  organization: z
    .object({
      id: z.string().min(1),
    })
    .passthrough(),
})

export async function POST(req: Request) {
  try {
    const payload = syncSchema.safeParse(await req.json())
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: payload.error.flatten() },
        { status: 400 }
      )
    }

    const organization = payload.data.organization as ClerkOrganizationPayload

    const context = await requireOrganizationMembership(organization.id)
    if (context.organizationRole !== 'org:admin') {
      return NextResponse.json(
        { error: 'Somente administradores da organização podem sincronizar dados' },
        { status: 403 }
      )
    }

    const updated = await syncOrganizationFromClerk(organization)

    return NextResponse.json({
      success: true,
      organization: {
        id: updated.clerkOrgId,
        name: updated.name,
        slug: updated.slug,
        imageUrl: updated.imageUrl,
        maxMembers: updated.maxMembers,
        maxProjects: updated.maxProjects,
        creditsPerMonth: updated.creditsPerMonth,
      },
    })
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('[Org Sync] Failed to sync organization', error)
    return NextResponse.json(
      { error: 'Não foi possível sincronizar a organização' },
      { status: 500 }
    )
  }
}
