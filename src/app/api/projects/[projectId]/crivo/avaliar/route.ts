import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { avaliarCrivo } from '@/lib/brand/crivo-avaliacao'
import { crivoManual } from '@/lib/brand/approval-checklist'

export const runtime = 'nodejs'

/**
 * Uma chamada de modelo, ~3-8s medidos. O teto é generoso de propósito: o
 * `abortSignal` do serviço (45s) é quem desiste primeiro, e ele desiste caindo
 * no crivo manual — a rota estourar antes disso devolveria erro cru para quem
 * está tentando agendar.
 *
 * ⚠️ `maxDuration` vai INLINE: o glob do `vercel.json` é `app/api/**` e o
 * projeto é `src/app/**`, então nada de lá casa com esta rota.
 */
export const maxDuration = 60

/**
 * Conferência automática do crivo de aprovação da marca.
 *
 * Casca fina sobre `avaliarCrivo` — a decisão de o que é conferível, o que
 * exige olho e como degradar mora no serviço, que o MCP pode embrulhar depois
 * sem passar por HTTP.
 *
 * **Só LÊ.** A única escrita é a do registro em `Generation.fieldValues.crivo`,
 * feita dentro do serviço e engolindo o próprio erro. Por isso o acesso pedido
 * é de LEITURA: conferir uma peça não altera o projeto.
 */

const schema = z.object({
  copy: z.array(z.string()).max(40).default([]),
  legenda: z.string().max(4_000).nullish(),
  /** "YYYY-MM-DD HH:mm" em horário de Brasília, como a bancada monta. */
  quando: z.string().max(40).nullish(),
  formato: z.string().max(40).nullish(),
  generationId: z.string().max(60).nullish(),
  pageId: z.string().max(60).nullish(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const projectId = Number((await params).projectId)
    if (Number.isNaN(projectId)) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }

    const project = await fetchProjectWithShares(projectId)
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    if (!hasProjectReadAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Pedido inválido', details: parsed.error.issues[0]?.message },
        { status: 400 },
      )
    }

    const avaliacao = await avaliarCrivo(projectId, {
      copy: parsed.data.copy,
      legenda: parsed.data.legenda ?? null,
      quando: parsed.data.quando ?? null,
      formato: parsed.data.formato ?? null,
      generationId: parsed.data.generationId ?? null,
      pageId: parsed.data.pageId ?? null,
    })

    return NextResponse.json(avaliacao)
  } catch (error) {
    // Erro aqui NÃO pode virar 500 na cara de quem está agendando: a tela cai
    // no crivo manual e a pessoa segue. É a mesma escolha do serviço, repetida
    // na borda para cobrir também o que acontece ANTES dele (body ilegível).
    console.error('[crivo] avaliação falhou:', error)
    return NextResponse.json({
      ...crivoManual([], 'A conferência automática não pôde ser executada.'),
      evidencias: null,
    })
  }
}
