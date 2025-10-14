import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  OrganizationAccessError,
  requireOrganizationMembership,
} from '@/lib/organizations'

export async function DELETE(
  _req: Request,
  { params }: { params: { orgId: string; projectId: string } }
) {
  const { orgId, projectId } = params

  try {
    await requireOrganizationMembership(orgId, {
      permissions: ['org:project:share'],
    })

    const organization = await db.organization.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    })

    if (!organization) {
      return NextResponse.json({ error: 'Organização não encontrada' }, { status: 404 })
    }

    const projectIdNumber = Number(projectId)
    if (!Number.isInteger(projectIdNumber)) {
      return NextResponse.json({ error: 'ID do projeto inválido' }, { status: 400 })
    }

    const existing = await db.organizationProject.findUnique({
      where: {
        organizationId_projectId: {
          organizationId: organization.id,
          projectId: projectIdNumber,
        },
      },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Projeto não está compartilhado com a organização' },
        { status: 404 }
      )
    }

    await db.organizationProject.delete({
      where: {
        organizationId_projectId: {
          organizationId: organization.id,
          projectId: projectIdNumber,
        },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[Org Projects] Failed to remove shared project', error)
    return NextResponse.json(
      { error: 'Não foi possível remover o projeto da organização' },
      { status: 500 }
    )
  }
}
