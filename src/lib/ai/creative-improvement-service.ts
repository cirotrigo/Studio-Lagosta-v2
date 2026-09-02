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
import { descreverJanela } from '@/lib/posts/freeze-window'
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
import { qualidadePadraoPara, type QualidadeArte } from '@/lib/ai/qualidade-arte'

/** Só imagens no nosso Blob entram no pipeline — URL de fora seria SSRF. */
export const VERCEL_BLOB_HOST_REGEX = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//

export interface StartImprovementInput {
  /** Generation de origem (a arte a melhorar). */
  generationId: string
  /** Pedido do cliente sobre a ARTE. Vazio = só as diretrizes do Diretor. */
  userRequest?: string
  /**
   * Ajuste autorizado NA FOTO (o campo avançado). Presente, o tier sobe para
   * `high`: compor letra é barato nos três tiers, mas editar a fotografia
   * separa — medido em 12/08/2026 (o `low` devolveu mancha lisa sem fibra).
   */
  instrucaoImagem?: string | null
  /** Tier explícito, quando quem pede escolhe. Ausente, vale o padrão. */
  quality?: QualidadeArte
  backgroundImageUrl?: string | null
  selectedLogoIds?: number[]
  selectedElementIds?: number[]
  /** Post da agenda que recebe a arte ao final. Precisa estar SCHEDULED. */
  applyToPostId?: string | null
  /** Imagem a melhorar quando diferente do resultUrl (arte ATUAL do post). */
  sourceImageUrl?: string | null
  /**
   * Slide do carrossel que está sendo melhorado (0 = primeiro). Só ele é
   * substituído no post; os demais ficam como estão.
   */
  applyToPostMediaIndex?: number | null
  /**
   * A outra porta: item da fila da BANCADA (e o slide, em carrossel) que
   * recebe a arte melhorada ao final. Mesma melhoria, mesma régua.
   */
  applyToItemDePlanoId?: string | null
  applyToPlanoId?: string | null
  applyToSlideOrdem?: number | null
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
  const instrucaoImagem = input.instrucaoImagem?.trim() || null
  const tier =
    input.quality ?? qualidadePadraoPara({ temAjusteDeFoto: !!instrucaoImagem })
  const selectedLogoIds = input.selectedLogoIds ?? []
  const selectedElementIds = input.selectedElementIds ?? []

  // 1200 e não 500: as instruções agora costumam vir da ANÁLISE VISUAL do
  // assistente (conferir-arte → diretor de arte), que é mais rica que um
  // pedido digitado.
  if (instrucaoImagem && instrucaoImagem.length > 1200) {
    throw new CreativeError('PEDIDO_LONGO', 'O ajuste na foto passou de 1200 caracteres.', 400)
  }
  if (userRequest.length > 1200) {
    throw new CreativeError('PEDIDO_LONGO', 'O pedido de melhoria passou de 1200 caracteres.', 400)
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

  // Slide do carrossel a substituir e se os textos da Generation de origem
  // valem para ele (ver o bloco do post logo abaixo)
  let mediaIndex: number | null = null
  let skipTextVerification = false

  let itemDaBancada: { itemId: string; planoId: string; slideOrdem: number | null } | null = null
  if (input.applyToItemDePlanoId) {
    const item = await db.itemDePlano.findFirst({
      where: { id: input.applyToItemDePlanoId, projectId: original.projectId },
      select: { id: true, planoId: true, status: true, generationId: true, slides: true },
    })
    if (!item) {
      throw new CreativeError('ITEM_NAO_ENCONTRADO', 'Item da bancada não encontrado neste cliente.', 404)
    }
    if (input.applyToPlanoId && item.planoId !== input.applyToPlanoId) {
      throw new CreativeError('ITEM_NAO_ENCONTRADO', 'Este item não pertence a essa leva.', 404)
    }
    if (item.status === 'agendado') {
      throw new CreativeError(
        'ITEM_JA_AGENDADO',
        'Este item já virou post: melhore pela agenda, que é onde a arte dele vive agora.',
        409,
      )
    }
    const slideOrdem = input.applyToSlideOrdem ?? null
    if (slideOrdem != null) {
      const bruto = item.slides as { lista?: Array<{ ordem?: number; generationId?: string }> } | null
      const slide = bruto?.lista?.find((s) => Number(s.ordem) === slideOrdem)
      if (!slide) {
        throw new CreativeError('SLIDE_INVALIDO', `Este item não tem o slide ${slideOrdem}.`, 400)
      }
      // A régua do banco é da Generation de ORIGEM; num carrossel a arte
      // melhorada é a do slide, e o slide tem a própria Generation.
      skipTextVerification = !!slide.generationId && slide.generationId !== original.id
    }
    itemDaBancada = { itemId: item.id, planoId: item.planoId, slideOrdem }
  }

  if (input.applyToPostId) {
    const post = await db.socialPost.findFirst({
      where: { id: input.applyToPostId, projectId: original.projectId },
      select: {
        id: true,
        status: true,
        laterPostId: true,
        scheduledDatetime: true,
        mediaUrls: true,
      },
    })
    if (!post) {
      throw new CreativeError('POST_NAO_ENCONTRADO', 'Post não encontrado neste projeto', 404)
    }
    /**
     * Post já entregue ao publicador não aceita mais troca de arte: o que vai
     * ao ar é a cópia que está no Zernio. Recusar ANTES de cobrar o crédito —
     * a melhoria custa ~140s e 1 crédito, e aplicá-la a um post congelado
     * gastaria os dois para mudar só o que a agenda mostra.
     */
    if (post.laterPostId) {
      throw new CreativeError(
        'POST_CONGELADO',
        descreverJanela(post).mensagem,
        409,
      )
    }
    // A melhoria vale para RASCUNHO e AGENDADO (decisão de 01/08/2026 — a
    // arte da API virou o briefing e a melhoria é o acabamento da criação;
    // a regra antiga de "só aprovado" fazia o acabamento chegar tarde).
    // Publicado/publicando/falhou seguem fora: mexer neles mentiria sobre o
    // que foi ou está sendo publicado.
    if (post.status !== 'SCHEDULED' && post.status !== 'DRAFT') {
      throw new CreativeError(
        'POST_NAO_MELHORAVEL',
        `Este post não pode ser melhorado (status ${post.status}).`,
        400,
      )
    }

    /**
     * Carrossel: a melhoria troca UM slide, nunca a lista inteira.
     *
     * Quem não informa o índice fica no primeiro (é o que a galeria e o MCP
     * melhoram), e o runner preserva os demais de qualquer jeito.
     */
    const midias = post.mediaUrls ?? []
    if (midias.length > 0) {
      const pedido = input.applyToPostMediaIndex ?? 0
      if (!Number.isInteger(pedido) || pedido < 0 || pedido >= midias.length) {
        throw new CreativeError(
          'SLIDE_INVALIDO',
          `Este post tem ${midias.length} imagem(ns); slide ${pedido + 1} não existe.`,
          400,
        )
      }
      mediaIndex = pedido

      /**
       * Os textos esperados vêm da Generation de origem, que é a arte de UM
       * slide. Conferir a arte do slide 3 contra os textos do slide 1
       * reprovaria uma arte correta e jogaria a melhoria fora — então a
       * conferência é pulada quando o que se melhora comprovadamente não é a
       * arte daquela Generation. Post de imagem única não muda de
       * comportamento.
       */
      skipTextVerification = midias.length > 1 && midias[pedido] !== original.resultUrl
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
        instrucaoImagem,
        backgroundImageUrl: input.backgroundImageUrl ?? null,
        selectedLogoIds,
        selectedElementIds,
        applyToPostId: input.applyToPostId ?? null,
        applyToPostMediaIndex: mediaIndex,
        ...(itemDaBancada ? { applyToItemDePlanoId: itemDaBancada.itemId, applyToPlanoId: itemDaBancada.planoId, applyToSlideOrdem: itemDaBancada.slideOrdem } : {}),
        model: getCurrentImageModel(),
        quality: tier,
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
      applyToPostMediaIndex: mediaIndex,
      applyToItemDePlanoId: itemDaBancada?.itemId ?? null,
      applyToPlanoId: itemDaBancada?.planoId ?? null,
      applyToSlideOrdem: itemDaBancada?.slideOrdem ?? null,
      skipTextVerification,
      userId: input.actorClerkId,
      orgId: input.orgId,
      projectId: original.projectId,
      projectName: project.name,
      projectGoogleDriveFolderId: project.googleDriveFolderId ?? null,
      templateName: original.templateName,
      userRequest,
      instrucaoImagem,
      quality: tier,
      backgroundImageUrl: input.backgroundImageUrl ?? null,
      selectedLogoIds,
      selectedElementIds,
      format,
    },
  }
}
