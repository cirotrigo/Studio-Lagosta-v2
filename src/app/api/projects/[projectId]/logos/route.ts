import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { put } from '@vercel/blob'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

async function verifyProject(projectId: number, userId: string) {
  return db.project.findFirst({ where: { id: projectId, userId } })
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
  const projectIdNum = Number(projectId)
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (!projectIdNum) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }

  const project = await verifyProject(projectIdNum, userId)
  if (!project) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  const logos = await db.logo.findMany({
    where: { projectId: projectIdNum },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(logos)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
  const projectIdNum = Number(projectId)
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (!projectIdNum) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }

  const project = await verifyProject(projectIdNum, userId)
  if (!project) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const body = (await req.json().catch(() => null)) as { url?: string; name?: string } | null
    const url = body?.url?.trim()
    if (!url) {
      return NextResponse.json({ error: 'URL inválida para o logo' }, { status: 400 })
    }

    const name = body?.name?.trim() || 'Logo'

    const logo = await db.logo.create({
      data: {
        name,
        fileUrl: url,
        projectId: projectIdNum,
        uploadedBy: userId,
      },
    })

    return NextResponse.json(logo, { status: 201 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'BLOB_READ_WRITE_TOKEN não configurado' }, { status: 500 })
  }

  const maxMb = Number(process.env.BLOB_MAX_SIZE_MB || '25')
  const maxBytes = Math.max(1, maxMb) * 1024 * 1024
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `Arquivo muito grande (máx ${maxMb}MB)` }, { status: 413 })
  }

  const ext = file.name?.split('.').pop()?.toLowerCase() || 'bin'
  const safeName = file.name?.replace(/[^a-z0-9._-]/gi, '_') || `logo.${ext}`
  const key = `projects/${projectIdNum}/logos/${Date.now()}-${safeName}`

  const uploaded = await put(key, file, {
    access: 'public',
    token,
    contentType: file.type,
  })

  const name = (form.get('name') as string | null)?.trim() || file.name || 'Logo'

  const logo = await db.logo.create({
    data: {
      name,
      fileUrl: uploaded.url,
      projectId: projectIdNum,
      uploadedBy: userId,
    },
  })

  return NextResponse.json(logo, { status: 201 })
}
