import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { isAdmin } from '@/lib/admin-utils'
import { db } from '@/lib/db'
import { del as delBlob } from '@vercel/blob'

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const { id } = await params
  const obj = await db.storageObject.findUnique({ where: { id } })
  if (!obj || obj.deletedAt) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN
    // Attempt to delete by URL; if fails caller can manually purge via provider UI
    await delBlob(obj.url, { token })
  } catch (e) {
    console.error('Blob delete failed (continuing to soft-delete):', e)
  }

  await db.storageObject.update({ where: { id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ ok: true })
}

