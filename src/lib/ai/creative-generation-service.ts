/**
 * Início da GERAÇÃO de arte do zero — validação e criação do job.
 *
 * Irmão do creative-improvement-service, com a mesma divisão de trabalho: o
 * chamador (rota HTTP, tool MCP, teste E2E) faz a própria autorização; este
 * serviço valida o resto — projeto, referências com papéis, créditos, host
 * das URLs — cria a Generation PROCESSING no template coletor "Arte IA" e
 * devolve os argumentos do runner. Quem chamou decide como rodar (`after()`
 * nas rotas, `await` num teste).
 *
 * Duas trilhas (ver image-prompt-builder.ts):
 * - `imagem`: cena/fotografia SEM texto → Gemini nano-banana.
 * - `arte`: peça com lettering (copy verbatim) → gpt-image-2 `images.edit`.
 */

import { createHash } from 'crypto'
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { validateCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'
import { getCurrentImageModel } from '@/lib/ai/openai-image-client'
import { VERCEL_BLOB_HOST_REGEX } from '@/lib/ai/creative-improvement-service'
import { OPENAI_INPUT_SIZE, FINAL_OUTPUT_SIZE } from '@/lib/ai/creative-improvement-format'
import { ensureArteTemplate } from '@/lib/creatives/persist'
import { calculateCreditsForModel, type AIImageModel } from '@/lib/ai/image-models-config'
import {
  MAX_SUBJECT_REFS,
  MAX_ANCHOR_REFS,
  MAX_STYLE_REFS,
  type GenerationTrack,
} from '@/lib/ai/image-prompt-builder'
import type { ArtGenerationJobArgs, ArtGenerationReference } from '@/lib/ai/creative-generation-runner'
import type { TemplateType } from '@prisma/client'

/**
 * Coletor próprio, separado do "Arte Rápida" (render de template) e do "Arte
 * Enviada" (upload externo): na galeria, a procedência é o template.
 */
export const ARTE_IA_TEMPLATE_NAMES: Record<TemplateType, string> = {
  STORY: 'Arte IA',
  FEED: 'Arte IA — Feed',
  SQUARE: 'Arte IA — Quadrado',
}

export type FormatoArteIA = 'story' | 'feed' | 'quadrado'

const FORMATO_MAP: Record<
  FormatoArteIA,
  { type: TemplateType; dimensions: string; aspectRatio: string; formatKey: keyof typeof OPENAI_INPUT_SIZE }
> = {
  story: { type: 'STORY', dimensions: '1080x1920', aspectRatio: '9:16', formatKey: 'STORY' },
  feed: { type: 'FEED', dimensions: '1080x1350', aspectRatio: '4:5', formatKey: 'FEED_PORTRAIT' },
  quadrado: { type: 'SQUARE', dimensions: '1080x1080', aspectRatio: '1:1', formatKey: 'SQUARE' },
}

export interface StartArtGenerationInput {
  projectId: number
  track: GenerationTrack
  /** Pedido em português. Obrigatório na trilha `imagem`; opcional na `arte`. */
  pedido?: string
  /** Blocos de copy verbatim — obrigatório na trilha `arte`. */
  copy?: string[]
  formato: FormatoArteIA
  /**
   * Referências com papel. `url` precisa ser do nosso Blob (SSRF); foto do
   * Drive vem como `driveFileId` e é baixada pelo serviço do Drive no runner.
   */
  referencias?: ArtGenerationReference[]
  /** Ajuste da foto autorizado pelo cliente (opt-in). Sem ele, foto intocada. */
  instrucaoImagem?: string | null
  /** Override do modelo. Default: gpt-image-2 (arte) / nano-banana-2 (imagem). */
  modelo?: string
  /** Resolução da trilha `imagem` (Gemini). Default 2K. */
  resolution?: '1K' | '2K' | '4K'
  /**
   * Prompt final pronto (modo diretor — o assistente no MCP escreve o prompt
   * ele mesmo). Passa pela mesma validação da trilha antes de ser usado.
   */
  finalPrompt?: string | null
  /** Quem paga os créditos e assina a Generation — id do CLERK (user_…). */
  actorClerkId: string
  orgId?: string
  /** Reusa job PROCESSING recente idêntico (retry de modelo no MCP). */
  dedupeWindowMinutes?: number
}

export interface StartArtGenerationResult {
  jobGenerationId: string
  reused: boolean
  runnerArgs: ArtGenerationJobArgs | null
}

export async function startArtGeneration(
  input: StartArtGenerationInput,
): Promise<StartArtGenerationResult> {
  const pedido = input.pedido?.trim() ?? ''
  const copy = (input.copy ?? []).map((b) => b.trim()).filter(Boolean)
  const referencias = input.referencias ?? []

  if (pedido.length > 1200) {
    throw new CreativeError('PEDIDO_LONGO', 'O pedido passou de 1200 caracteres.', 400)
  }
  if (input.track === 'imagem' && !pedido) {
    throw new CreativeError('PEDIDO_OBRIGATORIO', 'Descreva a imagem que você quer gerar.', 400)
  }
  if (input.track === 'arte' && copy.length === 0) {
    throw new CreativeError(
      'COPY_OBRIGATORIA',
      'A trilha de arte precisa da copy (1 bloco por linha). Para imagem sem texto, use a trilha "imagem".',
      400,
    )
  }
  if (copy.some((b) => b.length > 200)) {
    throw new CreativeError('COPY_LONGA', 'Cada bloco de copy deve ter até 200 caracteres.', 400)
  }

  // Papéis: tetos e coerência ("várias refs competindo causam deriva visual")
  const byRole = (role: string) => referencias.filter((r) => r.role === role)
  if (byRole('subject').length > MAX_SUBJECT_REFS) {
    throw new CreativeError('REFS_DEMAIS', 'Apenas 1 foto de prato/produto (subject) por geração.', 400)
  }
  const anchors = referencias.filter((r) => r.role === 'anchor-ambient' || r.role === 'anchor-dish')
  if (anchors.length > MAX_ANCHOR_REFS) {
    throw new CreativeError('REFS_DEMAIS', `No máximo ${MAX_ANCHOR_REFS} fotos-âncora por geração.`, 400)
  }
  if (byRole('style').length > MAX_STYLE_REFS) {
    throw new CreativeError('REFS_DEMAIS', `No máximo ${MAX_STYLE_REFS} referências de estilo.`, 400)
  }
  // Papel precisa ser um dos quatro do usuário. brand-card e logo são
  // injetados pelo SISTEMA (carta renderizada + Project.logoUrl) — aceitar de
  // fora abriria porta para logo alheia; papel desconhecido quebraria a
  // ordenação no runner.
  const ALLOWED_ROLES = new Set(['subject', 'anchor-ambient', 'anchor-dish', 'style'])
  const papelInvalido = referencias.find((r) => !ALLOWED_ROLES.has(r.role as string))
  if (papelInvalido) {
    throw new CreativeError(
      'REF_ROLE_INVALIDO',
      `Papel de referência inválido: "${papelInvalido.role}". Use subject, anchor-ambient, anchor-dish ou style (brand-card e logo são adicionados pelo sistema).`,
      400,
    )
  }
  if (input.track === 'arte' && byRole('subject').length === 0) {
    throw new CreativeError(
      'FOTO_OBRIGATORIA',
      'A arte precisa de uma foto real como cena (role subject) — do acervo ou upload.',
      400,
    )
  }
  for (const ref of referencias) {
    const temUrl = typeof ref.url === 'string' && ref.url.length > 0
    const temDrive = typeof ref.driveFileId === 'string' && ref.driveFileId.length > 0
    if (temUrl === temDrive) {
      throw new CreativeError('REF_INVALIDA', 'Cada referência leva OU url OU driveFileId.', 400)
    }
    if (temUrl && !VERCEL_BLOB_HOST_REGEX.test(ref.url!)) {
      throw new CreativeError('URL_NAO_PERMITIDA', 'URL de referência não permitida', 400)
    }
  }

  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, name: true, userId: true, googleDriveFolderId: true },
  })
  if (!project) {
    throw new CreativeError('PROJECT_NOT_FOUND', 'Projeto não encontrado', 404)
  }

  const fmt = FORMATO_MAP[input.formato]
  const modelo =
    input.modelo ?? (input.track === 'arte' ? getCurrentImageModel() : 'nano-banana-2')
  const resolution = input.resolution ?? '2K'

  // Dedupe ANTES dos créditos (mesma razão do improve): retry do modelo no
  // chat não pode virar segunda cobrança.
  const pedidoHash = createHash('sha1')
    .update(JSON.stringify({ p: pedido, c: copy, f: input.formato, t: input.track, r: referencias }))
    .digest('hex')
    .slice(0, 16)
  if (input.dedupeWindowMinutes && input.dedupeWindowMinutes > 0) {
    const emAndamento = await db.generation.findFirst({
      where: {
        projectId: input.projectId,
        status: 'PROCESSING',
        createdAt: { gte: new Date(Date.now() - input.dedupeWindowMinutes * 60_000) },
        fieldValues: { path: ['pedidoHash'], equals: pedidoHash },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (emAndamento) {
      return { jobGenerationId: emAndamento.id, reused: true, runnerArgs: null }
    }
  }

  // Custo por trilha: arte = flat (mesma chamada da melhoria); imagem = tabela
  // do modelo Gemini (1K/2K/4K têm preços diferentes).
  const feature = input.track === 'arte' ? ('ai_art_generation' as const) : ('ai_image_generation' as const)
  const quantidade =
    input.track === 'arte'
      ? 1
      : calculateCreditsForModel(
          (modelo === 'nano-banana-pro' ? 'nano-banana-pro' : 'nano-banana-2') as AIImageModel,
          resolution,
        )
  try {
    await validateCreditsForFeature(input.actorClerkId, feature, quantidade, {
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

  const template = await ensureArteTemplate(
    project.id,
    project.userId,
    fmt.type,
    fmt.dimensions,
    ARTE_IA_TEMPLATE_NAMES[fmt.type],
  )

  // Copy vira slotValues: é a forma que extractExpectedTexts lê — a conferência
  // de texto desta geração E de melhorias futuras desta arte dependem disso.
  const slotValues = Object.fromEntries(copy.map((b, i) => [`bloco${i + 1}`, b]))

  const job = await db.generation.create({
    data: {
      templateId: template.id,
      projectId: project.id,
      status: 'PROCESSING',
      resultUrl: null,
      fileName: null,
      fieldValues: {
        source: 'arte-ia',
        track: input.track,
        pedido,
        slotValues,
        pedidoHash,
        formato: input.formato,
        referencias,
        instrucaoImagem: input.instrucaoImagem ?? null,
        model: modelo,
        resolution: input.track === 'imagem' ? resolution : null,
        inputSize: input.track === 'arte' ? OPENAI_INPUT_SIZE[fmt.formatKey] : null,
        finalSize: `${FINAL_OUTPUT_SIZE[fmt.formatKey].width}x${FINAL_OUTPUT_SIZE[fmt.formatKey].height}`,
        processingStartedAt: new Date().toISOString(),
      } as any,
      templateName: ARTE_IA_TEMPLATE_NAMES[fmt.type],
      projectName: project.name,
      createdBy: input.actorClerkId,
      authorName: 'Arte IA',
    },
  })

  return {
    jobGenerationId: job.id,
    reused: false,
    runnerArgs: {
      jobGenerationId: job.id,
      projectId: project.id,
      projectName: project.name,
      projectGoogleDriveFolderId: project.googleDriveFolderId ?? null,
      actorClerkId: input.actorClerkId,
      orgId: input.orgId,
      track: input.track,
      pedido,
      copy,
      instrucaoImagem: input.instrucaoImagem?.trim() || null,
      formato: input.formato,
      aspectRatio: fmt.aspectRatio,
      openaiSize: OPENAI_INPUT_SIZE[fmt.formatKey],
      finalSize: FINAL_OUTPUT_SIZE[fmt.formatKey],
      referencias,
      modelo,
      resolution,
      finalPrompt: input.finalPrompt?.trim() || null,
      feature,
      creditQuantity: quantidade,
    },
  }
}
