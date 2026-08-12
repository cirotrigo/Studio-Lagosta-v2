import { NextResponse, after } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { startArtGeneration, type FormatoArteIA } from '@/lib/ai/creative-generation-service'
import type { ArtGenerationReference } from '@/lib/ai/creative-generation-runner'
import { enfileirarArte } from '@/lib/ai/generation-queue'
import { dispararJobAgora } from '@/lib/ai/generation-queue-executor'
import { QUALIDADES_OFERECIDAS, lerQualidade } from '@/lib/ai/qualidade-arte'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * "Gerar de novo" — a mesma arte, com o modelo que a pessoa escolher.
 *
 * POR QUE ESTA ROTA EXISTE, e não um simples re-POST em /arte-ia: quem está na
 * galeria tem a Generation, não o payload que a produziu. Reconstituir aqui,
 * no servidor, evita mandar prompt e referências para o cliente e de volta — e
 * garante que a peça nova nasce dos MESMOS insumos, com uma variável só
 * trocada.
 *
 * A conferência de texto NUNCA chega aqui sozinha: ela avisa e a arte sai
 * assim mesmo (regra de 10/08/2026, reafirmada em 12/08). Quem decide refazer
 * é o olho de quem aprova, com um clique e sabendo o preço.
 */

const bodySchema = z.object({
  qualidade: z.enum(['low', 'medium', 'high']).optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string; generationId: string }> },
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { projectId: projectIdRaw, generationId } = await params
    const projectId = Number(projectIdRaw)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
    }
    const qualidade = lerQualidade(parsed.data.qualidade) ?? undefined
    if (qualidade && !QUALIDADES_OFERECIDAS.includes(qualidade)) {
      return NextResponse.json(
        { error: `Modelo não oferecido: ${qualidade}` },
        { status: 400 },
      )
    }

    const project = await fetchProjectWithShares(projectId)
    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }
    if (!hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    // O `projectId` no where é o que impede refazer arte de outro cliente.
    const original = await db.generation.findFirst({
      where: { id: generationId, projectId },
      select: { fieldValues: true },
    })
    if (!original) {
      return NextResponse.json({ error: 'Arte não encontrada' }, { status: 404 })
    }

    const fv = (original.fieldValues ?? {}) as Record<string, unknown>
    if (fv.source !== 'arte-ia') {
      return NextResponse.json(
        { error: 'Só dá para gerar de novo uma arte criada por IA aqui.' },
        { status: 400 },
      )
    }

    const track = fv.track === 'imagem' ? ('imagem' as const) : ('arte' as const)
    const formato = (['story', 'feed', 'quadrado'] as const).includes(fv.formato as FormatoArteIA)
      ? (fv.formato as FormatoArteIA)
      : 'story'

    /**
     * A copy sai de `slotValues`, que é onde ela foi gravada na ordem de
     * leitura — e é a mesma fonte que `extractExpectedTexts` lê para conferir
     * o texto. Reconstituir de outro lugar arriscaria gerar a peça com uma
     * copy e conferir contra outra.
     */
    const slotValues = (fv.slotValues ?? {}) as Record<string, unknown>
    const copy = Object.keys(slotValues)
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
      .map((k) => slotValues[k])
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)

    const referencias = (Array.isArray(fv.referencias) ? fv.referencias : []) as ArtGenerationReference[]

    /**
     * ⚠️ `fv.prompt` NÃO é reaproveitado como `finalPrompt`.
     *
     * O que está gravado ali é o prompt FINAL — preâmbulo de referências mais
     * corpo. Devolvê-lo como `finalPrompt` faria o runner prefixar o preâmbulo
     * de novo, e a peça nasceria com a descrição das imagens duplicada. O
     * caminho normal reconstrói tudo a partir de pedido + copy + referências.
     */
    const started = await startArtGeneration({
      projectId,
      track,
      pedido: typeof fv.pedido === 'string' ? fv.pedido : undefined,
      copy: copy.length > 0 ? copy : undefined,
      formato,
      referencias,
      instrucaoImagem: typeof fv.instrucaoImagem === 'string' ? fv.instrucaoImagem : null,
      modelo: typeof fv.model === 'string' && track === 'imagem' ? fv.model : undefined,
      resolution: (fv.resolution as '1K' | '2K' | '4K' | null) ?? undefined,
      qualidade,
      actorClerkId: userId,
      orgId: orgId ?? undefined,
      /**
       * A janela do dedupe protege o clique duplo: o tier entra no hash, então
       * pedir "o mais caro" logo depois de "o mais barato" gera de verdade, e
       * clicar duas vezes no mesmo botão reaproveita em vez de cobrar duas.
       */
      dedupeWindowMinutes: 10,
    })

    if (started.runnerArgs) {
      const jobId = await enfileirarArte(started.runnerArgs)
      after(() => dispararJobAgora(jobId))
    }

    return NextResponse.json(
      {
        success: true,
        generation: { id: started.jobGenerationId, status: 'PROCESSING' as const },
        reaproveitada: started.reused,
        creditosCobrados: started.creditosCobrados,
      },
      { status: 202 },
    )
  } catch (error) {
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[arte-ia/refazer] erro:', error)
    return NextResponse.json({ error: 'Erro ao gerar de novo' }, { status: 500 })
  }
}
