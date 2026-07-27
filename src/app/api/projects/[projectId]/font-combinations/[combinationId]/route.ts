/**
 * Atualização e remoção de uma combinação tipográfica do projeto.
 *
 * Editar um modelo base não afeta os outros projetos: cada um tem a sua cópia,
 * semeada no primeiro acesso.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { criarSchema } from '@/lib/font-combinations-schema'

const atualizarSchema = criarSchema.partial().extend({
  order: z.number().int().min(0).optional(),
})

async function autorizar(projectId: number, combinationId: string) {
  const { userId, orgId } = await auth()
  if (!userId) return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }

  const project = await fetchProjectWithShares(projectId)
  if (!project) return { erro: NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 }) }
  if (!hasProjectWriteAccess(project, { userId, orgId })) {
    return { erro: NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  }

  // Garante que a combinação pertence a este projeto — sem isso, o id na URL
  // permitiria editar a combinação de outro cliente
  const combinacao = await db.fontCombination.findUnique({ where: { id: combinationId } })
  if (!combinacao || combinacao.projectId !== projectId) {
    return { erro: NextResponse.json({ error: 'Combinação não encontrada' }, { status: 404 }) }
  }

  return { combinacao }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; combinationId: string }> }
) {
  try {
    const { projectId: rawId, combinationId } = await params
    const projectId = Number(rawId)
    if (!projectId) return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })

    const { erro } = await autorizar(projectId, combinationId)
    if (erro) return erro

    const dados = atualizarSchema.parse(await req.json())

    const atualizada = await db.fontCombination.update({
      where: { id: combinationId },
      data: {
        ...(dados.name !== undefined ? { name: dados.name } : {}),
        ...(dados.elements !== undefined ? { elements: dados.elements as never } : {}),
        ...(dados.order !== undefined ? { order: dados.order } : {}),
      },
    })

    return NextResponse.json(atualizada)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    console.error('[FontCombinations] erro ao atualizar:', error)
    return NextResponse.json({ error: 'Erro ao salvar combinação' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; combinationId: string }> }
) {
  try {
    const { projectId: rawId, combinationId } = await params
    const projectId = Number(rawId)
    if (!projectId) return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })

    const { erro } = await autorizar(projectId, combinationId)
    if (erro) return erro

    await db.fontCombination.delete({ where: { id: combinationId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[FontCombinations] erro ao remover:', error)
    return NextResponse.json({ error: 'Erro ao remover combinação' }, { status: 500 })
  }
}
