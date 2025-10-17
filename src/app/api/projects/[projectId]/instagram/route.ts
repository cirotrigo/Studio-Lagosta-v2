import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'

export const runtime = 'nodejs'

const updateInstagramSchema = z.object({
  instagramAccountId: z.string().trim().min(1).optional(),
  instagramUsername: z.string().trim().optional(),
  instagramProfileUrl: z.string().url().optional().or(z.literal('')),
})

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

    const parsed = updateInstagramSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const dataToUpdate: {
      instagramAccountId?: string
      instagramUsername?: string
      instagramProfileUrl?: string | null
    } = {}

    if (parsed.data.instagramAccountId !== undefined) {
      dataToUpdate.instagramAccountId = parsed.data.instagramAccountId
    }

    if (parsed.data.instagramUsername !== undefined) {
      dataToUpdate.instagramUsername = parsed.data.instagramUsername || null
    }

    if (parsed.data.instagramProfileUrl !== undefined) {
      dataToUpdate.instagramProfileUrl = parsed.data.instagramProfileUrl || null
    }

    const updated = await db.project.update({
      where: { id: projectIdNum },
      data: dataToUpdate,
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        logoUrl: true,
        instagramAccountId: true,
        instagramUsername: true,
        instagramProfileUrl: true,
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
    console.error('[API] Failed to update Instagram config', error)
    return NextResponse.json(
      { error: 'Erro ao atualizar configurações do Instagram' },
      { status: 500 }
    )
  }
}
