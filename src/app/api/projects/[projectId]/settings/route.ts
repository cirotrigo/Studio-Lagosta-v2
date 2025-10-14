import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { updateProjectSettingsSchema } from '@/lib/validations/studio'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'

export const runtime = 'nodejs'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { userId, orgId, orgRole } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { projectId } = await params
    const projectIdNum = Number(projectId)
    if (Number.isNaN(projectIdNum)) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }

    const project = await fetchProjectWithShares(projectIdNum)

    if (!project || !hasProjectWriteAccess(project, { userId, orgId, orgRole })) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    }

    const parsed = updateProjectSettingsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 })
    }

    const dataToUpdate: {
      googleDriveFolderId?: string | null
      googleDriveFolderName?: string | null
      googleDriveImagesFolderId?: string | null
      googleDriveImagesFolderName?: string | null
      googleDriveVideosFolderId?: string | null
      googleDriveVideosFolderName?: string | null
    } = {}

    const assignField = <K extends keyof typeof dataToUpdate>(key: K) => {
      if (Object.prototype.hasOwnProperty.call(parsed.data, key)) {
        dataToUpdate[key] = parsed.data[key]
      }
    }

    assignField('googleDriveFolderId')
    assignField('googleDriveFolderName')
    assignField('googleDriveImagesFolderId')
    assignField('googleDriveImagesFolderName')
    assignField('googleDriveVideosFolderId')
    assignField('googleDriveVideosFolderName')

    const updated = await db.project.update({
      where: { id: projectIdNum },
      data: dataToUpdate,
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
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[API] Failed to update project settings', error)
    return NextResponse.json({ error: 'Erro ao atualizar configurações do projeto' }, { status: 500 })
  }
}
