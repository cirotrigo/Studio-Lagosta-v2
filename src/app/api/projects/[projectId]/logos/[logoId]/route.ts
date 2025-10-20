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
  const { userId, orgId, orgRole } = await auth()

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
  if (!hasProjectWriteAccess(project, { userId, orgId, orgRole })) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const body = await req.json()
  const { isProjectLogo } = body

  if (typeof isProjectLogo !== 'boolean') {
    return NextResponse.json({ error: 'Campo isProjectLogo inválido' }, { status: 400 })
  }

  // Se está marcando como logo principal, desmarcar todos os outros logos do projeto
  if (isProjectLogo) {
    await db.logo.updateMany({
      where: { projectId: projectIdNum, id: { not: logoIdNum } },
      data: { isProjectLogo: false },
    })
  }

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
  const { userId, orgId, orgRole } = await auth()

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
  if (!hasProjectWriteAccess(project, { userId, orgId, orgRole })) {
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
