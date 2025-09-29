import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { isAdmin } from '@/lib/admin-utils'
import { db } from '@/lib/db'

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim().toLowerCase()
  const type = (searchParams.get('type') || '').trim().toLowerCase()
  const userIdFilter = (searchParams.get('userId') || '').trim()
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '50')))
  const cursor = searchParams.get('cursor') || undefined

  const where: Record<string, unknown> = {
    deletedAt: null,
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { contentType: { contains: q, mode: 'insensitive' } },
      { pathname: { contains: q, mode: 'insensitive' } },
      { url: { contains: q, mode: 'insensitive' } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
      { user: { name: { contains: q, mode: 'insensitive' } } },
    ]
  }
  if (type) {
    where.contentType = { contains: type, mode: 'insensitive' }
  }
  if (userIdFilter) {
    where.userId = userIdFilter
  }

  const items = await db.storageObject.findMany({
    where,
    include: { user: { select: { id: true, clerkId: true, email: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  const nextCursor = items.length > limit ? items[limit].id : null
  const page = items.slice(0, limit)
  return NextResponse.json({ items: page, nextCursor })
}
