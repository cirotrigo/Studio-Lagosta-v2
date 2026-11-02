import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { del } from '@vercel/blob'
import { db } from '@/lib/db'
import {
  fetchProjectWithShares,
  hasProjectWriteAccess,
} from '@/lib/projects/access'

export const runtime = 'nodejs'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string; logoId: string }> },
) {
  const { projectId, logoId } = await params
  const projectIdNum = Number(projectId)
  const logoIdNum = Number(logoId)
  const { userId, orgId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!projectIdNum || !logoIdNum) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const logo = await db.logo.findFirst({
    where: { id: logoIdNum },
    include: { Project: true },
  })

  if (!logo || logo.projectId !== projectIdNum) {
    return NextResponse.json({ error: 'Logo não encontrado' }, { status: 404 })
  }

  // Verificar acesso ao projeto considerando organizações
  const project = await fetchProjectWithShares(projectIdNum)
  if (!hasProjectWriteAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const body = await req.json()
  const { isProjectLogo } = body

  if (typeof isProjectLogo !== 'boolean') {
    return NextResponse.json({ error: 'Campo isProjectLogo inválido' }, { status: 400 })
  }

  // Várias logos podem ser principais (02/11/2026): o compositor autoriza como VARIANTES da marca a logo da página de
  // assinatura mais todas as linhas `isProjectLogo` (CP3, `variantesAutorizadasDaLogo`) e escolhe a que lê sobre a
  // foto — a dourada, a branca, a azul. Até aqui marcar uma desmarcava as outras, e o compositor nunca tinha mais de
  // duas candidatas (foto clara recusava com LOGO_SEM_VARIANTE_LEGIVEL). Quem precisa de UMA logo (lista de projetos,
  // agenda, ferramentas) já pega a primeira por id (`take: 1`).
  const updatedLogo = await db.logo.update({
    where: { id: logoIdNum },
    data: { isProjectLogo },
  })

  return NextResponse.json(updatedLogo)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; logoId: string }> },
) {
  const { projectId, logoId } = await params
  const projectIdNum = Number(projectId)
  const logoIdNum = Number(logoId)
  const { userId, orgId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!projectIdNum || !logoIdNum) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const logo = await db.logo.findFirst({
    where: { id: logoIdNum },
    include: { Project: true },
  })

  if (!logo || logo.projectId !== projectIdNum) {
    return NextResponse.json({ error: 'Logo não encontrado' }, { status: 404 })
  }

  // Verificar acesso ao projeto considerando organizações
  const project = await fetchProjectWithShares(projectIdNum)
  if (!hasProjectWriteAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (token) {
    try {
      await del(logo.fileUrl, { token })
    } catch (error) {
      console.warn('[logos] Falha ao remover blob', error)
    }
  }

  await db.logo.delete({ where: { id: logoIdNum } })

  return NextResponse.json({ success: true })
}
