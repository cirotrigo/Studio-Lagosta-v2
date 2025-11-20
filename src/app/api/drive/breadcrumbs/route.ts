import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { googleDriveService } from '@/server/google-drive-service'
import { PermissionError, requireProjectAccess } from '@/lib/permissions'

const querySchema = z.object({
  folderId: z.string().trim().min(1),
  projectId: z.coerce.number().int().positive(),
})

export async function GET(req: Request) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!googleDriveService.isEnabled()) {
      return NextResponse.json({ error: 'Google Drive não configurado' }, { status: 503 })
    }

    const { searchParams } = new URL(req.url)
    const parsed = querySchema.safeParse({
      folderId: searchParams.get('folderId'),
      projectId: searchParams.get('projectId'),
    })

    if (!parsed.success) {
      return NextResponse.json({ error: 'Parâmetros inválidos', details: parsed.error.flatten() }, { status: 400 })
    }

    const { folderId, projectId } = parsed.data
    await requireProjectAccess(projectId, { userId, orgId })

    const breadcrumbs = await googleDriveService.getFolderBreadcrumbs(folderId)

    return NextResponse.json({ breadcrumbs })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('[Drive API] Failed to fetch breadcrumbs', error)
    return NextResponse.json({ error: 'Erro ao carregar breadcrumbs' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
