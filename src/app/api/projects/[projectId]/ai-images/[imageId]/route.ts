import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; imageId: string }> }
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { projectId, imageId } = await params
  const projectIdNum = Number(projectId)

  if (!projectIdNum) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }

  try {
    // Verificar se o projeto pertence ao usuário
    const project = await db.project.findFirst({
      where: { id: projectIdNum, userId },
    })

    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    // Verificar se a imagem existe e pertence ao projeto
    const image = await db.aIGeneratedImage.findFirst({
      where: {
        id: imageId,
        projectId: projectIdNum,
      },
    })

    if (!image) {
      return NextResponse.json({ error: 'Imagem não encontrada' }, { status: 404 })
    }

    // Deletar a imagem
    await db.aIGeneratedImage.delete({
      where: { id: imageId },
    })

    return NextResponse.json({ success: true, message: 'Imagem deletada com sucesso' })
  } catch (error) {
    console.error('[DELETE /ai-images/[imageId]] Error:', error)
    return NextResponse.json(
      { error: 'Erro ao deletar imagem' },
      { status: 500 }
    )
  }
}
