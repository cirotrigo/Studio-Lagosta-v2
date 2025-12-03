import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { ensureOrganizationExists } from '@/lib/organizations'

const updatePromptSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').optional(),
  content: z.string().min(1, 'Conteúdo é obrigatório').optional(),
  category: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
})

// GET - Buscar um prompt específico
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ promptId: string }> }
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { promptId } = await params

  try {
    let organizationId: string | null = null

    if (orgId) {
      const organization = await ensureOrganizationExists(orgId)
      organizationId = organization?.id ?? null
    }

    const prompt = await db.prompt.findUnique({
      where: { id: promptId },
    })

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt não encontrado' }, { status: 404 })
    }

    const canAccessPersonal = !prompt.organizationId && prompt.userId === userId
    const canAccessOrganization =
      prompt.organizationId != null &&
      organizationId != null &&
      prompt.organizationId === organizationId

    if (!canAccessPersonal && !canAccessOrganization) {
      return NextResponse.json({ error: 'Prompt não encontrado' }, { status: 404 })
    }

    return NextResponse.json(prompt)
  } catch (error) {
    console.error('[GET /api/prompts/[promptId]] Error:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar prompt' },
      { status: 500 }
    )
  }
}

// PATCH - Atualizar um prompt
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ promptId: string }> }
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { promptId } = await params

  try {
    let organizationId: string | null = null

    if (orgId) {
      const organization = await ensureOrganizationExists(orgId)
      organizationId = organization?.id ?? null
    }

    const existingPrompt = await db.prompt.findUnique({
      where: { id: promptId },
    })

    if (!existingPrompt) {
      return NextResponse.json({ error: 'Prompt não encontrado' }, { status: 404 })
    }

    const canEditPersonal = !existingPrompt.organizationId && existingPrompt.userId === userId
    const canEditOrganization =
      existingPrompt.organizationId != null &&
      organizationId != null &&
      existingPrompt.organizationId === organizationId

    if (!canEditPersonal && !canEditOrganization) {
      return NextResponse.json({ error: 'Prompt não encontrado' }, { status: 404 })
    }

    const body = await req.json()
    const validatedData = updatePromptSchema.parse(body)

    const updatedPrompt = await db.prompt.update({
      where: { id: promptId },
      data: validatedData,
    })

    return NextResponse.json(updatedPrompt)
  } catch (error) {
    console.error('[PATCH /api/prompts/[promptId]] Error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Erro ao atualizar prompt' },
      { status: 500 }
    )
  }
}

// DELETE - Deletar um prompt
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ promptId: string }> }
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { promptId } = await params

  try {
    let organizationId: string | null = null

    if (orgId) {
      const organization = await ensureOrganizationExists(orgId)
      organizationId = organization?.id ?? null
    }

    const existingPrompt = await db.prompt.findUnique({
      where: { id: promptId },
    })

    if (!existingPrompt) {
      return NextResponse.json({ error: 'Prompt não encontrado' }, { status: 404 })
    }

    const canDeletePersonal = !existingPrompt.organizationId && existingPrompt.userId === userId
    const canDeleteOrganization =
      existingPrompt.organizationId != null &&
      organizationId != null &&
      existingPrompt.organizationId === organizationId

    if (!canDeletePersonal && !canDeleteOrganization) {
      return NextResponse.json({ error: 'Prompt não encontrado' }, { status: 404 })
    }

    await db.prompt.delete({
      where: { id: promptId },
    })

    return NextResponse.json({ success: true, message: 'Prompt deletado com sucesso' })
  } catch (error) {
    console.error('[DELETE /api/prompts/[promptId]] Error:', error)
    return NextResponse.json(
      { error: 'Erro ao deletar prompt' },
      { status: 500 }
    )
  }
}
