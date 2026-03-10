import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  fetchProjectWithShares,
  hasProjectReadAccess,
  hasProjectWriteAccess,
} from '@/lib/projects/access'

export const runtime = 'nodejs'

const updateSchema = z.object({
  fileUrl: z.string().url(),
  fileName: z.string().trim().min(1).max(255),
  sourceType: z.enum(['html', 'zip']),
  sizeBytes: z.number().int().nonnegative().optional(),
  notes: z.string().trim().max(500).optional(),
})

interface DesignSystemImportData {
  fileUrl: string
  fileName: string
  sourceType: 'html' | 'zip'
  sizeBytes?: number
  notes?: string
  uploadedAt: string
  uploadedBy: string
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const { projectId } = await params
  const projectIdNum = Number(projectId)
  if (!projectIdNum || Number.isNaN(projectIdNum)) {
    return NextResponse.json({ error: 'ID de projeto invalido' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!project || !hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto nao encontrado' }, { status: 404 })
  }

  const ve = ((project as any).brandVisualElements ?? {}) as Record<string, unknown>
  const designSystemImport = (ve.designSystemImport ?? null) as DesignSystemImportData | null

  return NextResponse.json({ designSystemImport })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const { projectId } = await params
  const projectIdNum = Number(projectId)
  if (!projectIdNum || Number.isNaN(projectIdNum)) {
    return NextResponse.json({ error: 'ID de projeto invalido' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!project || !hasProjectWriteAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto nao encontrado ou sem permissao' }, { status: 404 })
  }

  let body: z.infer<typeof updateSchema>
  try {
    body = updateSchema.parse(await req.json())
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados invalidos', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Erro ao processar requisicao' }, { status: 400 })
  }

  const currentVe = ((project as any).brandVisualElements ?? {}) as Record<string, unknown>
  const designSystemImport: DesignSystemImportData = {
    fileUrl: body.fileUrl,
    fileName: body.fileName,
    sourceType: body.sourceType,
    sizeBytes: body.sizeBytes,
    notes: body.notes,
    uploadedAt: new Date().toISOString(),
    uploadedBy: userId,
  }

  const updatedVe = {
    ...currentVe,
    designSystemImport,
  }

  await db.project.update({
    where: { id: projectIdNum },
    data: { brandVisualElements: updatedVe as any },
  })

  return NextResponse.json({ designSystemImport })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const { projectId } = await params
  const projectIdNum = Number(projectId)
  if (!projectIdNum || Number.isNaN(projectIdNum)) {
    return NextResponse.json({ error: 'ID de projeto invalido' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectIdNum)
  if (!project || !hasProjectWriteAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto nao encontrado ou sem permissao' }, { status: 404 })
  }

  const currentVe = ((project as any).brandVisualElements ?? {}) as Record<string, unknown>
  const { designSystemImport: _ignored, ...rest } = currentVe

  await db.project.update({
    where: { id: projectIdNum },
    data: { brandVisualElements: rest as any },
  })

  return NextResponse.json({ success: true })
}
