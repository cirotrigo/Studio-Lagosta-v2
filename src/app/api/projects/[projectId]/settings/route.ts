import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { updateProjectSettingsSchema } from '@/lib/validations/studio'

export const runtime = 'nodejs'

export async function PATCH(
  request: Request,
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

    const project = await db.project.findFirst({
      where: { id: projectIdNum, userId },
      select: { id: true },
    })

    if (!project) {
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

    const dataToUpdate: { googleDriveFolderId: string | null; googleDriveFolderName: string | null } = {
      googleDriveFolderId: null,
      googleDriveFolderName: null,
    }

    if (parsed.data.googleDriveFolderId !== undefined) {
      dataToUpdate.googleDriveFolderId = parsed.data.googleDriveFolderId
    }
    if (parsed.data.googleDriveFolderName !== undefined) {
      dataToUpdate.googleDriveFolderName = parsed.data.googleDriveFolderName
    }

    const updated = await db.project.update({
      where: { id: projectIdNum },
      data: dataToUpdate,
      select: {
        id: true,
        name: true,
        googleDriveFolderId: true,
        googleDriveFolderName: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[API] Failed to update project settings', error)
    return NextResponse.json({ error: 'Erro ao atualizar configurações do projeto' }, { status: 500 })
  }
}
