import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { googleDriveService } from '@/server/google-drive-service'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 120

interface UploadImageBody {
  imageUrl: string
  folderId: string
  fileName?: string
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!googleDriveService.isEnabled()) {
      return NextResponse.json({ error: 'Google Drive não configurado' }, { status: 503 })
    }

    const body = (await req.json().catch(() => null)) as UploadImageBody | null
    if (!body) {
      return NextResponse.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const { imageUrl, folderId, fileName } = body

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json({ error: 'imageUrl é obrigatório' }, { status: 400 })
    }

    if (!folderId || typeof folderId !== 'string') {
      return NextResponse.json({ error: 'folderId é obrigatório' }, { status: 400 })
    }

    // Download image from URL
    let imageBuffer: Buffer
    let mimeType = 'image/png'

    if (imageUrl.startsWith('data:')) {
      // Handle base64 data URL
      const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
      if (!matches) {
        return NextResponse.json({ error: 'Formato de data URL inválido' }, { status: 400 })
      }
      mimeType = matches[1]
      imageBuffer = Buffer.from(matches[2], 'base64')
    } else {
      // Fetch image from URL
      const imageResponse = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Studio-Lagosta/1.0',
        },
      })

      if (!imageResponse.ok) {
        return NextResponse.json(
          { error: 'Falha ao baixar imagem da URL' },
          { status: 400 }
        )
      }

      const contentType = imageResponse.headers.get('content-type')
      if (contentType && contentType.startsWith('image/')) {
        mimeType = contentType.split(';')[0]
      }

      const arrayBuffer = await imageResponse.arrayBuffer()
      imageBuffer = Buffer.from(arrayBuffer)
    }

    // Validate image size (max 50MB)
    const maxSizeBytes = 50 * 1024 * 1024
    if (imageBuffer.length > maxSizeBytes) {
      return NextResponse.json(
        { error: 'Imagem muito grande (máximo 50MB)' },
        { status: 413 }
      )
    }

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
    const extension = mimeType.split('/')[1] || 'png'
    const baseName = fileName?.replace(/\.[^.]+$/, '') || 'ai-generated'
    const finalFileName = `${timestamp}_${baseName}.${extension}`

    // Upload to Google Drive
    const uploadResult = await googleDriveService.uploadFileToFolder({
      buffer: imageBuffer,
      folderId,
      mimeType,
      fileName: finalFileName,
      makePublic: true,
    })

    // Track in database
    try {
      const user = await getUserFromClerkId(userId)
      await db.driveFileCache.upsert({
        where: { googleFileId: uploadResult.fileId },
        update: {
          name: finalFileName,
          mimeType,
          kind: 'file',
          parentId: folderId,
          thumbnailUrl: null,
          lastSynced: new Date(),
        },
        create: {
          googleFileId: uploadResult.fileId,
          name: finalFileName,
          mimeType,
          kind: 'file',
          parentId: folderId,
        },
      })
    } catch (cacheError) {
      console.error('[UploadImage] Failed to update cache', cacheError)
    }

    return NextResponse.json({
      success: true,
      fileId: uploadResult.fileId,
      publicUrl: uploadResult.publicUrl,
      webViewLink: uploadResult.webViewLink,
      webContentLink: uploadResult.webContentLink,
      fileName: finalFileName,
    })
  } catch (error) {
    console.error('[UploadImage] Failed to upload image to Drive', error)
    const message = error instanceof Error ? error.message : 'Erro ao enviar imagem para o Drive'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
