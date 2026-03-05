import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { z } from 'zod'
import { randomBytes } from 'crypto'

export const runtime = 'nodejs'

// --- Types ---

interface ArtTemplate {
  id: string
  name: string
  format: string
  schemaVersion: number
  engineVersion: number
  templateVersion: number
  fingerprint: string
  analysisConfidence: number
  sourceImageUrl: string
  createdAt: string
  templateData: Record<string, unknown>
}

// Limits
const MAX_TEMPLATES_PER_FORMAT = 5

// --- GET: List templates ---

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const { projectId: projectIdStr } = await params
  const projectId = parseInt(projectIdStr, 10)
  if (isNaN(projectId)) {
    return NextResponse.json({ error: 'ID de projeto invalido' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectId)
  if (!project || !hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto nao encontrado' }, { status: 404 })
  }

  const ve = (project as any).brandVisualElements as Record<string, unknown> | null
  const artTemplates = (ve?.artTemplates ?? []) as ArtTemplate[]

  return NextResponse.json({ artTemplates })
}

// --- POST: Create template ---

const createSchema = z.object({
  name: z.string().min(1).max(100),
  format: z.enum(['FEED_PORTRAIT', 'STORY', 'SQUARE']),
  templateData: z.record(z.unknown()),
  fingerprint: z.string().min(1),
  analysisConfidence: z.number().min(0).max(1),
  sourceImageUrl: z.string().url(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const { projectId: projectIdStr } = await params
  const projectId = parseInt(projectIdStr, 10)
  if (isNaN(projectId)) {
    return NextResponse.json({ error: 'ID de projeto invalido' }, { status: 400 })
  }

  let body: z.infer<typeof createSchema>
  try {
    const rawBody = await request.json()
    body = createSchema.parse(rawBody)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Erro ao processar requisicao' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectId)
  if (!project || !hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto nao encontrado' }, { status: 404 })
  }

  // Read current visual elements (preserve all existing fields)
  const currentVe = ((project as any).brandVisualElements ?? {}) as Record<string, unknown>
  const artTemplates = (currentVe.artTemplates ?? []) as ArtTemplate[]

  // Check fingerprint for duplicates (C13)
  if (artTemplates.some(t => t.fingerprint === body.fingerprint)) {
    return NextResponse.json(
      { error: 'Template duplicado detectado' },
      { status: 409 }
    )
  }

  // Check per-format limit
  const sameFormatCount = artTemplates.filter(t => t.format === body.format).length
  if (sameFormatCount >= MAX_TEMPLATES_PER_FORMAT) {
    return NextResponse.json(
      { error: `Limite de ${MAX_TEMPLATES_PER_FORMAT} templates por formato atingido` },
      { status: 400 }
    )
  }

  // Create new template
  const newTemplate: ArtTemplate = {
    id: `tpl_${randomBytes(6).toString('hex')}`,
    name: body.name,
    format: body.format,
    schemaVersion: 1,
    engineVersion: 1,
    templateVersion: 1,
    fingerprint: body.fingerprint,
    analysisConfidence: body.analysisConfidence,
    sourceImageUrl: body.sourceImageUrl,
    createdAt: new Date().toISOString(),
    templateData: body.templateData,
  }

  // Merge preserving existing fields
  const updatedVe = {
    ...currentVe,
    artTemplates: [...artTemplates, newTemplate],
  }

  await db.project.update({
    where: { id: projectId },
    data: { brandVisualElements: updatedVe as any },
  })

  return NextResponse.json({ template: newTemplate }, { status: 201 })
}

// --- DELETE: Remove template ---

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const { projectId: projectIdStr } = await params
  const projectId = parseInt(projectIdStr, 10)
  if (isNaN(projectId)) {
    return NextResponse.json({ error: 'ID de projeto invalido' }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const templateId = searchParams.get('templateId')
  if (!templateId) {
    return NextResponse.json({ error: 'templateId obrigatorio' }, { status: 400 })
  }

  const project = await fetchProjectWithShares(projectId)
  if (!project || !hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto nao encontrado' }, { status: 404 })
  }

  const currentVe = ((project as any).brandVisualElements ?? {}) as Record<string, unknown>
  const artTemplates = (currentVe.artTemplates ?? []) as ArtTemplate[]

  const idx = artTemplates.findIndex(t => t.id === templateId)
  if (idx === -1) {
    return NextResponse.json({ error: 'Template nao encontrado' }, { status: 404 })
  }

  const updatedTemplates = artTemplates.filter(t => t.id !== templateId)
  const updatedVe = {
    ...currentVe,
    artTemplates: updatedTemplates,
  }

  await db.project.update({
    where: { id: projectId },
    data: { brandVisualElements: updatedVe as any },
  })

  return NextResponse.json({ success: true })
}
