import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { createCarouselSchema } from '@/lib/validations/studio'
import { renderGeneration } from '@/lib/generation-utils'
import { googleDriveService } from '@/server/google-drive-service'
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit'

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

    assertRateLimit({ key: `generation:${userId}` })

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
            Template: true,
          },
        }),
      ),
    )

    // Renderizar cada slide
    type GenerationWithTemplate = Awaited<ReturnType<typeof db.generation.update>>;

    const results = await Promise.allSettled(
      generations.map(async (gen): Promise<GenerationWithTemplate> => {
        try {
          const renderResult = await renderGeneration(gen)

          const completed = await db.generation.update({
            where: { id: gen.id },
            data: {
              status: 'COMPLETED',
              resultUrl: renderResult.url,
              googleDriveFileId: null,
              googleDriveBackupUrl: null,
              completedAt: new Date(),
            },
            include: {
              Template: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  dimensions: true,
                },
              },
            },
          })

          if (project.googleDriveFolderId && googleDriveService.isEnabled()) {
            try {
              const backup = await googleDriveService.uploadCreativeToArtesLagosta(
                renderResult.buffer,
                project.googleDriveFolderId,
                project.name,
              )
              await db.generation.update({
                where: { id: gen.id },
                data: {
                  googleDriveFileId: backup.fileId,
                  googleDriveBackupUrl: backup.publicUrl,
                },
              })
              console.log('✅ Backup Drive concluído:', backup.fileId)
            } catch (backupError) {
              console.warn('⚠️ Backup Drive falhou (carrossel):', backupError)
            }
          }

          return completed
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
      .filter((r): r is PromiseFulfilledResult<GenerationWithTemplate> => r.status === 'fulfilled')
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
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Limite de requisições atingido' },
        { status: 429, headers: { 'Retry-After': String(error.retryAfter) } },
      )
    }

    console.error('[API] Failed to create carousel:', error)

    if (error instanceof Error && 'issues' in error) {
      return NextResponse.json({ error: 'Dados inválidos', details: error }, { status: 400 })
    }

    return NextResponse.json({ error: 'Erro ao criar carrossel' }, { status: 500 })
  }
}
