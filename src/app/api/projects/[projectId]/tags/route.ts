import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'

export const runtime = 'nodejs'

// Predefined color palette for automatic tag colors
const TAG_COLORS = [
  '#F59E0B', // amber
  '#10B981', // emerald
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#EF4444', // red
  '#06B6D4', // cyan
  '#84CC16', // lime
]

function getNextTagColor(usedColors: string[]): string {
  const available = TAG_COLORS.find((c) => !usedColors.includes(c))
  return available ?? TAG_COLORS[usedColors.length % TAG_COLORS.length]
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectIdNum = Number(projectId)
  if (!projectIdNum) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const tags = await db.projectTag.findMany({
    where: { projectId: projectIdNum },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(tags)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const authData = await auth()
  if (!authData.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId } = await params
  const projectIdNum = Number(projectId)
  if (!projectIdNum) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!hasProjectWriteAccess(project, { userId: authData.userId, orgId: authData.orgId })) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  try {
    const { name } = await req.json()

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Tag name is required' }, { status: 400 })
    }

    const trimmedName = name.trim()

    // Check for duplicate (case-insensitive)
    const existingTag = await db.projectTag.findFirst({
      where: {
        projectId: projectIdNum,
        name: { equals: trimmedName, mode: 'insensitive' },
      },
    })

    if (existingTag) {
      return NextResponse.json({ error: 'Tag already exists' }, { status: 409 })
    }

    // Get existing tags to determine next color
    const existingTags = await db.projectTag.findMany({
      where: { projectId: projectIdNum },
      select: { color: true },
    })

    const usedColors = existingTags.map((t) => t.color)
    const color = getNextTagColor(usedColors)

    const tag = await db.projectTag.create({
      data: {
        name: trimmedName,
        color,
        projectId: projectIdNum,
      },
    })

    return NextResponse.json(tag, { status: 201 })
  } catch (error) {
    console.error('Failed to create tag', error)
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }
}
