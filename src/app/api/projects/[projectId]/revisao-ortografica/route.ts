import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { revisarOrtografia } from '@/lib/ai/revisao-ortografica'

export const runtime = 'nodejs'

/**
 * Curto de propósito. Uma chamada de gpt-4o-mini com prompt pequeno responde
 * em poucos segundos, e o `abortSignal` do serviço (20s) é quem desiste
 * primeiro — desistindo em SILÊNCIO, que é o contrato. A rota estourar antes
 * dele devolveria erro para quem está apenas digitando.
 *
 * ⚠️ `maxDuration` vai INLINE: o glob do `vercel.json` é `app/api/**` e o
 * projeto é `src/app/**`, então nada de lá casa com esta rota.
 */
export const maxDuration = 30

/**
 * Revisão ortográfica da copy, com o vocabulário da marca.
 *
 * Casca fina sobre `revisarOrtografia` — a decisão do que é erro, o que é
 * palavra da casa e como degradar mora no serviço, que o MCP pode embrulhar
 * depois sem passar por HTTP.
 *
 * **Só LÊ.** Nada é gravado: conferir a grafia não altera o projeto, por isso
 * o acesso pedido é de LEITURA.
 */

const schema = z.object({
  blocos: z.array(z.string()).max(40).default([]),
  legenda: z.string().max(4_000).nullish(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const projectId = Number((await params).projectId)
    if (!Number.isInteger(projectId) || projectId <= 0) {
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

    const revisao = await revisarOrtografia(projectId, {
      blocos: parsed.data.blocos,
      legenda: parsed.data.legenda ?? null,
    })

    return NextResponse.json(revisao)
  } catch (error) {
    // Erro aqui NÃO pode virar 500 na cara de quem está digitando: a revisão
    // some e a pessoa segue escrevendo. É a mesma escolha do serviço, repetida
    // na borda para cobrir também o que acontece ANTES dele (body ilegível).
    console.error('[revisao-ortografica] falhou:', error)
    return NextResponse.json({ suspeitas: [], indisponivel: true })
  }
}
