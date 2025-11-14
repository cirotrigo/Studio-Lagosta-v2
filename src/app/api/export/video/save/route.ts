import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { put } from '@vercel/blob'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutos para upload de vídeos grandes
// @ts-ignore - Next.js 15 experimental feature for large file uploads
export const experimental_bodySizeLimit = '100mb' // Allow uploads up to 100MB

/**
 * POST /api/export/video/save
 * Faz upload do vídeo para Vercel Blob e salva na tabela Generation
 */
export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const formData = await req.formData()
    const videoFile = formData.get('video') as File
    const thumbnailFile = formData.get('thumbnail') as File | null
    const templateIdStr = formData.get('templateId') as string
    const projectIdStr = formData.get('projectId') as string
    const fileName = formData.get('fileName') as string
    const duration = parseFloat(formData.get('duration') as string)

    if (!videoFile || !templateIdStr || !projectIdStr || !fileName) {
      return NextResponse.json(
        { error: 'Parâmetros obrigatórios ausentes' },
        { status: 400 }
      )
    }

    const templateId = parseInt(templateIdStr, 10)
    const projectId = parseInt(projectIdStr, 10)

    console.log('[VIDEO_SAVE] Starting video upload for user:', userId, 'template:', templateId, 'size:', videoFile.size, 'has thumbnail:', !!thumbnailFile)

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

    // Converter File para Buffer
    const arrayBuffer = await videoFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload do vídeo para Vercel Blob
    console.log('[VIDEO_SAVE] Uploading video to Vercel Blob...', fileName)
    const blob = await put(fileName, buffer, {
      access: 'public',
      contentType: videoFile.type,
    })

    console.log('[VIDEO_SAVE] Video uploaded successfully:', blob.url)

    // Upload do thumbnail se fornecido
    let thumbnailUrl: string | undefined = undefined
    if (thumbnailFile) {
      console.log('[VIDEO_SAVE] Uploading thumbnail...')
      const thumbnailArrayBuffer = await thumbnailFile.arrayBuffer()
      const thumbnailBuffer = Buffer.from(thumbnailArrayBuffer)
      const thumbnailFileName = fileName.replace(/\.[^/.]+$/, '_thumb.jpg')

      const thumbnailBlob = await put(thumbnailFileName, thumbnailBuffer, {
        access: 'public',
        contentType: 'image/jpeg',
      })

      thumbnailUrl = thumbnailBlob.url
      console.log('[VIDEO_SAVE] Thumbnail uploaded successfully:', thumbnailUrl)
    }

    // Salvar geração no banco de dados
    const generation = await db.generation.create({
      data: {
        templateId: template.id,
        projectId: template.Project.id,
        status: 'COMPLETED',
        resultUrl: blob.url,
        fieldValues: {
          format: videoFile.type.includes('mp4') ? 'mp4' : 'webm',
          duration: duration || 0,
          fileSize: videoFile.size,
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
