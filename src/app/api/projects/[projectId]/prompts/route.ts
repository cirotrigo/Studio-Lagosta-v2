import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'

// GET - Buscar todos os prompts do projeto
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { projectId } = await params
  const projectIdNum = Number(projectId);

  if (!projectIdNum) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }

  try {
    // Verificar se o projeto pertence ao usuário
    const project = await fetchProjectWithShares(projectIdNum);

    if (!project || !hasProjectReadAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    // Buscar prompts do projeto
    const prompts = await db.promptLibrary.findMany({
      where: { projectId: projectIdNum },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(prompts)
  } catch (error) {
    console.error('[GET /prompts] Error:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar prompts' },
      { status: 500 }
    )
  }
}

// POST - Criar novo prompt
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { projectId } = await params
  const projectIdNum = Number(projectId);

  if (!projectIdNum) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }

  try {
    // Verificar se o projeto pertence ao usuário
    const project = await fetchProjectWithShares(projectIdNum);

    if (!project || !hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    const body = await req.json()
    const { title, prompt, category } = body

    if (!title || !prompt) {
      return NextResponse.json(
        { error: 'Título e prompt são obrigatórios' },
        { status: 400 }
      )
    }

    // Criar prompt
    const newPrompt = await db.promptLibrary.create({
      data: {
        title,
        prompt,
        category,
        projectId: projectIdNum,
        createdBy: userId,
      },
    })

    return NextResponse.json(newPrompt, { status: 201 })
  } catch (error) {
    console.error('[POST /prompts] Error:', error)
    return NextResponse.json(
      { error: 'Erro ao criar prompt' },
      { status: 500 }
    )
  }
}
