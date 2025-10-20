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
  { params }: { params: Promise<{ projectId: string; elementId: string }> },
) {
  const { projectId, elementId } = await params
  const projectIdNum = Number(projectId)
  const elementIdNum = Number(elementId)
  const { userId, orgId, orgRole } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!projectIdNum || !elementIdNum) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const element = await db.element.findFirst({
    where: { id: elementIdNum },
    include: { Project: true },
  })

  if (!element || element.projectId !== projectIdNum) {
    return NextResponse.json({ error: 'Elemento não encontrado' }, { status: 404 })
  }

  // Verificar acesso ao projeto considerando organizações
  const project = await fetchProjectWithShares(projectIdNum)
  if (!hasProjectWriteAccess(project, { userId, orgId, orgRole })) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (token) {
    try {
      await del(element.fileUrl, { token })
    } catch (error) {
      console.warn('[elements] Falha ao remover blob', error)
    }
  }

  await db.element.delete({ where: { id: elementIdNum } })

  return NextResponse.json({ success: true })
}
