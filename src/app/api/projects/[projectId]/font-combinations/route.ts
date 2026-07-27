/**
 * Combinações tipográficas de um projeto.
 *
 * No primeiro acesso, os modelos base do catálogo são copiados para o projeto,
 * de modo que cada marca ajuste os seus sem afetar as outras.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'
import { FONT_COMBO_LAYOUTS } from '@/lib/font-combinations'
import { criarSchema } from '@/lib/font-combinations-schema'

async function autorizar(projectId: number, escrita = false) {
  const { userId, orgId } = await auth()
  if (!userId) return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }

  const project = await fetchProjectWithShares(projectId)
  if (!project) return { erro: NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 }) }

  const permitido = escrita
    ? hasProjectWriteAccess(project, { userId, orgId })
    : hasProjectReadAccess(project, { userId, orgId })
  if (!permitido) return { erro: NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  return { project }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const projectId = Number((await params).projectId)
    if (!projectId) return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })

    const { erro } = await autorizar(projectId)
    if (erro) return erro

    let combinacoes = await db.fontCombination.findMany({
      where: { projectId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    })

    // Primeiro acesso: semeia o catálogo base neste projeto
    if (combinacoes.length === 0) {
      await db.fontCombination.createMany({
        data: FONT_COMBO_LAYOUTS.map((layout, index) => ({
          projectId,
          name: layout.name,
          order: index,
          elements: layout.elements as never,
          isDefault: true,
        })),
      })
      combinacoes = await db.fontCombination.findMany({
        where: { projectId },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      })
      console.log(`[FontCombinations] ${combinacoes.length} modelos semeados no projeto ${projectId}`)
    }

    return NextResponse.json(combinacoes)
  } catch (error) {
    console.error('[FontCombinations] erro ao listar:', error)
    return NextResponse.json({ error: 'Erro ao carregar combinações' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const projectId = Number((await params).projectId)
    if (!projectId) return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })

    const { erro } = await autorizar(projectId, true)
    if (erro) return erro

    const dados = criarSchema.parse(await req.json())

    const ultima = await db.fontCombination.findFirst({
      where: { projectId },
      orderBy: { order: 'desc' },
      select: { order: true },
    })

    const criada = await db.fontCombination.create({
      data: {
        projectId,
        name: dados.name,
        elements: dados.elements as never,
        order: (ultima?.order ?? -1) + 1,
        isDefault: false,
      },
    })

    return NextResponse.json(criada, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    console.error('[FontCombinations] erro ao criar:', error)
    return NextResponse.json({ error: 'Erro ao criar combinação' }, { status: 500 })
  }
}
