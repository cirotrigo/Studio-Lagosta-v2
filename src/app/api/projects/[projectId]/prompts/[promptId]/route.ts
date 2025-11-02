import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  fetchProjectWithShares,
  hasProjectWriteAccess,
} from '@/lib/projects/access'

// DELETE - Deletar um prompt
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; promptId: string }> }
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { projectId, promptId } = await params
  const projectIdNum = Number(projectId);

  if (!projectIdNum) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }

  try {
    // Verificar acesso ao projeto considerando organizações
    const project = await fetchProjectWithShares(projectIdNum)
    if (!hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    // Verificar se o prompt existe e pertence ao projeto
    const prompt = await db.promptLibrary.findFirst({
      where: {
        id: promptId,
        projectId: projectIdNum,
      },
    })

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt não encontrado' }, { status: 404 })
    }

    // Deletar o prompt
    await db.promptLibrary.delete({
      where: { id: promptId },
    })

    return NextResponse.json({ success: true, message: 'Prompt deletado com sucesso' })
  } catch (error) {
    console.error('[DELETE /prompts/[promptId]] Error:', error)
    return NextResponse.json(
      { error: 'Erro ao deletar prompt' },
      { status: 500 }
    )
  }
}
