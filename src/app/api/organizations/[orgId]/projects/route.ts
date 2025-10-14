import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  OrganizationAccessError,
  requireOrganizationMembership,
} from '@/lib/organizations'

const shareProjectSchema = z.object({
  projectId: z.number().int().positive(),
  canEdit: z.boolean().optional().default(true),
})

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params

  try {
    await requireOrganizationMembership(orgId)

    const sharedProjects = await db.organizationProject.findMany({
      where: {
        organization: { clerkOrgId: orgId },
      },
      orderBy: { sharedAt: 'desc' },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            description: true,
            updatedAt: true,
            createdAt: true,
            userId: true,
          },
        },
      },
    })

    return NextResponse.json({
      projects: sharedProjects.map((item) => ({
        id: item.project.id,
        name: item.project.name,
        description: item.project.description,
        sharedAt: item.sharedAt,
        sharedBy: item.sharedBy,
        defaultCanEdit: item.defaultCanEdit,
        ownerId: item.project.userId,
        updatedAt: item.project.updatedAt,
        createdAt: item.project.createdAt,
      })),
    })
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[Org Projects] Failed to list shared projects', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar os projetos da organização' },
      { status: 500 }
    )
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params

  try {
    const context = await requireOrganizationMembership(orgId, {
      permissions: ['org:project:share'],
    })

    const payload = shareProjectSchema.safeParse(await req.json())
    if (!payload.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: payload.error.flatten() },
        { status: 400 }
      )
    }

    const project = await db.project.findUnique({
      where: { id: payload.data.projectId },
      select: {
        id: true,
        userId: true,
        name: true,
        description: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    if (project.userId !== context.clerkUserId) {
      return NextResponse.json(
        { error: 'Apenas o proprietário do projeto pode compartilhá-lo' },
        { status: 403 }
      )
    }

    const organization = await db.organization.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true, maxProjects: true },
    })

    if (!organization) {
      return NextResponse.json({ error: 'Organização não encontrada' }, { status: 404 })
    }

    if (organization.maxProjects != null) {
      const currentCount = await db.organizationProject.count({
        where: { organizationId: organization.id },
      })
      if (currentCount >= organization.maxProjects) {
        return NextResponse.json(
          { error: 'Limite de projetos compartilhados atingido para este plano' },
          { status: 403 },
        )
      }
    }

    const shared = await db.organizationProject.upsert({
      where: {
        organizationId_projectId: {
          organizationId: organization.id,
          projectId: project.id,
        },
      },
      update: {
        defaultCanEdit: payload.data.canEdit,
        sharedBy: context.clerkUserId,
      },
      create: {
        organizationId: organization.id,
        projectId: project.id,
        defaultCanEdit: payload.data.canEdit,
        sharedBy: context.clerkUserId,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            description: true,
            updatedAt: true,
            createdAt: true,
            userId: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      project: {
        id: shared.project.id,
        name: shared.project.name,
        description: shared.project.description,
        ownerId: shared.project.userId,
        sharedAt: shared.sharedAt,
        sharedBy: shared.sharedBy,
        defaultCanEdit: shared.defaultCanEdit,
      },
    })
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[Org Projects] Failed to share project', error)
    return NextResponse.json(
      { error: 'Não foi possível compartilhar o projeto com a organização' },
      { status: 500 }
    )
  }
}
