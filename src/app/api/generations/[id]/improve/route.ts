import { NextResponse, after } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { startImprovement } from '@/lib/ai/creative-improvement-service'
import { enfileirarMelhoria } from '@/lib/ai/generation-queue'
import { dispararJobAgora } from '@/lib/ai/generation-queue-executor'
import {
  MAX_SELECTED_LOGOS,
  MAX_SELECTED_ELEMENTS,
} from '@/lib/ai/improvement-assets-constants'
import { MODOS_DA_MELHORIA, type ModoDaMelhoria } from '@/lib/ai/modo-da-melhoria'

export const runtime = 'nodejs'
export const maxDuration = 300

// A validação de conteúdo (post APROVADO, créditos, host das URLs) vive no
// serviço startImprovement — compartilhado com a tool melhorar-arte do MCP.
// A rota só cuida do que é dela: sessão Clerk e acesso ao projeto.

// userRequest é opcional — quando vazio, aplica apenas as diretrizes do
// Diretor de Arte sem mudanças de conteúdo. O cliente do OpenAI lida com isso
// substituindo a seção [PEDIDO DO CLIENTE] por uma instrução padrão.
const bodySchema = z.object({
  userRequest: z.string().max(1200).default(''),
  /**
   * Ajuste autorizado NA FOTO — o campo avançado do modal. Presente, o tier
   * do gpt-image sobe para `high` (ver `qualidade-arte.ts`).
   */
  instrucaoImagem: z.string().max(1200).optional().nullable(),
  /** Tier explícito, quando quem pede escolhe. */
  quality: z.enum(['low', 'medium', 'high']).optional(),
  backgroundImageUrl: z.string().url().optional().nullable(),
  selectedLogoIds: z
    .array(z.number().int().positive())
    .max(MAX_SELECTED_LOGOS)
    .optional()
    .default([]),
  selectedElementIds: z
    .array(z.number().int().positive())
    .max(MAX_SELECTED_ELEMENTS)
    .optional()
    .default([]),
  /**
   * Post da agenda que deve receber a arte melhorada ao final. Vale para
   * RASCUNHO e AGENDADO (desde 01/08/2026); publicado/publicando/falhou são
   * recusados pelo serviço.
   */
  applyToPostId: z.string().min(1).optional().nullable(),
  /**
   * Fonte da imagem a melhorar, quando diferente do resultUrl da Generation —
   * um post pode ter sido re-renderizado pelo cron depois que a Generation foi
   * criada, e o que se melhora é a arte que está NO POST.
   */
  sourceImageUrl: z.string().url().optional().nullable(),
  /**
   * Slide do carrossel que recebe a arte melhorada (0 = primeiro). Ausente,
   * vale o primeiro — e os outros slides ficam intactos de qualquer forma.
   */
  applyToPostMediaIndex: z.number().int().min(0).optional().nullable(),
  /**
   * A porta da BANCADA (F3, 02/09/2026): item da fila (e o slide, em
   * carrossel) que recebe a arte melhorada. Mesma melhoria da agenda.
   */
  applyToItemDePlanoId: z.string().min(1).optional().nullable(),
  applyToPlanoId: z.string().min(1).optional().nullable(),
  applyToSlideOrdem: z.number().int().min(1).optional().nullable(),
  /**
   * O MODO da melhoria (05/09/2026, `docs/PLANO-2026-09-05-ARTES-COMO-O-CHATGPT.md`):
   * `rediagramar` preserva a diagramação, `redesenhar` refaz no estilo da
   * marca, `refinar` faz só a mudança pedida. Ausente, o serviço escolhe pela
   * origem da arte (`modoPadraoDaMelhoria`).
   */
  modo: z.enum(MODOS_DA_MELHORIA as [ModoDaMelhoria, ...ModoDaMelhoria[]]).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await params
    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Pedido inválido', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const original = await db.generation.findFirst({
      where: { id },
      select: { projectId: true },
    })
    if (!original) {
      return NextResponse.json({ error: 'Criativo não encontrado' }, { status: 404 })
    }

    const project = await fetchProjectWithShares(original.projectId)
    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }
    if (!hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const started = await startImprovement({
      generationId: id,
      userRequest: parsed.data.userRequest,
      instrucaoImagem: parsed.data.instrucaoImagem,
      quality: parsed.data.quality,
      backgroundImageUrl: parsed.data.backgroundImageUrl,
      selectedLogoIds: parsed.data.selectedLogoIds,
      selectedElementIds: parsed.data.selectedElementIds,
      applyToPostId: parsed.data.applyToPostId,
      sourceImageUrl: parsed.data.sourceImageUrl,
      applyToPostMediaIndex: parsed.data.applyToPostMediaIndex,
      applyToItemDePlanoId: parsed.data.applyToItemDePlanoId,
      applyToPlanoId: parsed.data.applyToPlanoId,
      applyToSlideOrdem: parsed.data.applyToSlideOrdem,
      modo: parsed.data.modo,
      actorClerkId: userId,
      orgId: orgId ?? undefined,
    })

    // O trabalho pesado entra na FILA DURÁVEL (F0.3) e é disparado já, nesta
    // invocação — cada POST é UM job, então não há teto disputado. O response
    // sai imediatamente e, se a invocação morrer no meio, a varredura recupera
    // em vez de deixar a melhoria em PROCESSING para sempre.
    if (started.runnerArgs) {
      const jobId = await enfileirarMelhoria(started.runnerArgs)
      after(() => dispararJobAgora(jobId))
    }

    return NextResponse.json(
      {
        success: true,
        generation: {
          id: started.jobGenerationId,
          status: 'PROCESSING' as const,
        },
      },
      { status: 202 },
    )
  } catch (error) {
    if (error instanceof CreativeError) {
      // Mantém o shape que o ImproveCreativeModal já lê: `error` com a
      // mensagem humana e, no 402, required/available no topo.
      return NextResponse.json(
        { error: error.message, ...(error.details ?? {}) },
        { status: error.status },
      )
    }
    console.error('[improve] Unexpected error:', error)
    return NextResponse.json(
      {
        error: 'Erro ao iniciar melhoria',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
