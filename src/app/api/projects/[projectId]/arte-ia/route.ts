import { NextResponse, after } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { startArtGeneration } from '@/lib/ai/creative-generation-service'
import type { ArtGenerationReference, CarouselMeta } from '@/lib/ai/creative-generation-runner'
import { enfileirarArte } from '@/lib/ai/generation-queue'
import { dispararJobAgora } from '@/lib/ai/generation-queue-executor'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Geração de arte do zero (Fase 1 do plano de 09/08/2026).
 *
 * A validação de conteúdo (trilhas, papéis de referência, créditos, host das
 * URLs) vive no serviço startArtGeneration — compartilhado com a tool
 * gerar-imagem do MCP. A rota cuida só do que é dela: sessão Clerk e acesso
 * ao projeto. Responde 202 com o id da Generation; o cliente acompanha por
 * polling em /api/generations/{id} (mesmo contrato da melhoria).
 */

const refSchema = z.object({
  role: z.enum(['subject', 'anchor-ambient', 'anchor-dish', 'style']),
  url: z.string().url().optional(),
  driveFileId: z.string().min(1).max(120).optional(),
  label: z.string().max(80).optional(),
  /**
   * Numa referência `style`, marca que ela é o MODELO escolhido à mão — uma
   * arte deste projeto. O serviço confere a procedência e o runner a promove a
   * `style-guide`, que manda também na diagramação. Até 16/08/2026 o campo
   * existia na bancada e MORRIA aqui, no schema: escolher um modelo mudava só
   * qual imagem entrava como referência de clima, nunca o layout da arte.
   */
  generationId: z.string().min(1).max(60).optional(),
})

const bodySchema = z.object({
  track: z.enum(['imagem', 'arte']),
  pedido: z.string().max(1200).optional(),
  copy: z.array(z.string().max(200)).max(12).optional(),
  formato: z.enum(['story', 'feed', 'quadrado']),
  referencias: z.array(refSchema).max(6).optional().default([]),
  instrucaoImagem: z.string().max(500).optional().nullable(),
  modelo: z.string().max(40).optional(),
  // 1K saiu do enum em 12/08/2026: custava o mesmo que 2K e entregava 1/4 dos
  // pixels. `startArtGeneration` recusa de novo, para o caminho do MCP e o de
  // qualquer chamador futuro terem a mesma trava.
  resolution: z.enum(['2K', '4K']).optional(),
  /**
   * Slide de carrossel. O cliente é quem orquestra a série (capa → guia →
   * confirmar → demais), então cada slide é uma chamada própria — é o que
   * permite gerar os slides restantes em paralelo.
   */
  carrossel: z
    .object({
      groupId: z.string().min(8).max(64),
      slideOrder: z.number().int().min(1).max(10),
      totalSlides: z.number().int().min(2).max(10),
      guideGenerationId: z.string().min(1).optional().nullable(),
    })
    .optional()
    .nullable(),
})

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { projectId: projectIdRaw } = await params
    const projectId = Number(projectIdRaw)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Pedido inválido', details: parsed.error.flatten() },
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

    const started = await startArtGeneration({
      projectId,
      track: parsed.data.track,
      pedido: parsed.data.pedido,
      copy: parsed.data.copy,
      formato: parsed.data.formato,
      // O zod valida o shape; o cast fecha a diferença de opcionalidade que a
      // inferência do z.object cria sobre o enum obrigatório.
      referencias: parsed.data.referencias as ArtGenerationReference[],
      instrucaoImagem: parsed.data.instrucaoImagem ?? null,
      modelo: parsed.data.modelo,
      resolution: parsed.data.resolution,
      // Cast pelo mesmo motivo das referências: o zod infere os campos do
      // objeto como opcionais, ainda que o schema os exija.
      carrossel: (parsed.data.carrossel as CarouselMeta | null | undefined) ?? null,
      actorClerkId: userId,
      orgId: orgId ?? undefined,
    })

    /**
     * A execução vai para a FILA DURÁVEL antes de qualquer coisa (F0.3): se
     * esta invocação morrer, a varredura termina o serviço em vez de deixar a
     * Generation em PROCESSING para sempre.
     *
     * O disparo imediato continua porque aqui cabe: cada POST da bancada é UM
     * job na SUA invocação, e o acompanhamento na tela desiste em 8 minutos —
     * esperar a próxima varredura só adicionaria espera. O job segue no banco,
     * reservado, como rede.
     */
    if (started.runnerArgs) {
      const jobId = await enfileirarArte(started.runnerArgs)
      after(() => dispararJobAgora(jobId))
    }

    return NextResponse.json(
      {
        success: true,
        generation: { id: started.jobGenerationId, status: 'PROCESSING' as const },
        reused: started.reused,
      },
      { status: 202 },
    )
  } catch (error) {
    if (error instanceof CreativeError) {
      return NextResponse.json(
        { error: error.message, code: error.code, ...(error.details ?? {}) },
        { status: error.status },
      )
    }
    console.error('[arte-ia] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Erro ao iniciar geração', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
