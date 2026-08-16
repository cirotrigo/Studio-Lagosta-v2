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
import { getFeatureCost } from '@/lib/credits/settings'
import { InsufficientCreditsError } from '@/lib/credits/errors'
import { getCurrentImageModel } from '@/lib/ai/openai-image-client'
import { VERCEL_BLOB_HOST_REGEX } from '@/lib/ai/creative-improvement-service'
import { OPENAI_INPUT_SIZE, FINAL_OUTPUT_SIZE } from '@/lib/ai/creative-improvement-format'
import { ensureArteTemplate } from '@/lib/creatives/persist'
import { calculateCreditsForModel, type AIImageModel } from '@/lib/ai/image-models-config'
import { qualidadePadraoPara, type QualidadeArte } from '@/lib/ai/qualidade-arte'
import {
  MAX_SUBJECT_REFS,
  MAX_ANCHOR_REFS,
  MAX_STYLE_REFS,
  type GenerationTrack,
} from '@/lib/ai/image-prompt-builder'
import type {
  ArtGenerationJobArgs,
  ArtGenerationReference,
  CarouselMeta,
} from '@/lib/ai/creative-generation-runner'
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
  /**
   * Slide de carrossel. A capa (slideOrder 1) é foto pura e vai sem copy; o
   * primeiro slide COM copy é o guia, e os seguintes recebem a arte dele como
   * referência (`guideGenerationId`).
   */
  carrossel?: CarouselMeta | null
  /**
   * Tier do gpt-image na trilha `arte`. Ausente, o padrão sai de
   * `qualidadePadraoPara`: `low` para compor texto sobre a foto, `high` quando
   * há ajuste autorizado NA foto. Quem escolhe explicitamente é quem clica em
   * "gerar de novo" na galeria — a conferência de texto NUNCA muda isto
   * sozinha (ver a nota no runner).
   */
  qualidade?: QualidadeArte
  /**
   * Agrupa peças disparadas juntas por `gerar-imagem-lote`. Fica em
   * `fieldValues` para reencontrá-las depois — sem tabela nova, mesmo
   * precedente de `carouselGroupId` para carrossel.
   */
  loteId?: string
}

export interface StartArtGenerationResult {
  jobGenerationId: string
  reused: boolean
  runnerArgs: ArtGenerationJobArgs | null
  /**
   * Créditos DE FATO debitados por esta chamada — 0 quando o pedido caiu no
   * dedupe e reaproveitou uma geração em andamento. Existe para a superfície
   * poder dizer o preço: quem pediu `nano-banana-pro` em 4K escolheu pagar o
   * triplo do padrão sem que nada na conversa mostrasse isso.
   *
   * É o mesmo número que a dedução usa, porque ele vai como `creditsTotal` —
   * o caminho de preço por TABELA. Passá-lo como `quantity` seria multiplicá-lo
   * pelo custo da feature (ver a nota em `creditosADebitar`).
   */
  creditosCobrados: number
}

export async function startArtGeneration(
  input: StartArtGenerationInput,
): Promise<StartArtGenerationResult> {
  const pedido = input.pedido?.trim() ?? ''
  const copy = (input.copy ?? []).map((b) => b.trim()).filter(Boolean)
  // Cópia rasa: a conferência do `generationId` abaixo descarta o marcador que
  // não confere, e não é papel deste serviço mexer no objeto de quem chamou.
  const referencias = (input.referencias ?? []).map((r) => ({ ...r }))

  if (pedido.length > 1200) {
    throw new CreativeError('PEDIDO_LONGO', 'O pedido passou de 1200 caracteres.', 400)
  }
  if (input.track === 'imagem' && !pedido) {
    throw new CreativeError('PEDIDO_OBRIGATORIO', 'Descreva a imagem que você quer gerar.', 400)
  }
  // Capa de carrossel é foto PURA: sem copy de propósito. A regra veio de um
  // defeito real do sistema de origem — capa com texto saía com frases e
  // dados que ninguém pediu, porque o modelo "completa" a peça.
  const ehCapaDeCarrossel = input.carrossel?.slideOrder === 1
  if (input.track === 'arte' && copy.length === 0 && !ehCapaDeCarrossel) {
    throw new CreativeError(
      'COPY_OBRIGATORIA',
      'A trilha de arte precisa da copy (1 bloco por linha). Para imagem sem texto, use a trilha "imagem".',
      400,
    )
  }
  if (ehCapaDeCarrossel && copy.length > 0) {
    throw new CreativeError(
      'CAPA_SEM_TEXTO',
      'A capa do carrossel é foto pura, sem texto — mova essa copy para o slide 2.',
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
  // Papel precisa ser um dos quatro do usuário. brand-card, type-specimen e
  // logo são injetados pelo SISTEMA (carta renderizada + prancha tipográfica +
  // Project.logoUrl) — aceitar de fora abriria porta para logo alheia; papel
  // desconhecido quebraria a ordenação no runner.
  const ALLOWED_ROLES = new Set(['subject', 'anchor-ambient', 'anchor-dish', 'style'])
  const papelInvalido = referencias.find((r) => !ALLOWED_ROLES.has(r.role as string))
  if (papelInvalido) {
    throw new CreativeError(
      'REF_ROLE_INVALIDO',
      `Papel de referência inválido: "${papelInvalido.role}". Use subject, anchor-ambient, anchor-dish ou style (brand-card, type-specimen e logo são adicionados pelo sistema).`,
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
    select: {
      id: true,
      name: true,
      userId: true,
      googleDriveFolderId: true,
      googleDriveImagesFolderId: true,
    },
  })
  if (!project) {
    throw new CreativeError('PROJECT_NOT_FOUND', 'Projeto não encontrado', 404)
  }

  /**
   * MODELO escolhido à mão: o `generationId` numa referência `style` é o que
   * promove a referência a `style-guide` no runner, e com isso ela passa a
   * mandar na diagramação da peça. Por ser uma alegação de quem chama, é
   * conferida aqui — a arte precisa ser deste projeto.
   *
   * Id que não confere é DESCARTADO, nunca recusado: o pior desfecho aqui é
   * derrubar uma geração paga por causa de um vínculo de procedência. Sem o
   * marcador a referência continua valendo como referência de clima, que é
   * exatamente o comportamento anterior a 16/08/2026.
   */
  const idsDeModelo = referencias
    .map((r) => (r.role === 'style' ? r.generationId : undefined))
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  if (idsDeModelo.length > 0) {
    const doProjeto = await db.generation.findMany({
      where: { id: { in: idsDeModelo }, projectId: input.projectId },
      select: { id: true },
    })
    const validos = new Set(doProjeto.map((g) => g.id))
    for (const ref of referencias) {
      if (ref.generationId && !validos.has(ref.generationId)) {
        console.warn(
          `[arte-ia] referência aponta a arte ${ref.generationId}, que não é do projeto ${input.projectId} — segue como referência de clima`,
        )
        delete ref.generationId
      }
    }
  }

  // Guia do carrossel: a arte dele precisa existir para virar referência.
  let guideResultUrl: string | null = null
  if (input.carrossel?.guideGenerationId) {
    const guia = await db.generation.findFirst({
      where: { id: input.carrossel.guideGenerationId, projectId: input.projectId },
      select: { resultUrl: true, status: true },
    })
    if (!guia || guia.status !== 'COMPLETED' || !guia.resultUrl) {
      throw new CreativeError(
        'GUIA_NAO_PRONTO',
        'O slide-guia ainda não está pronto — confirme o estilo antes de gerar os demais slides.',
        409,
      )
    }
    guideResultUrl = guia.resultUrl
  }

  const fmt = FORMATO_MAP[input.formato]
  const modelo =
    input.modelo ?? (input.track === 'arte' ? getCurrentImageModel() : 'nano-banana-2')
  const resolution = input.resolution ?? '2K'
  /**
   * Compor é barato, EDITAR A FOTO é caro — ver `qualidadePadraoPara`. A
   * escolha explícita (o botão "gerar de novo") sempre vence o padrão.
   */
  const qualidade: QualidadeArte =
    input.qualidade ??
    qualidadePadraoPara({ temAjusteDeFoto: Boolean(input.instrucaoImagem?.trim()) })

  /**
   * 1K é ESTRITAMENTE DOMINADO, por isso recusado em vez de aceito em silêncio.
   *
   * Ele custa o MESMO que 2K nos dois modelos — o `nano-banana-pro` cobra 15
   * créditos em `resolution1K` e `resolution2K`, e o `nano-banana-2` cobra
   * flat — e entrega 1/4 dos pixels: medido em 12/08/2026, o pro devolve
   * 768x1376 em 1K contra 1536x2752 em 2K. Enquanto a finalização normalizava
   * tudo para 1080x1920, era pior ainda: 768x1376 é MENOR que a saída nos dois
   * eixos, então 1K virava UPSCALE — o defeito que a trilha `arte` corrigiu em
   * maio/2026 e que a trilha `imagem` reintroduziu sem que ninguém notasse.
   */
  if (input.track === 'imagem' && resolution === '1K') {
    throw new CreativeError(
      'RESOLUCAO_DOMINADA',
      'A resolução 1K custa o mesmo que a 2K e entrega um quarto dos pixels. Use 2K (padrão) ou 4K.',
      400,
    )
  }

  // Dedupe ANTES dos créditos (mesma razão do improve): retry do modelo no
  // chat não pode virar segunda cobrança.
  const pedidoHash = createHash('sha1')
    .update(
      JSON.stringify({
        p: pedido,
        c: copy,
        f: input.formato,
        t: input.track,
        r: referencias,
        // Sem isto, os slides de um carrossel de fotos parecidas cairiam no
        // dedupe uns dos outros e o carrossel sairia com slides faltando.
        cg: input.carrossel?.groupId ?? null,
        so: input.carrossel?.slideOrder ?? null,
        // O tier entra na chave: sem ele, "gerar de novo com o mais caro"
        // logo depois de uma geração em andamento cairia no dedupe e
        // devolveria a peça barata — exatamente o pedido que a pessoa
        // acabou de recusar. Mesma lição do `finalPrompt`, que também não
        // estava aqui.
        q: qualidade,
        /**
         * O prompt do MODO DIRETOR entra na chave. Sem ele, uma sessão de
         * direção — em que se reescreve o prompt e se dispara de novo mantendo
         * pedido e referências — colidia dentro da janela e devolvia a peça
         * anterior, que é justamente a que acabou de ser recusada.
         */
        fp: input.finalPrompt?.trim() || null,
      }),
    )
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
      // Reaproveitou: nada foi cobrado NESTA chamada.
      return { jobGenerationId: emAndamento.id, reused: true, runnerArgs: null, creditosCobrados: 0 }
    }
  }

  /**
   * Custo TOTAL em créditos, por trilha: arte = flat (mesma chamada da
   * melhoria); imagem = tabela do modelo (1K/2K/4K têm preços diferentes).
   *
   * Vai como `creditsTotal`, NUNCA como `quantity` — este é o total, e
   * `quantity` seria multiplicado pelo custo da feature. Passá-lo ali fazia os
   * 30 créditos do 4K virarem 150 (ver a nota em `creditosADebitar`).
   */
  const feature = input.track === 'arte' ? ('ai_art_generation' as const) : ('ai_image_generation' as const)
  const creditosCobrados =
    input.track === 'arte'
      ? await getFeatureCost(feature)
      : calculateCreditsForModel(
          (modelo === 'nano-banana-pro' ? 'nano-banana-pro' : 'nano-banana-2') as AIImageModel,
          resolution,
        )
  try {
    await validateCreditsForFeature(input.actorClerkId, feature, 1, {
      organizationId: input.orgId,
      creditsTotal: creditosCobrados,
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
      carouselGroupId: input.carrossel?.groupId ?? null,
      slideOrder: input.carrossel?.slideOrder ?? null,
      fieldValues: {
        source: 'arte-ia',
        track: input.track,
        ...(input.loteId ? { loteId: input.loteId } : {}),
        pedido,
        slotValues,
        pedidoHash,
        formato: input.formato,
        referencias,
        instrucaoImagem: input.instrucaoImagem ?? null,
        model: modelo,
        qualidade: input.track === 'arte' ? qualidade : null,
        resolution: input.track === 'imagem' ? resolution : null,
        inputSize: input.track === 'arte' ? OPENAI_INPUT_SIZE[fmt.formatKey] : null,
        finalSize: `${FINAL_OUTPUT_SIZE[fmt.formatKey].width}x${FINAL_OUTPUT_SIZE[fmt.formatKey].height}`,
        processingStartedAt: new Date().toISOString(),
      } as any,
      templateName: ARTE_IA_TEMPLATE_NAMES[fmt.type],
      projectName: project.name,
      createdBy: input.actorClerkId,
      authorName: input.carrossel
        ? `Slide ${input.carrossel.slideOrder}/${input.carrossel.totalSlides}`
        : 'Arte IA',
    },
  })

  return {
    jobGenerationId: job.id,
    reused: false,
    // O MESMO cálculo que a dedução faz (ver a nota em StartArtGenerationResult).
    creditosCobrados,
    runnerArgs: {
      jobGenerationId: job.id,
      projectId: project.id,
      projectName: project.name,
      projectGoogleDriveFolderId: project.googleDriveFolderId ?? null,
      projectGoogleDriveImagesFolderId: project.googleDriveImagesFolderId ?? null,
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
      qualidade,
      finalPrompt: input.finalPrompt?.trim() || null,
      feature,
      // TOTAL em créditos, não multiplicador — o runner o repassa em
      // `creditsTotal` na dedução.
      creditQuantity: creditosCobrados,
      carrossel: input.carrossel ?? null,
      guideResultUrl,
    },
  }
}
