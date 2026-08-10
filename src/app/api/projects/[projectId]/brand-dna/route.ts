import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import {
  fetchProjectWithShares,
  hasProjectReadAccess,
  hasProjectWriteAccess,
} from '@/lib/projects/access'
import {
  loadBrandContext,
  updateBrandDNA,
  BRAND_DNA_MAX_CHARS,
} from '@/lib/brand/brand-context'

export const runtime = 'nodejs'

/**
 * DNA da marca. GET devolve o BrandContext inteiro (DNA + o que o sistema
 * injeta: fontes, cores, logo) — é o mesmo objeto que os geradores consomem,
 * então a aba Marca mostra a verdade, não uma cópia.
 *
 * GET e PATCH são deliberadamente simétricos e finos: a lógica mora em
 * `src/lib/brand/brand-context.ts`, para as futuras tools de MCP
 * (consultar/atualizar DNA via chat) embrulharem o mesmo serviço.
 */

const campo = z.string().max(BRAND_DNA_MAX_CHARS, `Cada seção do DNA tem teto de ${BRAND_DNA_MAX_CHARS} caracteres`).nullable()

const patchSchema = z
  .object({
    toneOfVoice: campo,
    contentRules: campo,
    composition: campo,
    visualStyle: campo,
    photoDirection: campo,
    // Crivo de aprovação: editável como as demais seções, mas NUNCA entra em
    // prompt de geração — é checklist de revisão humana antes de agendar.
    approvalChecklist: campo,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Envie pelo menos uma seção do DNA',
  })

async function resolveProject(projectIdRaw: string) {
  const projectId = Number(projectIdRaw)
  if (Number.isNaN(projectId)) return { error: 'Projeto inválido', status: 400 as const }
  const project = await fetchProjectWithShares(projectId)
  if (!project) return { error: 'Projeto não encontrado', status: 404 as const }
  return { projectId, project }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const resolved = await resolveProject((await params).projectId)
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }
    if (!hasProjectReadAccess(resolved.project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const context = await loadBrandContext(resolved.projectId)
    return NextResponse.json(context)
  } catch (error) {
    console.error('[brand-dna] GET failed', error)
    return NextResponse.json({ error: 'Erro ao carregar o DNA da marca' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const resolved = await resolveProject((await params).projectId)
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }
    if (!hasProjectWriteAccess(resolved.project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const dna = await updateBrandDNA(resolved.projectId, parsed.data)
    return NextResponse.json({ dna })
  } catch (error) {
    console.error('[brand-dna] PATCH failed', error)
    return NextResponse.json({ error: 'Erro ao salvar o DNA da marca' }, { status: 500 })
  }
}
