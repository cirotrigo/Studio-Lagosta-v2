import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ensureCloudinaryConfigured, uploadToCloudinary } from '@/lib/cloudinary'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    ensureCloudinaryConfigured()
  } catch (error) {
    return NextResponse.json({ error: 'Cloudinary não configurado' }, { status: 500 })
  }

  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const folderValue = form.get('folder')
    const tags = form.getAll('tags').map(String).filter(Boolean)

    const upload = await uploadToCloudinary(arrayBuffer, {
      folder: folderValue ? String(folderValue) : 'studio-lagosta-v2',
      resourceType: 'auto',
      tags: tags.length ? tags : undefined,
      context: { userId },
    })

    return NextResponse.json({
      url: upload.secureUrl,
      publicId: upload.publicId,
      bytes: upload.bytes,
      width: upload.width,
      height: upload.height,
      format: upload.format,
      filename: file.name,
    })
  } catch (error) {
    console.error('Cloudinary upload failed', error)
    return NextResponse.json({ error: 'Falha no upload' }, { status: 500 })
  }
}
