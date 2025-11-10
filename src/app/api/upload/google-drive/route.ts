import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { put } from '@vercel/blob'
import { Readable } from 'stream'
import { googleDriveService } from '@/server/google-drive-service'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

interface UploadFromDriveBody {
  fileId?: string
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-z0-9._-]/gi, '_')
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk))
    } else {
      chunks.push(chunk)
    }
  }
  return Buffer.concat(chunks)
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

    const body = (await req.json().catch(() => null)) as UploadFromDriveBody | null
    const fileId = body?.fileId

    if (!fileId || typeof fileId !== 'string' || fileId.trim() === '') {
      return NextResponse.json({ error: 'ID do arquivo inválido' }, { status: 400 })
    }

    const { stream, mimeType, name } = await googleDriveService.getFileStream(fileId)

    const originalName = name ?? `arquivo-${fileId}`
    const safeName = sanitizeFileName(originalName)
    const ext = safeName.includes('.') ? safeName.split('.').pop()?.toLowerCase() : undefined
    const key = `uploads/${userId}/drive-${Date.now()}-${safeName}`

    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token || token.trim() === '') {
      // Fallback: converter para buffer e retornar data URL
      const buffer = await streamToBuffer(stream)
      const maxMb = Number(process.env.BLOB_MAX_SIZE_MB || '100')
      const maxBytes = Math.max(1, maxMb) * 1024 * 1024
      if (buffer.length > maxBytes) {
        return NextResponse.json({ error: `Arquivo muito grande (máx ${maxMb}MB)` }, { status: 413 })
      }

      const base64 = buffer.toString('base64')
      const dataUrl = `data:${mimeType ?? 'application/octet-stream'};base64,${base64}`
      return NextResponse.json({
        url: dataUrl,
        pathname: key,
        contentType: mimeType ?? null,
        size: buffer.length,
        name: originalName,
      })
    }

    // Upload direto do stream ao Vercel Blob (sem limite de tamanho!)
    const uploaded = await put(key, stream as any, {
      access: 'public',
      token,
      contentType: mimeType ?? (ext ? `image/${ext}` : undefined),
    })

    try {
      const user = await getUserFromClerkId(userId)
      await db.storageObject.create({
        data: {
          userId: user.id,
          clerkUserId: userId,
          provider: 'vercel_blob',
          url: uploaded.url,
          pathname: uploaded.pathname,
          name: originalName,
          contentType: mimeType ?? null,
          size: 0, // Size não disponível no streaming mode
        },
      })
    } catch (error) {
      console.error('[UploadFromDrive] Failed to persist storage object:', error)
    }

    return NextResponse.json({
      url: uploaded.url,
      pathname: uploaded.pathname,
      contentType: mimeType ?? null,
      size: 0, // Size não disponível no streaming mode
      name: originalName,
    })
  } catch (error) {
    console.error('[UploadFromDrive] Failed to import file from Drive:', error)
    const message =
      (error as { message?: string })?.message ||
      (error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ||
      'Falha ao importar arquivo do Google Drive'
    return NextResponse.json({ error: message ?? 'Falha ao importar arquivo do Google Drive' }, { status: 500 })
  }
}
