import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { put } from '@vercel/blob'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Nenhum arquivo' }, { status: 400 })

    const maxMb = Number(process.env.BLOB_MAX_SIZE_MB || '25')
    const maxBytes = Math.max(1, maxMb) * 1024 * 1024 // default 25MB (configurable)
    if (file.size > maxBytes) {
      return NextResponse.json({ error: `Arquivo muito grande (máx ${maxMb}MB)` }, { status: 413 })
    }

    const ext = file.name?.split('.').pop()?.toLowerCase() || 'bin'
    const safeName = file.name?.replace(/[^a-z0-9._-]/gi, '_') || `upload.${ext}`
    const key = `uploads/${userId}/${Date.now()}-${safeName}`

    const token = process.env.BLOB_READ_WRITE_TOKEN
    const uploaded = await put(key, file, { access: 'public', token })

    // Persist record for admin management
    try {
      const user = await getUserFromClerkId(userId)
      await db.storageObject.create({
        data: {
          userId: user.id,
          clerkUserId: userId,
          provider: 'vercel_blob',
          url: uploaded.url,
          pathname: uploaded.pathname,
          name: file.name || safeName,
          contentType: file.type || null,
          size: file.size,
        },
      })
    } catch (e) {
      console.error('Failed to persist StorageObject:', e)
    }

    return NextResponse.json({
      url: uploaded.url,
      pathname: uploaded.pathname,
      contentType: file.type,
      size: file.size,
      name: file.name,
    })
  } catch (err) {
    console.error('Upload failed:', err)
    return NextResponse.json({ error: 'Falha no upload' }, { status: 500 })
  }
}
