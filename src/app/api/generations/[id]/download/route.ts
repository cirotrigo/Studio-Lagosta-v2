import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
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

    // Verificar ownership
    if (generation.Project.userId !== userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    // Verificar se geração está completa
    if (generation.status !== 'COMPLETED' || !generation.resultUrl) {
      return NextResponse.json(
        { error: 'Criativo ainda não está pronto' },
        { status: 400 },
      )
    }

    // Redirecionar para URL da imagem
    // O Vercel Blob já serve os arquivos publicamente
    return NextResponse.redirect(generation.resultUrl)
  } catch (error) {
    console.error('[API] Failed to download generation:', error)
    return NextResponse.json({ error: 'Erro ao fazer download' }, { status: 500 })
  }
}
