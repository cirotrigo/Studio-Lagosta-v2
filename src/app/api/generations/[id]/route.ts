import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { del } from '@vercel/blob'
import { db } from '@/lib/db'
import {
  fetchProjectWithShares,
  hasProjectReadAccess,
  hasProjectWriteAccess,
} from '@/lib/projects/access'
import { extractBlobPathname } from '@/lib/cleanup/blob-cleanup'
import { definirReferenciaDeEstilo } from '@/lib/ai/style-references'
import { googleDriveService } from '@/server/google-drive-service'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await params

    // Buscar geração com verificação de ownership
    const generation = await db.generation.findFirst({
      where: { id },
      include: {
        Template: {
          select: {
            id: true,
            name: true,
            type: true,
            dimensions: true,
            designData: true,
          },
        },
        Project: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
      },
    })

    if (!generation) {
      return NextResponse.json({ error: 'Criativo não encontrado' }, { status: 404 })
    }

    // Verificar acesso ao projeto considerando organizações
    const project = await fetchProjectWithShares(generation.projectId)

    if (!hasProjectReadAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    return NextResponse.json(generation)
  } catch (error) {
    console.error('[API] Failed to get generation:', error)
    return NextResponse.json({ error: 'Erro ao buscar criativo' }, { status: 500 })
  }
}

/**
 * PATCH — hoje só a marca de REFERÊNCIA DE ESTILO ("gostei desta arte").
 *
 * Arte marcada entra no rodízio que a geração usa como referência de papel
 * `style`: uma por peça, sempre a menos usada. Ver `style-references.ts`.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { id } = await params
    const body = (await req.json().catch(() => ({}))) as { styleRef?: unknown }
    if (typeof body.styleRef !== 'boolean') {
      return NextResponse.json({ error: 'Envie styleRef: true|false' }, { status: 400 })
    }

    const generation = await db.generation.findFirst({
      where: { id },
      select: { id: true, projectId: true },
    })
    if (!generation) {
      return NextResponse.json({ error: 'Criativo não encontrado' }, { status: 404 })
    }

    const project = await fetchProjectWithShares(generation.projectId)
    if (!hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const result = await definirReferenciaDeEstilo(id, body.styleRef)
    return NextResponse.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro ao marcar a referência'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await params

    // Buscar geração com verificação de ownership
    const generation = await db.generation.findFirst({
      where: { id },
      select: {
        id: true,
        projectId: true,
        resultUrl: true,
        fileName: true,
        googleDriveFileId: true,
        googleDriveBackupUrl: true,
      },
    })

    if (!generation) {
      return NextResponse.json({ error: 'Criativo não encontrado' }, { status: 404 })
    }

    // Verificar acesso ao projeto considerando organizações
    const project = await fetchProjectWithShares(generation.projectId)

    if (!hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    // Limpar Drive primeiro (mais visível pro usuário se falhar)
    if (generation.googleDriveFileId && googleDriveService.isEnabled()) {
      try {
        await googleDriveService.deleteFiles([generation.googleDriveFileId])
      } catch (driveError) {
        console.warn(`[DELETE generation ${id}] Failed to delete Drive file:`, driveError)
      }
    }

    // Limpar blob do Vercel
    const pathname = generation.fileName ?? extractBlobPathname(generation.resultUrl)
    if (pathname) {
      try {
        await del(pathname)
      } catch (blobError) {
        console.warn(`[DELETE generation ${id}] Failed to delete blob:`, blobError)
      }
    }

    // Deletar geração do banco por último
    await db.generation.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] Failed to delete generation:', error)
    return NextResponse.json({ error: 'Erro ao deletar criativo' }, { status: 500 })
  }
}
