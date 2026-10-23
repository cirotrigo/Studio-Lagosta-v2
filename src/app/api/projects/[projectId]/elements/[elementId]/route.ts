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
  { params }: { params: Promise<{ projectId: string; elementId: string }> },
) {
  const { projectId, elementId } = await params
  const projectIdNum = Number(projectId)
  const elementIdNum = Number(elementId)
  const { userId, orgId } = await auth()

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
  if (!hasProjectWriteAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  // D6 (b), CP-V2e: apaga só a entrada da biblioteca. O arquivo no Blob FICA: as artes copiam a `fileUrl` para as
  // camadas (sem referência por id), e apagá-lo quebraria editor e render no servidor de toda arte que o usa.
  // Arquivos órfãos ficam para uma limpeza futura com conferência de uso (D6 c).
  await db.element.delete({ where: { id: elementIdNum } })

  return NextResponse.json({ success: true })
}
