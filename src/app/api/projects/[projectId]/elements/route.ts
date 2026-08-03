import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { importarElemento } from '@/lib/brand/elementos'
import { CreativeError } from '@/lib/creatives/errors'
import { fetchProjectWithShares, hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'

export const runtime = 'nodejs'
export const maxDuration = 60 // Maximum execution time in seconds

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
  const projectIdNum = Number(projectId)
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (!projectIdNum) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!project || !hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  const elements = await db.element.findMany({
    where: { projectId: projectIdNum },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(elements)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
  const projectIdNum = Number(projectId)
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (!projectIdNum) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!project || !hasProjectWriteAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const body = (await req.json().catch(() => null)) as { url?: string; name?: string; category?: string | null } | null
    const url = body?.url?.trim()
    if (!url) {
      return NextResponse.json({ error: 'URL inválida para o elemento' }, { status: 400 })
    }

    const name = body?.name?.trim() || 'Elemento'
    const category = body?.category?.trim() || null

    const element = await db.element.create({
      data: {
        name,
        category,
        fileUrl: url,
        projectId: projectIdNum,
        uploadedBy: userId,
      },
    })

    return NextResponse.json(element, { status: 201 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
  }

  // A escrita mora no serviço, não aqui: o MCP local (upload-element) importa
  // levas grandes pela MESMA função, então chave do Blob, formatos aceitos e
  // teto de tamanho não podem divergir entre as duas portas.
  try {
    const element = await importarElemento({
      projectId: projectIdNum,
      bytes: Buffer.from(await file.arrayBuffer()),
      fileName: file.name || 'elemento',
      name: (form.get('name') as string | null)?.trim() || file.name || undefined,
      category: (form.get('category') as string | null)?.trim() || null,
      uploadedBy: userId,
    })
    return NextResponse.json(element, { status: 201 })
  } catch (error) {
    if (error instanceof CreativeError) {
      const help =
        error.code === 'BLOB_NAO_CONFIGURADO'
          ? 'Configure o token do Vercel Blob no arquivo .env. Veja SETUP-BLOB.md para instruções detalhadas.'
          : undefined
      return NextResponse.json({ error: error.message, ...(help ? { help } : {}) }, { status: error.status })
    }
    throw error
  }
}
