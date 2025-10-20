import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  fetchProjectWithShares,
  hasProjectWriteAccess,
} from '@/lib/projects/access'

export const runtime = 'nodejs'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; colorId: string }> },
) {
  const { projectId, colorId } = await params
  const projectIdNum = Number(projectId)
  const colorIdNum = Number(colorId)
  const { userId, orgId, orgRole } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (!projectIdNum || !colorIdNum) {
    return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 })
  }

  // Verificar acesso ao projeto considerando organizações
  const project = await fetchProjectWithShares(projectIdNum)
  if (!hasProjectWriteAccess(project, { userId, orgId, orgRole })) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  const color = await db.brandColor.findFirst({
    where: { id: colorIdNum, projectId: projectIdNum },
  })

  if (!color) {
    return NextResponse.json({ error: 'Cor não encontrada' }, { status: 404 })
  }

  await db.brandColor.delete({ where: { id: colorIdNum } })

  return NextResponse.json({ success: true })
}
