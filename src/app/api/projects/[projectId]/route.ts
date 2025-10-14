import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { projectId } = await params
    const projectIdNum = Number(projectId)
    if (Number.isNaN(projectIdNum)) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }

    const project = await db.project.findUnique({
      where: { id: projectIdNum },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        logoUrl: true,
        googleDriveFolderId: true,
        googleDriveFolderName: true,
        googleDriveImagesFolderId: true,
        googleDriveImagesFolderName: true,
        googleDriveVideosFolderId: true,
        googleDriveVideosFolderName: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        organizationProjects: {
          include: {
            organization: {
              select: {
                clerkOrgId: true,
                name: true,
              },
            },
          },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    const hasOrganizationAccess = Boolean(
      orgId && project.organizationProjects.some((share) => share.organization.clerkOrgId === orgId),
    )

    if (project.userId !== userId && !hasOrganizationAccess) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const { organizationProjects, ...rest } = project

    return NextResponse.json({
      ...rest,
      organizationShares: organizationProjects.map((share) => ({
        organizationId: share.organization.clerkOrgId,
        organizationName: share.organization.name,
        defaultCanEdit: share.defaultCanEdit,
        sharedAt: share.sharedAt,
      })),
    })
  } catch (error) {
    console.error('[API] Failed to fetch project', error)
    return NextResponse.json({ error: 'Erro ao buscar projeto' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { projectId } = await params
    const projectIdNum = Number(projectId)
    if (Number.isNaN(projectIdNum)) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }

    // Verificar se o projeto existe e pertence ao usuário
    const project = await db.project.findFirst({
      where: { id: projectIdNum, userId },
    })

    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    // Deletar projeto (cascade vai deletar templates, gerações, etc)
    await db.project.delete({
      where: { id: projectIdNum },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] Failed to delete project', error)
    return NextResponse.json({ error: 'Erro ao deletar projeto' }, { status: 500 })
  }
}
