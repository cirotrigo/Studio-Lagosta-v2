import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { chaveDoFeedbackDeArte, normalizarVeredito } from '@/lib/aprendizado/feedback-de-arte'

export const runtime = 'nodejs'

/** Teto de ids por chamada — a grade pede só o que está na tela. */
const TETO_IDS = 400
const PREFIXO_CHAVE = 'arte-feedback:gen:'

/**
 * O veredito atual de VÁRIAS artes numa consulta só — é o que deixa a grade da
 * agenda sinalizar "já revisada" sem uma ida ao banco por card (pedido do Ciro
 * em 30/08/2026). Devolve só quem TEM feedback; ausência no mapa = ninguém
 * opinou. Falha degrada para mapa vazio — selo é conveniência, nunca erro.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { projectId: projectIdParam } = await params
    const projectId = parseInt(projectIdParam, 10)
    if (isNaN(projectId)) return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })

    const project = await fetchProjectWithShares(projectId)
    if (!hasProjectReadAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const brutos = new URL(req.url).searchParams.get('generationIds') ?? ''
    const ids = Array.from(
      new Set(
        brutos
          .split(',')
          .map((id) => id.trim())
          .filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id)),
      ),
    ).slice(0, TETO_IDS)
    if (ids.length === 0) return NextResponse.json({ vereditos: {} })

    const sinais = await db.learningSignal.findMany({
      where: { projectId, chave: { in: ids.map(chaveDoFeedbackDeArte) } },
      select: { chave: true, escolhido: true },
    })

    const vereditos: Record<string, 'gostei' | 'melhorar'> = {}
    for (const s of sinais) {
      if (!s.chave?.startsWith(PREFIXO_CHAVE)) continue
      const veredito = normalizarVeredito(
        ((s.escolhido ?? {}) as Record<string, unknown>).veredito,
      )
      if (veredito) vereditos[s.chave.slice(PREFIXO_CHAVE.length)] = veredito
    }

    return NextResponse.json({ vereditos })
  } catch (error) {
    console.error('[aprendizado] erro ao listar vereditos das artes:', error)
    return NextResponse.json({ vereditos: {} })
  }
}
