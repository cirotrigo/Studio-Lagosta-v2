import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { del } from '@vercel/blob'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; logoId: string }> },
) {
  const { projectId, logoId } = await params
  const projectIdNum = Number(projectId)
  const logoIdNum = Number(logoId)
  const { userId } = await auth()

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

  if (!logo || logo.Project.userId !== userId || logo.projectId !== projectIdNum) {
    return NextResponse.json({ error: 'Logo não encontrado' }, { status: 404 })
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
