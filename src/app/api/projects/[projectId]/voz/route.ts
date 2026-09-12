import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { fetchProjectWithShares, hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'
import { lerVozDaMarca, salvarVozDaMarca } from '@/lib/brand/aba-marca'
import { CreativeError } from '@/lib/creatives/errors'

export const runtime = 'nodejs'

/**
 * A VOZ da marca na aba Marca ("Como a marca fala"). GET devolve a precedência
 * resolvida (quem manda na copy hoje), o registro e o legado; PUT grava a voz
 * inteira com a versão lida (CAS). Rotas finas: a regra mora em
 * `src/lib/brand/aba-marca.ts`, o mesmo que o conector lê.
 */
const putSchema = z.object({ voz: z.unknown(), versaoEsperada: z.number().int().nonnegative().nullable().optional() }).strict()

async function resolveProject(projectIdRaw: string) {
  const projectId = Number(projectIdRaw)
  if (Number.isNaN(projectId)) return { error: 'Projeto inválido', status: 400 as const }
  const project = await fetchProjectWithShares(projectId)
  if (!project) return { error: 'Projeto não encontrado', status: 404 as const }
  return { projectId, project }
}

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const resolved = await resolveProject((await params).projectId)
    if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    if (!hasProjectReadAccess(resolved.project, { userId, orgId })) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    return NextResponse.json(await lerVozDaMarca(resolved.projectId))
  } catch (error) {
    console.error('[voz] GET failed', error)
    return NextResponse.json({ error: 'Erro ao carregar a voz da marca' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const resolved = await resolveProject((await params).projectId)
    if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    if (!hasProjectWriteAccess(resolved.project, { userId, orgId })) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    const body = await request.json().catch(() => null)
    const parsed = putSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 })
    const resultado = await salvarVozDaMarca({ projectId: resolved.projectId, voz: parsed.data.voz, versaoEsperada: parsed.data.versaoEsperada ?? null })
    return NextResponse.json(resultado)
  } catch (error) {
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) }, { status: error.status })
    }
    console.error('[voz] PUT failed', error)
    return NextResponse.json({ error: 'Erro ao salvar a voz da marca' }, { status: 500 })
  }
}
