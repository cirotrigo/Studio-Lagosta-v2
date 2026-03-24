import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { updateTemplateSchema } from '@/lib/validations/studio'
import type { Prisma } from '@/lib/prisma-types'
import { hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'
import { PostStatus, RenderStatus } from '../../../../../prisma/generated/client'

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

    // Log payload for debugging sync issues
    console.log('[API] Template update payload:', {
      name: payload?.name,
      hasDesignData: !!payload?.designData,
      canvas: payload?.designData?.canvas,
      pagesCount: payload?.designData?.pages?.length,
      localId: payload?.localId,
    })

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
    if (parsed.localId !== undefined) {
      data.localId = parsed.localId
    }

    // Use transaction to update template and pages together
    const updated = await db.$transaction(async (tx) => {
      const updatedTemplate = await tx.template.update({
        where: { id: templateId },
        data,
      })

      // If designData.pages is provided, update the Page records
      const designData = parsed.designData as { pages?: Array<{ id?: string; name?: string; width?: number; height?: number; layers?: unknown; background?: string; order?: number; thumbnail?: string | null; tags?: string[] }> } | undefined
      if (designData?.pages && Array.isArray(designData.pages)) {
        // Get existing pages to know which to update vs delete.
        // Desktop sync can send page IDs that belong to another template; in that case
        // fall back to matching the current template page by order/name.
        const existingPages = await tx.page.findMany({
          where: { templateId },
          select: { id: true, name: true, order: true },
        })
        const existingPageIds = new Set(existingPages.map((p) => p.id))
        const incomingPageIds = Array.from(
          new Set(designData.pages.map((p) => p.id).filter((pageId): pageId is string => typeof pageId === 'string' && pageId.length > 0))
        )
        const foreignPages = incomingPageIds.length > 0
          ? await tx.page.findMany({
              where: {
                id: { in: incomingPageIds },
                templateId: { not: templateId },
              },
              select: { id: true, templateId: true },
            })
          : []
        const foreignPageIds = new Set(foreignPages.map((page) => page.id))
        const matchedExistingPageIds = new Set<string>()
        const resolvedCurrentPageIds = new Set<string>()

        const findFallbackPage = (page: { name?: string; order?: number }) => {
          const byOrder = existingPages.find((existingPage) => (
            !matchedExistingPageIds.has(existingPage.id) &&
            existingPage.order === (page.order ?? 0)
          ))
          if (byOrder) return byOrder

          const byName = existingPages.find((existingPage) => (
            !matchedExistingPageIds.has(existingPage.id) &&
            existingPage.name === (page.name ?? '')
          ))
          if (byName) return byName

          return undefined
        }

        // Upsert pages - update if exists, create with provided ID if not
        for (let i = 0; i < designData.pages.length; i++) {
          const page = designData.pages[i]
          const requestedPageId = page.id
          const pageData = {
            name: page.name ?? `Página ${i + 1}`,
            width: page.width ?? 1080,
            height: page.height ?? 1920,
            layers: typeof page.layers === 'string' ? page.layers : JSON.stringify(page.layers ?? []),
            background: page.background ?? '#ffffff',
            order: page.order ?? i,
            thumbnail: page.thumbnail ?? null,
            tags: Array.isArray(page.tags) ? page.tags : [],
          }

          if (requestedPageId && existingPageIds.has(requestedPageId)) {
            await tx.page.update({
              where: { id: requestedPageId },
              data: pageData,
            })
            matchedExistingPageIds.add(requestedPageId)
            resolvedCurrentPageIds.add(requestedPageId)
          } else {
            const fallbackPage = findFallbackPage(page)
            const hasForeignIdConflict = requestedPageId ? foreignPageIds.has(requestedPageId) : false

            if (fallbackPage) {
              await tx.page.update({
                where: { id: fallbackPage.id },
                data: pageData,
              })
              matchedExistingPageIds.add(fallbackPage.id)
              resolvedCurrentPageIds.add(fallbackPage.id)
            } else {
              await tx.page.create({
                data: {
                  id: hasForeignIdConflict ? crypto.randomUUID() : (requestedPageId ?? crypto.randomUUID()),
                  ...pageData,
                  templateId,
                },
              })
            }
          }
        }

        const pagesToDelete = existingPages
          .map((page) => page.id)
          .filter((pageId) => !resolvedCurrentPageIds.has(pageId))

        if (pagesToDelete.length > 0) {
          await tx.page.deleteMany({
            where: { id: { in: pagesToDelete } },
          })
        }
      }

      // Invalidate rendered images for scheduled posts that reference this template
      const now = new Date()
      const affectedPosts = await tx.socialPost.findMany({
        where: {
          templateId,
          status: PostStatus.SCHEDULED,
          renderStatus: { in: [RenderStatus.RENDERED, RenderStatus.PENDING, RenderStatus.RENDERING] },
          pageId: { not: null },
        },
        select: {
          id: true,
          scheduledDatetime: true,
        },
      })

      if (affectedPosts.length > 0) {
        for (const post of affectedPosts) {
          await tx.socialPost.update({
            where: { id: post.id },
            data: {
              renderStatus: RenderStatus.PENDING,
              renderedImageUrl: null,
              renderedAt: null,
              renderAttempts: 0,
              renderError: null,
              nextRenderAt: new Date(), // Re-render immediately for fresh preview
            },
          })
        }
        console.log(`[API] Invalidated renders for ${affectedPosts.length} scheduled posts`)
      }

      return updatedTemplate
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[API] Failed to update template:', error)

    // Se for erro do Zod, retornar detalhes
    if (error && typeof error === 'object' && 'issues' in error) {
      const zodError = error as { issues: Array<{ path: string[]; message: string }> }
      console.error('[API] Validation errors:', JSON.stringify(zodError.issues, null, 2))
      return NextResponse.json({
        error: 'Dados inválidos',
        details: zodError.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      }, { status: 400 })
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[API] Non-Zod error:', errorMessage)
    return NextResponse.json(
      { error: 'Dados inválidos', details: errorMessage },
      { status: 400 }
    )
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
