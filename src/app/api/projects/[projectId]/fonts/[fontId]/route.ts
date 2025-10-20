import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { del } from '@vercel/blob'
import { db } from '@/lib/db'
import {
  fetchProjectWithShares,
  hasProjectWriteAccess,
} from '@/lib/projects/access'

export const runtime = 'nodejs'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; fontId: string }> },
) {
  const { projectId, fontId } = await params
  const projectIdNum = Number(projectId)
  const fontIdNum = Number(fontId)
  const { userId, orgId, orgRole } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!projectIdNum || !fontIdNum) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const font = await db.customFont.findFirst({
    where: { id: fontIdNum },
    include: { Project: true },
  })

  if (!font || font.projectId !== projectIdNum) {
    return NextResponse.json({ error: 'Fonte não encontrada' }, { status: 404 })
  }

  // Verificar acesso ao projeto considerando organizações
  const project = await fetchProjectWithShares(projectIdNum)
  if (!hasProjectWriteAccess(project, { userId, orgId, orgRole })) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (token) {
    try {
      await del(font.fileUrl, { token })
    } catch (error) {
      console.warn('[fonts] Falha ao remover blob', error)
    }
  }

  await db.customFont.delete({ where: { id: fontIdNum } })

  return NextResponse.json({ success: true })
}
