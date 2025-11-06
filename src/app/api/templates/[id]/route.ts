import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { updateTemplateSchema } from '@/lib/validations/studio'
import type { Prisma } from '@/lib/prisma-types'
import { hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const templateId = Number(id)
  if (!templateId) {
    return NextResponse.json({ error: 'Template inválido' }, { status: 400 })
  }

  const template = await db.template.findFirst({
    where: { id: templateId },
    include: {
      Project: {
        include: {
          organizationProjects: {
            include: {
              organization: {
                select: {
                  clerkOrgId: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!template) {
    return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
  }

  // Verificar se o usuário tem acesso ao projeto (dono ou membro de organização)
  if (!hasProjectReadAccess(template.Project, { userId, orgId })) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  // Remover dados do projeto antes de retornar o template
  const { Project: _Project, ...templateData } = template
  return NextResponse.json(templateData)
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params
  const templateId = Number(id)
  if (!templateId) {
    return NextResponse.json({ error: 'Template inválido' }, { status: 400 })
  }

  const existing = await db.template.findFirst({
    where: { id: templateId },
    include: {
      Project: {
        include: {
          organizationProjects: {
            include: {
              organization: {
                select: {
                  clerkOrgId: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
  }

  // Verificar se o usuário tem permissão de escrita no projeto
  if (!hasProjectWriteAccess(existing.Project, { userId, orgId })) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  try {
    const payload = await req.json()
    const parsed = updateTemplateSchema.parse(payload)

    const data: Prisma.TemplateUpdateInput = {}
    if (parsed.name !== undefined) data.name = parsed.name
    if (parsed.designData !== undefined) {
      data.designData = parsed.designData as unknown as Prisma.JsonValue
    }
    if (parsed.dynamicFields !== undefined) {
      data.dynamicFields = parsed.dynamicFields as unknown as Prisma.JsonValue
    }
    if (parsed.thumbnailUrl !== undefined) {
      data.thumbnailUrl = parsed.thumbnailUrl
    }

    const updated = await db.template.update({
      where: { id: templateId },
      data,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Failed to update template', error)
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params
  const templateId = Number(id)
  if (!templateId) {
    return NextResponse.json({ error: 'Template inválido' }, { status: 400 })
  }

  const existing = await db.template.findFirst({
    where: { id: templateId },
    include: {
      Project: {
        include: {
          organizationProjects: {
            include: {
              organization: {
                select: {
                  clerkOrgId: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
  }

  // Verificar se o usuário tem permissão de escrita no projeto
  if (!hasProjectWriteAccess(existing.Project, { userId, orgId })) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  try {
    // Primeiro, excluir todas as gerações relacionadas ao template
    await db.generation.deleteMany({
      where: { templateId: templateId },
    })

    // Depois, excluir o template (as páginas serão excluídas automaticamente via cascade)
    await db.template.delete({
      where: { id: templateId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete template', error)
    return NextResponse.json({ error: 'Erro ao deletar template' }, { status: 500 })
  }
}
