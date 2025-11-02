import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  fetchProjectWithShares,
  hasProjectReadAccess,
  hasProjectWriteAccess,
} from '@/lib/projects/access'

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
      include: {
        Project: {
          select: {
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

    if (!hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    // Deletar geração
    await db.generation.delete({
      where: { id },
    })

    // TODO: Deletar arquivo do Vercel Blob também
    // if (generation.resultUrl) {
    //   await del(generation.resultUrl)
    // }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] Failed to delete generation:', error)
    return NextResponse.json({ error: 'Erro ao deletar criativo' }, { status: 500 })
  }
}
