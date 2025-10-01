import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { createGenerationSchema } from '@/lib/validations/studio'
import { renderGeneration } from '@/lib/generation-utils'
import { googleDriveService } from '@/server/google-drive-service'
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 60 // 60 segundos para renderização

export async function GET(
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

    // Query params para paginação
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '18')
    const skip = (page - 1) * pageSize

    // Buscar gerações do projeto
    const [generations, total] = await Promise.all([
      db.generation.findMany({
        where: { projectId: projectIdNum },
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
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      db.generation.count({ where: { projectId: projectIdNum } }),
    ])

    return NextResponse.json({
      generations,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('[API] Failed to list generations:', error)
    return NextResponse.json({ error: 'Erro ao buscar criativos' }, { status: 500 })
  }
}

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
    const validated = createGenerationSchema.parse(payload)

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

    // Criar generation com status PROCESSING
    const generation = await db.generation.create({
      data: {
        projectId: projectIdNum,
        templateId: validated.templateId,
        fieldValues: validated.fieldValues,
        status: 'PROCESSING',
        createdBy: userId,
        projectName: project.name,
        templateName: template.name,
      },
      include: {
        template: true,
      },
    })

    // Renderizar criativo
    try {
      console.log('[API] Starting renderGeneration for generation:', generation.id)
      const renderResult = await renderGeneration(generation)
      console.log('✅ Upload Vercel concluído:', renderResult.url)

      // Atualizar com resultado primário (Vercel Blob)
      const completed = await db.generation.update({
        where: { id: generation.id },
        data: {
          status: 'COMPLETED',
          resultUrl: renderResult.url,
          googleDriveFileId: null,
          googleDriveBackupUrl: null,
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

      const driveFolderId = project.googleDriveFolderId
      if (driveFolderId && googleDriveService.isEnabled()) {
        void (async () => {
          try {
            console.log('[API] Iniciando backup no Google Drive para geração', generation.id)
            const backup = await googleDriveService.uploadCreativeToArtesLagosta(
              renderResult.buffer,
              driveFolderId,
              project.name,
            )
            await db.generation.update({
              where: { id: generation.id },
              data: {
                googleDriveFileId: backup.fileId,
                googleDriveBackupUrl: backup.publicUrl,
              },
            })
            console.log('✅ Backup Drive concluído:', backup.fileId)
          } catch (backupError) {
            console.warn('⚠️ Backup Drive falhou:', backupError)
          }
        })()
      } else {
        console.log('[API] Backup Drive ignorado: sem pasta configurada ou serviço desativado')
      }

      return NextResponse.json(completed, { status: 201 })
    } catch (renderError) {
      console.error('[API] Failed to render generation:', renderError)

      // Atualizar status para FAILED
      await db.generation.update({
        where: { id: generation.id },
        data: { status: 'FAILED' },
      })

      // Mensagem de erro mais específica
      let errorMessage = 'Erro ao renderizar criativo'
      let errorDetails = String(renderError)

      if (renderError instanceof Error) {
        if (renderError.message.includes('BLOB_READ_WRITE_TOKEN')) {
          errorMessage = 'Token do Vercel Blob não configurado'
          errorDetails = 'Por favor, configure BLOB_READ_WRITE_TOKEN no arquivo .env.local. Veja SETUP-BLOB.md para instruções.'
        } else if (renderError.message.includes('canvas')) {
          errorMessage = 'Erro no canvas renderer'
          errorDetails = `Problema ao renderizar a imagem: ${renderError.message}`
        } else {
          errorDetails = renderError.message
        }
      }

      return NextResponse.json(
        { error: errorMessage, details: errorDetails },
        { status: 500 },
      )
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Limite de requisições atingido' },
        { status: 429, headers: { 'Retry-After': String(error.retryAfter) } },
      )
    }

    console.error('[API] Failed to create generation:', error)

    if (error instanceof Error && 'issues' in error) {
      return NextResponse.json({ error: 'Dados inválidos', details: error }, { status: 400 })
    }

    return NextResponse.json({ error: 'Erro ao criar criativo' }, { status: 500 })
  }
}
