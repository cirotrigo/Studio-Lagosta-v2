import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { deductCreditsForFeature, validateCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'
import { hasProjectWriteAccess } from '@/lib/projects/access'
import { googleDriveService } from '@/server/google-drive-service'
import {
  getKonvaProjectTemplateConfig,
  KONVA_PROJECT_EXPORT_CATEGORY,
  type KonvaProjectCreativeFormat,
} from '@/lib/konva-project-creatives'

export const runtime = 'nodejs'

const bodySchema = z.object({
  format: z.enum(['STORY', 'FEED_PORTRAIT', 'SQUARE']),
  dataUrl: z.string().min(1),
  fileName: z.string().min(1),
  pageId: z.string().min(1),
  pageName: z.string().min(1),
  documentId: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

type TemplateDescriptor = ReturnType<typeof getKonvaProjectTemplateConfig>

async function getOrCreateKonvaExportTemplate(args: {
  projectId: number
  createdBy: string
  format: KonvaProjectCreativeFormat
  width: number
  height: number
}) {
  const descriptor: TemplateDescriptor = getKonvaProjectTemplateConfig(args.format)

  const existing = await db.template.findFirst({
    where: {
      projectId: args.projectId,
      category: KONVA_PROJECT_EXPORT_CATEGORY,
      name: descriptor.templateName,
      dimensions: descriptor.dimensions,
    },
  })

  if (existing) {
    return existing
  }

  return await db.template.create({
    data: {
      name: descriptor.templateName,
      type: descriptor.templateType,
      dimensions: descriptor.dimensions,
      designData: {
        canvas: {
          width: args.width,
          height: args.height,
          backgroundColor: '#ffffff',
        },
        layers: [],
      },
      dynamicFields: [],
      projectId: args.projectId,
      createdBy: args.createdBy,
      category: KONVA_PROJECT_EXPORT_CATEGORY,
      tags: ['system', 'konva-export'],
      isPublic: false,
      isPremium: false,
    },
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }

    const { projectId: projectIdValue } = await params
    const projectId = Number(projectIdValue)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return NextResponse.json({ error: 'Projeto invalido' }, { status: 400 })
    }

    const project = await db.project.findFirst({
      where: { id: projectId },
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
    })

    if (!project) {
      return NextResponse.json({ error: 'Projeto nao encontrado' }, { status: 404 })
    }

    if (!hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 403 })
    }

    const parsedBody = bodySchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Payload invalido', details: parsedBody.error.flatten() },
        { status: 400 },
      )
    }

    const body = parsedBody.data

    try {
      await validateCreditsForFeature(userId, 'creative_download', 1, {
        organizationId: orgId ?? undefined,
      })
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            error: 'Creditos insuficientes',
            required: error.required,
            available: error.available,
          },
          { status: 402 },
        )
      }
      throw error
    }

    const base64Data = body.dataUrl.split(',')[1]
    if (!base64Data) {
      return NextResponse.json({ error: 'dataUrl invalido' }, { status: 400 })
    }

    const buffer = Buffer.from(base64Data, 'base64')
    const template = await getOrCreateKonvaExportTemplate({
      projectId,
      createdBy: userId,
      format: body.format,
      width: body.width,
      height: body.height,
    })

    const blob = await put(body.fileName, buffer, {
      access: 'public',
      contentType: 'image/jpeg',
      addRandomSuffix: true,
    })

    const creditResult = await deductCreditsForFeature({
      clerkUserId: userId,
      feature: 'creative_download',
      details: {
        templateId: template.id,
        exportType: 'konva_editor_project',
        documentId: body.documentId,
        pageId: body.pageId,
        pageName: body.pageName,
        format: body.format,
        fileName: blob.pathname || body.fileName,
      },
      organizationId: orgId ?? undefined,
      projectId,
    })

    const generation = await db.generation.create({
      data: {
        templateId: template.id,
        projectId,
        status: 'COMPLETED',
        resultUrl: blob.url,
        fileName: blob.pathname || body.fileName,
        fieldValues: {
          source: 'konva_editor',
          documentId: body.documentId,
          pageId: body.pageId,
          pageName: body.pageName,
          format: body.format,
          width: body.width,
          height: body.height,
        },
        templateName: body.pageName,
        projectName: project.name,
        createdBy: userId,
        completedAt: new Date(),
      },
    })

    if (project.googleDriveFolderId && googleDriveService.isEnabled()) {
      try {
        const backup = await googleDriveService.uploadCreativeToArtesLagosta(
          buffer,
          project.googleDriveFolderId,
          project.name,
        )

        await db.generation.update({
          where: { id: generation.id },
          data: {
            googleDriveFileId: backup.fileId,
            googleDriveBackupUrl: backup.publicUrl,
          },
        })
      } catch (backupError) {
        console.warn('[KONVA_PROJECT_EXPORT] Google Drive backup failed:', backupError)
      }
    }

    return NextResponse.json({
      success: true,
      creditsRemaining: creditResult.creditsRemaining,
      generation: {
        id: generation.id,
        resultUrl: generation.resultUrl,
        fileName: generation.fileName,
        pageName: body.pageName,
        format: body.format,
      },
    })
  } catch (error) {
    console.error('[KONVA_PROJECT_EXPORT] Failed to export creative:', error)
    return NextResponse.json(
      {
        error: 'Erro ao exportar criativo Konva',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
