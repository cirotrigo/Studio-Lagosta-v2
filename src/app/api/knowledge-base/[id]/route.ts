import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const runtime = 'nodejs'

const updateEntrySchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params

  let organizationId: string | null = null

  if (orgId) {
    const organization = await db.organization.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    })

    organizationId = organization?.id ?? null
  }

  const entry = await db.knowledgeBaseEntry.findUnique({
    where: { id },
  })

  if (!entry) {
    return NextResponse.json(
      { error: 'Entrada não encontrada' },
      { status: 404 }
    )
  }

  const canAccessPersonal = entry.workspaceId == null && entry.userId === userId
  const canAccessOrganization =
    entry.workspaceId != null && organizationId != null && entry.workspaceId === organizationId

  if (!canAccessPersonal && !canAccessOrganization) {
    return NextResponse.json(
      { error: 'Entrada não encontrada' },
      { status: 404 }
    )
  }

  return NextResponse.json(entry)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params

  try {
    // Verificar ownership
    let organizationId: string | null = null

    if (orgId) {
      const organization = await db.organization.findUnique({
        where: { clerkOrgId: orgId },
        select: { id: true },
      })

      organizationId = organization?.id ?? null
    }

    const existing = await db.knowledgeBaseEntry.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Entrada não encontrada' },
        { status: 404 }
      )
    }

    const canEditPersonal = existing.workspaceId == null && existing.userId === userId
    const canEditOrganization =
      existing.workspaceId != null &&
      organizationId != null &&
      existing.workspaceId === organizationId

    if (!canEditPersonal && !canEditOrganization) {
      return NextResponse.json(
        { error: 'Entrada não encontrada' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const data = updateEntrySchema.parse(body)

    const updated = await db.knowledgeBaseEntry.update({
      where: { id },
      data,
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      )
    }
    console.error('[knowledge-base] Failed to update entry', error)
    return NextResponse.json(
      { error: 'Erro ao atualizar entrada' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params

  // Verificar ownership
  let organizationId: string | null = null

  if (orgId) {
    const organization = await db.organization.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    })

    organizationId = organization?.id ?? null
  }

  const existing = await db.knowledgeBaseEntry.findUnique({
    where: { id },
  })

  if (!existing) {
    return NextResponse.json(
      { error: 'Entrada não encontrada' },
      { status: 404 }
    )
  }

  const canDeletePersonal = existing.workspaceId == null && existing.userId === userId
  const canDeleteOrganization =
    existing.workspaceId != null &&
    organizationId != null &&
    existing.workspaceId === organizationId

  if (!canDeletePersonal && !canDeleteOrganization) {
    return NextResponse.json(
      { error: 'Entrada não encontrada' },
      { status: 404 }
    )
  }

  await db.knowledgeBaseEntry.delete({
    where: { id },
  })

  return NextResponse.json({ success: true })
}
