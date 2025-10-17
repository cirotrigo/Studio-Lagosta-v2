import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Verificar se é uma imagem
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    // Verificar tamanho do arquivo (max 25MB por padrão)
    const maxMb = Number(process.env.BLOB_MAX_SIZE_MB || '25')
    const maxBytes = Math.max(1, maxMb) * 1024 * 1024
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `Arquivo muito grande (máx ${maxMb}MB)` },
        { status: 413 }
      )
    }

    // Upload para Vercel Blob
    const fileName = `upload-${Date.now()}-${file.name}`
    const blob = await put(fileName, file, {
      access: 'public',
      contentType: file.type,
    })

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    )
  }
}
