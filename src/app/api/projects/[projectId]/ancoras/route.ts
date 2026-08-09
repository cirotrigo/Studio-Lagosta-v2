import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import {
  fetchProjectWithShares,
  hasProjectReadAccess,
  hasProjectWriteAccess,
} from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { listarAncoras, definirAncora, removerAncora } from '@/lib/ai/anchor-images'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Anchor sheet do projeto — as mesmas regras das tools MCP definir/listar-ancoras. */

async function autorizar(projectId: number, escrita: boolean) {
  const { userId, orgId } = await auth()
  if (!userId) return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }
  if (!projectId) return { erro: NextResponse.json({ error: 'Projeto inválido' }, { status: 400 }) }

  const project = await fetchProjectWithShares(projectId)
  const permitido = project
    ? escrita
      ? hasProjectWriteAccess(project, { userId, orgId })
      : hasProjectReadAccess(project, { userId, orgId })
    : false
  if (!permitido) {
    return { erro: NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 }) }
  }
  return { erro: null }
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const id = Number(projectId)
  const { erro } = await autorizar(id, false)
  if (erro) return erro

  return NextResponse.json(await listarAncoras(id))
}

const postSchema = z.object({
  sceneTag: z.string().min(1).max(40),
  driveFileId: z.string().min(1).max(120).optional().nullable(),
  url: z.string().url().optional().nullable(),
  label: z.string().max(80).optional().nullable(),
})

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const id = Number(projectId)
  const { erro } = await autorizar(id, true)
  if (erro) return erro

  const parsed = postSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Pedido inválido', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const { sceneTag, driveFileId, url, label } = parsed.data
    const ancora = await definirAncora({ projectId: id, sceneTag, driveFileId, url, label })
    return NextResponse.json(ancora, { status: 201 })
  } catch (error) {
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[ancoras] erro ao definir:', error)
    return NextResponse.json({ error: 'Erro ao definir âncora' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const id = Number(projectId)
  const { erro } = await autorizar(id, true)
  if (erro) return erro

  const ancoraId = new URL(req.url).searchParams.get('id')
  if (!ancoraId) return NextResponse.json({ error: 'Informe o id da âncora' }, { status: 400 })

  try {
    await removerAncora(id, ancoraId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[ancoras] erro ao remover:', error)
    return NextResponse.json({ error: 'Erro ao remover âncora' }, { status: 500 })
  }
}
