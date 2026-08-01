/**
 * Início da melhoria de criativo com IA — validação e criação do job.
 *
 * Extraído da rota /api/generations/[id]/improve para o conector MCP disparar
 * a MESMA melhoria (tool melhorar-arte) sem sessão Clerk. Cada chamador faz a
 * própria autorização (sessão Clerk na rota, portador/projeto no MCP) e este
 * serviço valida o resto: Generation com imagem, regra do post APROVADO,
 * créditos e host das URLs.
 *
 * O serviço NÃO dispara o trabalho pesado: devolve os argumentos do runner e
 * quem chamou decide como rodar — `after()` nas rotas, `await` direto num
 * teste E2E. Erros saem como CreativeError (código estável + status HTTP).
 */

import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { validateCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'
import { getCurrentImageModel } from '@/lib/ai/openai-image-client'
import {
  inferFormatFromTemplate,
  OPENAI_INPUT_SIZE,
  FINAL_OUTPUT_SIZE,
} from '@/lib/ai/creative-improvement-format'
import type { ImprovementJobArgs } from '@/lib/ai/creative-improvement-runner'
import {
  MAX_SELECTED_LOGOS,
  MAX_SELECTED_ELEMENTS,
} from '@/lib/ai/improvement-assets-constants'

/** Só imagens no nosso Blob entram no pipeline — URL de fora seria SSRF. */
export const VERCEL_BLOB_HOST_REGEX = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//

export interface StartImprovementInput {
  /** Generation de origem (a arte a melhorar). */
  generationId: string
  /** Pedido do cliente. Vazio = só as diretrizes do Diretor de Arte. */
  userRequest?: string
  backgroundImageUrl?: string | null
  selectedLogoIds?: number[]
  selectedElementIds?: number[]
  /** Post da agenda que recebe a arte ao final. Precisa estar SCHEDULED. */
  applyToPostId?: string | null
  /** Imagem a melhorar quando diferente do resultUrl (arte ATUAL do post). */
  sourceImageUrl?: string | null
  /** Quem paga os créditos e assina a Generation — id do CLERK (user_…). */
  actorClerkId: string
  orgId?: string
  /**
   * Reaproveita melhoria PROCESSING recente da mesma origem em vez de criar
   * outra. Protege o fluxo MCP de retries do modelo — cada geração custa
   * crédito e ~2 minutos.
   */
  dedupeWindowMinutes?: number
}

export interface StartImprovementResult {
  jobGenerationId: string
  /** true quando caiu no dedupe: já havia melhoria em andamento da origem. */
  reused: boolean
  /** Argumentos do runner. null quando reused — o job original já tem um. */
  runnerArgs: ImprovementJobArgs | null
}

export async function startImprovement(
  input: StartImprovementInput,
): Promise<StartImprovementResult> {
  const userRequest = input.userRequest ?? ''
  const selectedLogoIds = input.selectedLogoIds ?? []
  const selectedElementIds = input.selectedElementIds ?? []

  if (userRequest.length > 500) {
    throw new CreativeError('PEDIDO_LONGO', 'O pedido de melhoria passou de 500 caracteres.', 400)
  }
  if (selectedLogoIds.length > MAX_SELECTED_LOGOS || selectedElementIds.length > MAX_SELECTED_ELEMENTS) {
    throw new CreativeError('REFERENCIAS_DEMAIS', 'Referências demais para uma melhoria.', 400)
  }
  if (input.backgroundImageUrl && !VERCEL_BLOB_HOST_REGEX.test(input.backgroundImageUrl)) {
    throw new CreativeError('URL_NAO_PERMITIDA', 'URL de fundo não permitida', 400)
  }
  if (input.sourceImageUrl && !VERCEL_BLOB_HOST_REGEX.test(input.sourceImageUrl)) {
    throw new CreativeError('URL_NAO_PERMITIDA', 'URL de origem não permitida', 400)
  }

  const original = await db.generation.findFirst({
    where: { id: input.generationId },
    select: {
      id: true,
      projectId: true,
      templateId: true,
      resultUrl: true,
      templateName: true,
      Template: { select: { type: true, dimensions: true } },
    },
  })
  if (!original) {
    throw new CreativeError('GENERATION_NOT_FOUND', 'Criativo não encontrado', 404)
  }
  if (!original.resultUrl) {
    throw new CreativeError('SEM_IMAGEM', 'Criativo sem imagem disponível', 400)
  }

  const project = await db.project.findUnique({
    where: { id: original.projectId },
    select: { id: true, name: true, googleDriveFolderId: true },
  })
  if (!project) {
    throw new CreativeError('PROJECT_NOT_FOUND', 'Projeto não encontrado', 404)
  }

  if (input.applyToPostId) {
    const post = await db.socialPost.findFirst({
      where: { id: input.applyToPostId, projectId: original.projectId },
      select: { id: true, status: true },
    })
    if (!post) {
      throw new CreativeError('POST_NAO_ENCONTRADO', 'Post não encontrado neste projeto', 404)
    }
    // Regra de negócio: melhorar com IA só arte APROVADA. Rascunho se edita
    // no editor; a melhoria entra depois da aprovação.
    if (post.status !== 'SCHEDULED') {
      throw new CreativeError(
        'POST_NAO_APROVADO',
        post.status === 'DRAFT'
          ? 'Este post ainda é rascunho. Aprove-o primeiro — só arte aprovada pode ser melhorada com IA.'
          : `Este post não pode ser melhorado (status ${post.status}).`,
        400,
      )
    }
  }

  // Dedupe ANTES de validar créditos: reaproveitar job em andamento não pode
  // falhar por saldo — a cobrança daquele job já está encaminhada.
  if (input.dedupeWindowMinutes && input.dedupeWindowMinutes > 0) {
    const emAndamento = await db.generation.findFirst({
      where: {
        sourceGenerationId: original.id,
        status: 'PROCESSING',
        createdAt: { gte: new Date(Date.now() - input.dedupeWindowMinutes * 60_000) },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (emAndamento) {
      return { jobGenerationId: emAndamento.id, reused: true, runnerArgs: null }
    }
  }

  try {
    await validateCreditsForFeature(input.actorClerkId, 'ai_creative_improvement', 1, {
      organizationId: input.orgId,
    })
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      throw new CreativeError('CREDITOS_INSUFICIENTES', 'Créditos insuficientes', 402, {
        required: error.required,
        available: error.available,
      })
    }
    throw error
  }

  const format = inferFormatFromTemplate(original.Template)
  const openaiSize = OPENAI_INPUT_SIZE[format]
  const finalSize = FINAL_OUTPUT_SIZE[format]

  // Cria a Generation logo no PROCESSING — o chamador polla pelo id dela.
  const job = await db.generation.create({
    data: {
      templateId: original.templateId,
      projectId: original.projectId,
      status: 'PROCESSING',
      resultUrl: null,
      fileName: null,
      // Linhagem relacional — o fieldValues.originalGenerationId continua por
      // compatibilidade, mas quem consulta usa a coluna.
      sourceGenerationId: original.id,
      fieldValues: {
        source: 'ai_improvement',
        originalGenerationId: original.id,
        userRequest,
        backgroundImageUrl: input.backgroundImageUrl ?? null,
        selectedLogoIds,
        selectedElementIds,
        applyToPostId: input.applyToPostId ?? null,
        model: getCurrentImageModel(),
        quality: 'high',
        inputSize: openaiSize,
        finalSize: `${finalSize.width}x${finalSize.height}`,
        format,
        processingStartedAt: new Date().toISOString(),
      },
      templateName: `${original.templateName ?? 'Criativo'} (melhorado)`,
      projectName: project.name,
      createdBy: input.actorClerkId,
    },
  })

  return {
    jobGenerationId: job.id,
    reused: false,
    runnerArgs: {
      jobGenerationId: job.id,
      originalGenerationId: original.id,
      originalResultUrl: input.sourceImageUrl ?? original.resultUrl,
      applyToPostId: input.applyToPostId ?? null,
      userId: input.actorClerkId,
      orgId: input.orgId,
      projectId: original.projectId,
      projectName: project.name,
      projectGoogleDriveFolderId: project.googleDriveFolderId ?? null,
      templateName: original.templateName,
      userRequest,
      backgroundImageUrl: input.backgroundImageUrl ?? null,
      selectedLogoIds,
      selectedElementIds,
      format,
    },
  }
}
