import { NextResponse, after } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { startArtGeneration } from '@/lib/ai/creative-generation-service'
import {
  processArtGenerationInBackground,
  type ArtGenerationReference,
} from '@/lib/ai/creative-generation-runner'

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
})

const bodySchema = z.object({
  track: z.enum(['imagem', 'arte']),
  pedido: z.string().max(1200).optional(),
  copy: z.array(z.string().max(200)).max(12).optional(),
  formato: z.enum(['story', 'feed', 'quadrado']),
  referencias: z.array(refSchema).max(6).optional().default([]),
  instrucaoImagem: z.string().max(500).optional().nullable(),
  modelo: z.string().max(40).optional(),
  resolution: z.enum(['1K', '2K', '4K']).optional(),
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
      actorClerkId: userId,
      orgId: orgId ?? undefined,
    })

    if (started.runnerArgs) {
      const runnerArgs = started.runnerArgs
      after(() => processArtGenerationInBackground(runnerArgs))
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
