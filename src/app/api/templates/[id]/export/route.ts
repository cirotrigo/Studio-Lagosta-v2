import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { deductCreditsForFeature, validateCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'
import { put } from '@vercel/blob'
import { hasProjectWriteAccess } from '@/lib/projects/access'
import { googleDriveService } from '@/server/google-drive-service'

export const runtime = 'nodejs'

/**
 * POST /api/templates/[id]/export
 * Valida créditos, faz upload do blob e salva a geração no banco
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id: templateIdStr } = await params
    const templateId = parseInt(templateIdStr, 10)

    if (!templateId || isNaN(templateId)) {
      return NextResponse.json({ error: 'ID de template inválido' }, { status: 400 })
    }

    // Buscar template e verificar acesso (dono ou membro da organização)
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

    if (!hasProjectWriteAccess(template.Project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const body = await req.json()
    const { format, dataUrl, fileName } = body

    if (!dataUrl || !fileName) {
      return NextResponse.json(
        { error: 'dataUrl e fileName são obrigatórios' },
        { status: 400 }
      )
    }

    console.log('[TEMPLATE_EXPORT] Starting export for user:', userId, 'template:', templateId, 'format:', format)

    // Validar créditos disponíveis
    try {
      await validateCreditsForFeature(userId, 'creative_download', 1, {
        organizationId: orgId ?? undefined,
      })
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            error: 'Créditos insuficientes',
            required: error.required,
            available: error.available,
          },
          { status: 402 }
        )
      }
      throw error
    }

    // Converter dataURL para blob
    const base64Data = dataUrl.split(',')[1]
    const buffer = Buffer.from(base64Data, 'base64')
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'

    // Upload para Vercel Blob
    console.log('[TEMPLATE_EXPORT] Uploading to Vercel Blob...')
    const blob = await put(fileName, buffer, {
      access: 'public',
      contentType: mimeType,
    })

    console.log('[TEMPLATE_EXPORT] Uploaded successfully:', blob.url)

    // Deduzir créditos
    const creditResult = await deductCreditsForFeature({
      clerkUserId: userId,
      feature: 'creative_download',
      details: {
        templateId,
        format,
        exportType: 'konva_editor',
        fileName,
      },
      organizationId: orgId ?? undefined,
      projectId: template.Project.id,
    })

    console.log('[TEMPLATE_EXPORT] Credits deducted. Remaining:', creditResult.creditsRemaining)

    // Salvar geração no banco de dados
    const generation = await db.generation.create({
      data: {
        templateId: template.id,
        projectId: template.Project.id,
        status: 'COMPLETED',
        resultUrl: blob.url,
        fileName: fileName,
        fieldValues: {},
        templateName: template.name,
        projectName: template.Project.name,
        createdBy: userId,
        completedAt: new Date(),
      },
    })

    console.log('[TEMPLATE_EXPORT] Generation saved:', generation.id)

    // Backup automático para Google Drive (ARTES LAGOSTA)
    if (template.Project.googleDriveFolderId && googleDriveService.isEnabled()) {
      try {
        console.log('[TEMPLATE_EXPORT] Starting Google Drive backup...')
        const backup = await googleDriveService.uploadCreativeToArtesLagosta(
          buffer,
          template.Project.googleDriveFolderId,
          template.Project.name,
        )

        // Atualizar geração com informações do backup
        await db.generation.update({
          where: { id: generation.id },
          data: {
            googleDriveFileId: backup.fileId,
            googleDriveBackupUrl: backup.publicUrl,
          },
        })

        console.log('✅ Backup Drive concluído:', backup.fileId)
      } catch (backupError) {
        console.warn('⚠️ Backup Drive falhou (não afeta a geração):', backupError)
        // Não retornar erro - backup é opcional
      }
    } else {
      console.log('[TEMPLATE_EXPORT] Google Drive backup skipped (not configured or disabled)')
    }

    return NextResponse.json({
      success: true,
      creditsRemaining: creditResult.creditsRemaining,
      generation: {
        id: generation.id,
        resultUrl: generation.resultUrl,
      },
    })
  } catch (error) {
    console.error('[TEMPLATE_EXPORT] Failed to process export:', error)

    // Log detalhado do erro para debug
    if (error instanceof Error) {
      console.error('[TEMPLATE_EXPORT] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      })
    }

    return NextResponse.json(
      {
        error: 'Erro ao processar exportação',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
