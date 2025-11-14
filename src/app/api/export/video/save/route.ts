import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 60 // Registro é rápido, não precisa de 300s

/**
 * POST /api/export/video/save
 * Registra geração de vídeo após upload direto para Vercel Blob
 *
 * Novo fluxo:
 * 1. Cliente faz upload direto para Vercel Blob via /upload-url
 * 2. Cliente chama este endpoint com a URL do blob
 * 3. Este endpoint apenas registra a geração no banco
 */
export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const {
      videoUrl,
      thumbnailUrl,
      templateId,
      projectId,
      fileName,
      duration,
      fileSize,
      format,
    } = body

    if (!videoUrl || !templateId || !projectId || !fileName) {
      return NextResponse.json(
        { error: 'Parâmetros obrigatórios ausentes' },
        { status: 400 }
      )
    }

    console.log('[VIDEO_SAVE] Registering video generation for user:', userId, 'template:', templateId)

    // Buscar template e projeto
    const template = await db.template.findFirst({
      where: { id: templateId },
      include: {
        Project: true,
      },
    })

    if (!template) {
      return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
    }

    // Verificar se o projeto corresponde
    if (template.Project.id !== projectId) {
      return NextResponse.json({ error: 'Projeto não corresponde ao template' }, { status: 400 })
    }

    // Salvar geração no banco de dados
    const generation = await db.generation.create({
      data: {
        templateId: template.id,
        projectId: template.Project.id,
        status: 'COMPLETED',
        resultUrl: videoUrl,
        fieldValues: {
          format: format || 'mp4',
          duration: duration || 0,
          fileSize: fileSize || 0,
          isVideo: true,
          thumbnailUrl: thumbnailUrl,
        },
        templateName: template.name,
        projectName: template.Project.name,
        createdBy: userId,
        completedAt: new Date(),
      },
    })

    console.log('[VIDEO_SAVE] Generation saved:', generation.id)

    return NextResponse.json({
      success: true,
      generation: {
        id: generation.id,
        resultUrl: generation.resultUrl,
      },
    })
  } catch (error) {
    console.error('[VIDEO_SAVE] Failed to save video:', error)
    return NextResponse.json(
      { error: 'Erro ao salvar vídeo' },
      { status: 500 }
    )
  }
}
