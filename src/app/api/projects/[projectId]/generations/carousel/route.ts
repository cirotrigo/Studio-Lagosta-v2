import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { createCarouselSchema } from '@/lib/validations/studio'
import { renderGeneration } from '@/lib/generation-utils'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutos para carrossel (múltiplos slides)

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { projectId } = await params
    const projectIdNum = parseInt(projectId)

    // Verificar ownership do projeto
    const project = await db.project.findFirst({
      where: { id: projectIdNum, userId },
    })

    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    // Validar payload
    const payload = await req.json()
    const validated = createCarouselSchema.parse(payload)

    // Verificar se template existe e pertence ao projeto
    const template = await db.template.findFirst({
      where: {
        id: validated.templateId,
        projectId: projectIdNum,
      },
    })

    if (!template) {
      return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
    }

    // Validar que é template FEED (apenas FEED suporta carrossel)
    if (template.type !== 'FEED') {
      return NextResponse.json(
        { error: 'Carrossel só é suportado para templates tipo FEED' },
        { status: 400 },
      )
    }

    // Criar generations para cada slide
    const slideCount = validated.slides.length
    const generations = await Promise.all(
      validated.slides.map((slide, index) =>
        db.generation.create({
          data: {
            projectId: projectIdNum,
            templateId: validated.templateId,
            fieldValues: slide.fieldValues,
            status: 'PROCESSING',
            createdBy: userId,
            projectName: project.name,
            templateName: template.name,
            // Adicionar metadata de carrossel
            authorName: `Slide ${index + 1}/${slideCount}`,
          },
          include: {
            template: true,
          },
        }),
      ),
    )

    // Renderizar cada slide
    const results = await Promise.allSettled(
      generations.map(async (gen) => {
        try {
          const resultUrl = await renderGeneration(gen)

          return await db.generation.update({
            where: { id: gen.id },
            data: {
              status: 'COMPLETED',
              resultUrl,
              completedAt: new Date(),
            },
            include: {
              template: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  dimensions: true,
                },
              },
            },
          })
        } catch (error) {
          console.error(`[API] Failed to render slide ${gen.id}:`, error)

          await db.generation.update({
            where: { id: gen.id },
            data: { status: 'FAILED' },
          })

          throw error
        }
      }),
    )

    // Processar resultados
    const completed = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map((r) => r.value)

    const failed = results.filter((r) => r.status === 'rejected').length

    if (completed.length === 0) {
      return NextResponse.json(
        { error: 'Falha ao renderizar todos os slides do carrossel' },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        generations: completed,
        summary: {
          total: slideCount,
          completed: completed.length,
          failed,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('[API] Failed to create carousel:', error)

    if (error instanceof Error && 'issues' in error) {
      return NextResponse.json({ error: 'Dados inválidos', details: error }, { status: 400 })
    }

    return NextResponse.json({ error: 'Erro ao criar carrossel' }, { status: 500 })
  }
}
