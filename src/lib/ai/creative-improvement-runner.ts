/**
 * Pipeline da melhoria de criativo com IA — o trabalho pesado que a rota
 * `/api/generations/[id]/improve` dispara em background via `after()`.
 *
 * Vive em lib (e não na rota) para o mesmo caminho ser executável fora do
 * HTTP: o teste E2E de sessão roda ESTA função, com auth e créditos reais,
 * sem precisar de uma sessão Clerk.
 *
 * Fases (todas medidas e logadas): download dos insumos → geração no
 * gpt-image (até 2 tentativas) → verificação de texto por visão → resize →
 * upload → aplicação ao post. Texto divergente após as tentativas marca a
 * Generation FAILED e NUNCA chega ao post.
 */

import sharp from 'sharp'
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { deductCreditsForFeature } from '@/lib/credits/deduct'
import { fetchImageSource } from '@/lib/ai/fetch-image-source'
import {
  improveCreative,
  getCurrentImageModel,
  type ReferenceImage,
} from '@/lib/ai/openai-image-client'
import {
  inferFormatFromDimensions,
  OPENAI_INPUT_SIZE,
  FINAL_OUTPUT_SIZE,
  type ImprovementFormat,
} from '@/lib/ai/creative-improvement-format'
import { loadImprovementAssets } from '@/lib/ai/improvement-assets-loader'
import { CAIXA_DA_MANCHETE, aplicarCaixaDaOrigem } from '@/lib/ai/caixa-da-copy'
import { finalizarLogoDaMelhoria, melhoriaCompoeLogo, type LogoNaMelhoriaInfo } from '@/lib/ai/logo-na-melhoria'
import {
  loadExpectedTextsDaLinhagem,
  loadExpectedTextsForGeneration,
  transcreverTextosDaArte,
  verifyImageTexts,
} from '@/lib/ai/creative-text-verification'
import { googleDriveService } from '@/server/google-drive-service'
import { pedirNovaTentativa } from '@/lib/ai/generation-queue'
import { qualidadePadraoPara } from '@/lib/ai/qualidade-arte'

const MAX_OPENAI_INPUT_BYTES = 4 * 1024 * 1024 // 4MB

// Verificação de texto: até 2 gerações no total (a segunda só quando a
// primeira diverge). O teto da function é 300s e a retentativa é PULADA
// quando não sobra tempo para ela TERMINAR.
const MAX_GENERATION_ATTEMPTS = 2
const BACKGROUND_BUDGET_MS = 290_000
const FINALIZE_RESERVE_MS = 35_000 // resize + blob + drive + updates finais
/** Piso: abaixo disto nem a geração mais rápida cabe. */
const MIN_RETRY_BUDGET_MS = 45_000
/**
 * Folga sobre a duração MEDIDA da primeira geração para decidir a segunda.
 *
 * O piso sozinho era chute e mentia: em 09/08/2026, no runner irmão
 * (arte-ia), o formato feed levou 131s e a retentativa passou no teste dos
 * 45s com 117s de orçamento — abortou no meio, queimando dois minutos e a
 * chamada da OpenAI para nada. Exigir o tempo que a geração anterior
 * realmente levou faz o runner ou retentar de verdade, ou falhar rápido
 * dizendo o motivo.
 */
const RETRY_FOLGA = 1.2

export interface ImprovementJobArgs {
  jobGenerationId: string
  originalGenerationId: string
  originalResultUrl: string
  applyToPostId: string | null
  /**
   * Slide do carrossel que recebe a arte melhorada. Sem isso a melhoria
   * gravava `mediaUrls: [nova]` e APAGAVA os outros slides do post.
   */
  applyToPostMediaIndex?: number | null
  /**
   * A arte melhorada não é a da Generation de origem (outro slide do
   * carrossel): os textos esperados são de outra imagem e conferi-los
   * reprovaria uma arte correta.
   */
  skipTextVerification?: boolean
  /**
   * Item da fila da BANCADA que recebe a arte melhorada (F3, 02/09/2026). As
   * duas portas de entrada da arte pronta — fila da bancada e rascunho na
   * agenda — têm a MESMA melhoria: aqui o runner reaponta o item (ou o slide
   * do carrossel) para a Generation nova, como já faz com `mediaUrls` do post.
   * Sem isto o card da bancada continuava mostrando a arte antiga.
   */
  applyToItemDePlanoId?: string | null
  applyToPlanoId?: string | null
  /** Carrossel na bancada: a ordem do slide (1 = primeiro) que recebe a arte. */
  applyToSlideOrdem?: number | null
  userId: string
  orgId?: string
  projectId: number
  projectName: string
  projectGoogleDriveFolderId: string | null
  templateName: string | null | undefined
  userRequest: string
  /** Ajuste autorizado NA FOTO — o campo avançado do modal (01/09/2026). */
  instrucaoImagem?: string | null
  /** Tier do gpt-image. Ausente, o runner deriva de `instrucaoImagem`. */
  quality?: 'low' | 'medium' | 'high'
  backgroundImageUrl: string | null
  selectedLogoIds: number[]
  selectedElementIds: number[]
  format: ImprovementFormat
  /**
   * Job da fila durável que está executando este pipeline (F0.3). Presente, a
   * segunda geração (a que o texto divergente pede) acontece em OUTRA
   * invocação. Ausente (teste E2E, script), vale o laço de antes.
   */
  queueJobId?: string
}

interface DownloadResult {
  buffer: Buffer
  mimeType: string
  role: 'primary' | 'background' | 'logo' | 'element'
  label?: string
}

/**
 * O aviso de bloco A MAIS — a metade que faltava da conferência.
 *
 * Com dado (endereço, hora, preço, cidade) é o alerta vermelho: foi assim que
 * "Rua Fernandes Tourinho, 133 · Savassi, Belo Horizonte" chegou a um rascunho
 * do Quintal com a conferência verde (01/09/2026). Sem dado é aviso discreto.
 * Nunca reprova nem regera — decisão do Ciro na mesma data.
 */
function avisoDeTextoAMais(blocos: { comDado: string[]; semDado: string[] }): Record<string, unknown> {
  if (blocos.comDado.length === 0 && blocos.semDado.length === 0) return {}
  const info: Record<string, unknown> = { entregueComAlerta: true }
  if (blocos.comDado.length > 0) {
    const lista = blocos.comDado.slice(0, 3).map((t) => `"${t.slice(0, 60)}"`).join(', ')
    info.blocosAMaisComDado = blocos.comDado.slice(0, 5)
    info.textoAMaisAlerta =
      `A melhoria acrescentou texto que NÃO está na copy: ${lista}. ` +
      'É dado sobre o negócio do cliente (endereço, horário, preço) e pode ser inventado — confira antes de aprovar, e troque a arte se estiver errado.'
  }
  if (blocos.semDado.length > 0) {
    info.blocosAMaisSemDado = blocos.semDado.slice(0, 5)
    if (!info.textoAMaisAlerta) {
      const lista = blocos.semDado.slice(0, 3).map((t) => `"${t.slice(0, 40)}"`).join(', ')
      info.textoAMaisAviso = `A melhoria acrescentou texto que não está na copy (${lista}). Sem dado, mas confira se combina com a peça.`
    }
  }
  return info
}

/** Número sem lastro na copy — o mesmo aviso da geração, agora também aqui. */
function avisoDeNumerosNaMelhoria(numeros: string[]): Record<string, unknown> {
  if (numeros.length === 0) return {}
  return {
    entregueComAlerta: true,
    numerosNaoEsperados: numeros.slice(0, 10),
    numerosAlerta:
      `A arte mostra número que não está na copy (${numeros.slice(0, 5).join(', ')}). ` +
      'Pode ser algo real da foto — ou dado inventado pelo modelo. Confira antes de aprovar.',
  }
}

/**
 * A porta da BANCADA: o item (ou o slide) passa a apontar para a arte melhorada.
 *
 * Só mexe em item que ainda está na fila (`pronto`/`editado`/`proposto`): item
 * já `agendado` é do post, e o post tem o próprio caminho (`applyToPostId`).
 * Nunca lança — a arte já existe e está paga; um item que sumiu não pode
 * transformar isso em FAILED.
 */
async function reapontarItemDaBancada(input: {
  projectId: number
  planoId: string
  itemId: string
  slideOrdem: number | null
  generationId: string
  resultUrl: string
}): Promise<void> {
  try {
    const { transicionarItem } = await import('@/lib/planos/plano-service')
    const item = await db.itemDePlano.findFirst({
      where: { id: input.itemId, planoId: input.planoId, projectId: input.projectId },
      select: { id: true, status: true, slides: true, generationId: true },
    })
    if (!item) {
      console.warn(`[improve.bg] item da bancada ${input.itemId} não encontrado — arte fica só na galeria`)
      return
    }
    if (!['pronto', 'editado', 'proposto'].includes(item.status)) {
      console.warn(`[improve.bg] item ${input.itemId} está em "${item.status}" — não reaponto (a arte fica na galeria)`)
      return
    }
    if (input.slideOrdem != null) {
      const bruto = item.slides as { groupId?: string; lista?: Array<Record<string, unknown>> } | null
      const lista = Array.isArray(bruto?.lista) ? bruto!.lista : null
      if (!lista) {
        console.warn(`[improve.bg] item ${input.itemId} não tem slides — pedido de slide ${input.slideOrdem} ignorado`)
        return
      }
      const novaLista = lista.map((s) =>
        Number(s.ordem) === input.slideOrdem
          ? { ...s, generationId: input.generationId, resultUrl: input.resultUrl, erro: null }
          : s,
      )
      await transicionarItem({
        projectId: input.projectId,
        planoId: input.planoId,
        itemId: input.itemId,
        para: 'pronto',
        slides: { ...bruto, lista: novaLista },
      })
    } else {
      await transicionarItem({
        projectId: input.projectId,
        planoId: input.planoId,
        itemId: input.itemId,
        para: 'pronto',
        generationId: input.generationId,
      })
    }
    console.log(`[improve.bg] item da bancada ${input.itemId} reapontado para ${input.generationId}`)
  } catch (erro) {
    console.warn('[improve.bg] falha ao reapontar o item da bancada (arte segue na galeria):', erro)
  }
}

export async function processImprovementInBackground(args: ImprovementJobArgs): Promise<void> {
  const startedAt = Date.now()
  let format = args.format
  let openaiSize = OPENAI_INPUT_SIZE[format]
  let finalSize = FINAL_OUTPUT_SIZE[format]

  // Resultado da verificação de texto — declarado fora do try para o caminho
  // de FAILED também gravar o que foi conferido (auditoria).
  let textCheckInfo: Record<string, unknown> = { textCheck: 'skipped' }

  // O tier vale para as duas tentativas — trocar no meio compararia peras com
  // maçãs quando o texto divergir.
  const tier =
    args.quality ?? qualidadePadraoPara({ temAjusteDeFoto: !!args.instrucaoImagem?.trim() })

  try {
    const [assets, expectedTexts] = await Promise.all([
      loadImprovementAssets(args.projectId, {
        selectedLogoIds: args.selectedLogoIds,
        selectedElementIds: args.selectedElementIds,
      }),
      loadExpectedTextsForGeneration(args.originalGenerationId),
    ])

    const downloadTasks: Array<Promise<DownloadResult | null>> = []

    downloadTasks.push(
      fetchImageSource(args.originalResultUrl).then((r) => ({
        buffer: r.buffer,
        mimeType: r.contentType,
        role: 'primary' as const,
      })),
    )

    if (args.backgroundImageUrl) {
      const bgUrl = args.backgroundImageUrl
      downloadTasks.push(
        fetchImageSource(bgUrl)
          .then((r) => ({
            buffer: r.buffer,
            mimeType: r.contentType,
            role: 'background' as const,
          }))
          .catch((err) => {
            throw new Error(
              `Falha ao baixar fundo: ${err instanceof Error ? err.message : String(err)}`,
            )
          }),
      )
    }

    for (const logo of assets.logos) {
      downloadTasks.push(
        fetchImageSource(logo.fileUrl)
          .then((r) => ({
            buffer: r.buffer,
            mimeType: r.contentType,
            role: 'logo' as const,
            label: logo.name,
          }))
          .catch((err) => {
            console.warn(`[improve.bg] Falha ao baixar logo "${logo.name}":`, err)
            return null
          }),
      )
    }

    for (const element of assets.elements) {
      downloadTasks.push(
        fetchImageSource(element.fileUrl)
          .then((r) => ({
            buffer: r.buffer,
            mimeType: r.contentType,
            role: 'element' as const,
            label: element.name,
          }))
          .catch((err) => {
            console.warn(`[improve.bg] Falha ao baixar element "${element.name}":`, err)
            return null
          }),
      )
    }

    const downloads = (await Promise.all(downloadTasks)).filter(
      (d): d is DownloadResult => d !== null,
    )

    const primary = downloads.find((d) => d.role === 'primary')
    if (!primary) {
      throw new Error('Falha ao baixar a arte original')
    }

    // Re-infer format pelas dimensões REAIS da imagem fonte. Mais robusto que
    // confiar só no Template — criativos recuperados ou com Template incorreto
    // não devem sair achatados em outro aspect ratio.
    try {
      const meta = await sharp(primary.buffer).metadata()
      if (meta.width && meta.height) {
        const detectedFormat = inferFormatFromDimensions(meta.width, meta.height)
        if (detectedFormat !== format) {
          console.log(
            `[improve.bg] format override: template=${format} → image=${detectedFormat} (${meta.width}x${meta.height})`,
          )
          format = detectedFormat
          openaiSize = OPENAI_INPUT_SIZE[format]
          finalSize = FINAL_OUTPUT_SIZE[format]
        }
      }
    } catch (metaError) {
      console.warn('[improve.bg] sharp.metadata falhou — mantendo formato do template:', metaError)
    }

    const { buffer: primaryBuffer, mimeType: primaryMime } = await ensureUnderLimit(
      primary.buffer,
      primary.mimeType,
    )

    const references: ReferenceImage[] = []

    const bg = downloads.find((d) => d.role === 'background')
    if (bg) {
      const constrained = await ensureUnderLimit(bg.buffer, bg.mimeType)
      const [w, h] = openaiSize.split('x').map(Number)
      const resized = await sharp(constrained.buffer)
        .resize(w, h, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 90 })
        .toBuffer()
      references.push({
        buffer: resized,
        mimeType: 'image/jpeg',
        role: 'background',
        label: 'fundo',
      })
    }

    /**
     * Projeto em `compor`: a marca NÃO vai como referência (o modelo a
     * desenharia) — fica guardada para o código colar depois. Ver
     * `logo-na-melhoria.ts` (Wine Vix, 02/09/2026).
     */
    const logoParaCompor = melhoriaCompoeLogo(args.projectId)
      ? (downloads.find((d) => d.role === 'logo') ?? null)
      : null
    for (const logo of logoParaCompor ? [] : downloads.filter((d) => d.role === 'logo')) {
      const constrained = await ensureUnderLimit(logo.buffer, logo.mimeType)
      references.push({
        buffer: constrained.buffer,
        mimeType: constrained.mimeType,
        role: 'logo',
        label: logo.label,
      })
    }

    for (const element of downloads.filter((d) => d.role === 'element')) {
      const constrained = await ensureUnderLimit(element.buffer, element.mimeType)
      references.push({
        buffer: constrained.buffer,
        mimeType: constrained.mimeType,
        role: 'element',
        label: element.label,
      })
    }

    /**
     * Sem texto esperado no banco (arte do canvas ou de upload), a régua sai
     * da PRÓPRIA arte de origem, por visão. Ver `transcreverTextosDaArte`:
     * sem isso o modelo lê o serviço da imagem e completa o que não entende —
     * três rodadas seguidas inventaram endereço de outra cidade em 01/09/2026.
     *
     * Só quando a Generation não trouxe nada: texto aprovado no Studio é a
     * régua melhor e não se substitui por transcrição.
     */
    /**
     * 🔴 `skipTextVerification` significa "os `expectedTexts` do banco são de
     * OUTRA arte" (slide 3 do carrossel contra os textos do slide 1) — e por
     * isso eles são DESCARTADOS aqui. O que ele NÃO significa é "esta peça
     * não precisa de régua".
     *
     * Medido em 01/09/2026: as duas buscas de régua estavam condicionadas a
     * `!skipTextVerification`, então melhorar um slide de carrossel pela
     * agenda — que é o caminho que o Ciro usa — pulava as duas e a peça saía
     * sem régua nenhuma. O endereço voltou a ser inventado a cada rodada, com
     * o conserto no ar e sem deixar rastro: o ramo de `textosDaRegua.length
     * === 0` capturava o caso primeiro e gravava "sem texto esperado",
     * escondendo que o motivo real era o skip.
     */
    let textosDaRegua = args.skipTextVerification ? [] : expectedTexts
    let reguaPorVisao = false
    let reguaDaLinhagem = 0
    let raizSemTexto = false
    /**
     * A copy VERDADEIRA vem da raiz da linhagem — a arte do canvas. Só quando
     * nem ela tem é que a visão entra, e aí ela transcreve a imagem de
     * entrada, que numa cadeia longa já pode carregar dado inventado.
     * Ver `loadExpectedTextsDaLinhagem`.
     */
    if (textosDaRegua.length === 0 && !args.skipTextVerification) {
      const daLinhagem = await loadExpectedTextsDaLinhagem(args.originalGenerationId)
      // 🔴 A RAIZ manda. Numa cadeia de melhorias a entrada do 2º elo já tem
      // o texto que o 1º inventou — perguntar à visão só confirmaria a
      // invenção. Se a arte original é foto pura, a peça continua foto pura
      // por mais elos que a cadeia tenha.
      if (daLinhagem.semTexto) {
        raizSemTexto = true
        console.log('[improve.bg] a arte ORIGINAL desta linhagem é foto pura — a peça não leva texto')
      }
      if (daLinhagem.textos.length > 0) {
        textosDaRegua = daLinhagem.textos
        reguaDaLinhagem = daLinhagem.saltos
        console.log(
          `[improve.bg] régua da linhagem: ${daLinhagem.textos.length} bloco(s) da arte original (${daLinhagem.saltos} salto(s))`,
        )
      }
    }
    // A visão RODOU e não achou texto: é foto pura (capa de carrossel), não
    // apenas "ninguém transcreveu". A distinção decide a regra da capa.
    let arteSemTexto = false
    // Sem condição de skip: a visão lê o buffer da arte que está SENDO
    // melhorada, então a régua que ela produz é sempre da peça certa — é
    // justamente o que resolve o caso do slide de carrossel.
    if (textosDaRegua.length === 0) {
      textosDaRegua = await transcreverTextosDaArte(primaryBuffer)
      reguaPorVisao = textosDaRegua.length > 0
      arteSemTexto = textosDaRegua.length === 0
      if (reguaPorVisao) {
        console.log(`[improve.bg] régua por visão: ${textosDaRegua.length} bloco(s) lidos da arte original`)
      }
    }

    /**
     * De onde veio a régua — gravado por extenso porque `textCheckReason`
     * mentia por omissão (01/09/2026: o ramo "sem texto esperado" escondia que
     * o motivo real era o skip do carrossel). Uma coluna de leitura.
     */
    const origemDaRegua: 'banco' | 'linhagem' | 'visao' | 'nenhuma' = reguaPorVisao
      ? 'visao'
      : reguaDaLinhagem > 0
        ? 'linhagem'
        : textosDaRegua.length > 0
          ? 'banco'
          : 'nenhuma'

    /**
     * A caixa da arte de ORIGEM manda no prompt (Bacana, 02/09/2026): a copy
     * do banco vem em caixa natural e o modelo redesenha em natural o que a
     * arte tinha em CAIXA ALTA. Uma transcrição da origem (barata) resolve os
     * dois usos — a caixa por bloco e o desconto do texto a mais.
     */
    let transcricaoDaOrigem: string[] = reguaPorVisao ? textosDaRegua : []
    if (!reguaPorVisao && textosDaRegua.length > 0) {
      try {
        transcricaoDaOrigem = await transcreverTextosDaArte(primaryBuffer)
      } catch {
        transcricaoDaOrigem = []
      }
    }
    const textosParaPrompt = aplicarCaixaDaOrigem(
      textosDaRegua,
      transcricaoDaOrigem,
      CAIXA_DA_MANCHETE.get(args.projectId),
    )

    const downloadMs = Date.now() - startedAt
    console.log(
      `[improve.bg] fase download: ${(downloadMs / 1000).toFixed(1)}s | textos esperados: ${expectedTexts.length}`,
    )

    // Gera e confere. Sem textos esperados (upload externo, export do editor)
    // não há o que comparar: uma geração só, verificação pulada.
    let improvedBuffer: Buffer | null = null
    const attemptsLog: Array<Record<string, unknown>> = []
    let lastMissing: string[] = []
    /** Duração da geração anterior — base para decidir se a próxima cabe. */
    let ultimaGeracaoMs = 0

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      const remainingMs = BACKGROUND_BUDGET_MS - FINALIZE_RESERVE_MS - (Date.now() - startedAt)
      if (attempt > 1) {
        const precisa = Math.max(MIN_RETRY_BUDGET_MS, Math.round(ultimaGeracaoMs * RETRY_FOLGA))
        if (remainingMs < precisa) {
          console.warn(
            `[improve.bg] sem orçamento para a tentativa ${attempt}: restam ${Math.round(remainingMs / 1000)}s e a geração anterior levou ${Math.round(ultimaGeracaoMs / 1000)}s — mantendo o resultado divergente como FAILED em vez de abortar no meio`,
          )
          break
        }
      }

      const genStartedAt = Date.now()
      const candidate = await improveCreative({
        imageBuffer: primaryBuffer,
        mimeType: primaryMime,
        userRequest: args.userRequest,
        size: openaiSize,
        references: references.length > 0 ? references : undefined,
        brandColors: assets.colors,
        artDirection: assets.artDirection,
        brand: assets.brand,
        expectedTexts: textosParaPrompt,
        instrucaoImagem: args.instrucaoImagem ?? null,
        arteSemTexto: arteSemTexto || raizSemTexto,
        fatosDoCliente: assets.fatos,
        logoCompor: !!logoParaCompor,
        quality: tier,
        timeoutMs: Math.max(30_000, remainingMs),
      })
      const generationMs = Date.now() - genStartedAt
      ultimaGeracaoMs = generationMs

      if (textosDaRegua.length === 0) {
        improvedBuffer = candidate
        textCheckInfo = { textCheck: 'skipped', textCheckReason: 'sem texto esperado na Generation original' }
        break
      }

      /**
       * Só pula a conferência quando a régua veio dos `expectedTexts` do
       * banco (que são de outra arte). Se ela veio da VISÃO da própria peça,
       * conferir é correto e desejável — era esta a única proteção que
       * sobrava no carrossel.
       */
      if (args.skipTextVerification && !reguaPorVisao) {
        improvedBuffer = candidate
        textCheckInfo = {
          textCheck: 'skipped',
          textCheckReason: 'outro slide do carrossel — os textos esperados são de outra arte',
        }
        break
      }

      try {
        const checkStartedAt = Date.now()
        const check = await verifyImageTexts(
          candidate,
          textosDaRegua,
          [],
          assets.brand?.projectName ?? null,
          transcricaoDaOrigem.length > 0 ? transcricaoDaOrigem : primaryBuffer,
        )
        const checkMs = Date.now() - checkStartedAt
        attemptsLog.push({
          attempt,
          generationMs,
          checkMs,
          passed: check.passed,
          missing: check.missing,
        })
        console.log(
          `[improve.bg] tentativa ${attempt}: geração ${(generationMs / 1000).toFixed(1)}s, checagem ${(checkMs / 1000).toFixed(1)}s → ${check.passed ? 'texto OK' : `divergente (${check.missing.length} faltando)`}`,
        )

        if (check.passed) {
          improvedBuffer = candidate
          /**
           * O aviso de texto A MAIS vale JUSTAMENTE aqui, no ramo verde: é
           * assim que ele aparece — a copy inteira presente, mais um endereço
           * de outro estado (Quintal, 01/09/2026). Aviso, nunca reprovação.
           */
          textCheckInfo = {
            textCheck: 'passed',
            textCheckAttempts: attemptsLog,
            ...(reguaPorVisao ? { reguaPorVisao: true } : {}),
            ...avisoDeTextoAMais(check.blocosAMais),
            ...avisoDeNumerosNaMelhoria(check.numerosNaoEsperados),
          }
          break
        }
        lastMissing = check.missing
        textCheckInfo = {
          textCheck: 'failed',
          textCheckAttempts: attemptsLog,
          textCheckExtracted: check.extracted.slice(0, 30),
          ...avisoDeTextoAMais(check.blocosAMais),
        }
        /**
         * A segunda geração é item NOVO da fila, nunca a continuação desta
         * invocação: a melhoria leva ~140s e duas não cabem nos 300s — foi
         * assim que retentativas abortaram no meio, queimando a chamada paga.
         * A Generation fica PROCESSING e quem acompanha nem percebe a troca.
         */
        if (args.queueJobId) {
          const sampleRetry = check.missing.slice(0, 3).map((t) => `"${t}"`).join(', ')
          if (await pedirNovaTentativa(args.queueJobId, `texto divergente: ${sampleRetry}`)) {
            console.log(`[improve.bg] texto divergente — devolvido à fila para outra invocação (${args.queueJobId})`)
            return
          }
          // Sem tentativa sobrando: cai no throw lá embaixo, com o motivo.
          break
        }
      } catch (visionError) {
        // Verificador fora do ar não pode derrubar a melhoria — segue como
        // antes da feature existir, registrando que a conferência não rodou.
        console.warn('[improve.bg] checagem de visão indisponível — aplicando sem verificação:', visionError)
        improvedBuffer = candidate
        textCheckInfo = {
          textCheck: 'skipped',
          textCheckReason: `visão indisponível: ${visionError instanceof Error ? visionError.message : String(visionError)}`,
          textCheckAttempts: attemptsLog,
        }
        break
      }
    }

    if (!improvedBuffer) {
      // Todas as tentativas divergiram: a arte NÃO pode ir para o post — texto
      // errado publicado sem revisão é pior que melhoria nenhuma.
      const sample = lastMissing.slice(0, 3).map((t) => `"${t}"`).join(', ')
      throw new Error(
        `texto divergente após ${attemptsLog.length} tentativa(s): a arte gerada não reproduziu ${sample}${lastMissing.length > 3 ? ` (+${lastMissing.length - 3})` : ''}`,
      )
    }

    let logoInfo: LogoNaMelhoriaInfo | null = null
    if (logoParaCompor) {
      try {
        const r = await finalizarLogoDaMelhoria(improvedBuffer, logoParaCompor.buffer, format)
        improvedBuffer = r.buffer
        logoInfo = r.info
      } catch (erro) {
        console.warn('[improve.bg] falha ao compor a logo — a arte segue sem ela:', erro)
      }
    }

    const finalBuffer = await sharp(improvedBuffer)
      .resize(finalSize.width, finalSize.height, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 92 })
      .toBuffer()

    const fileNameBase = sanitize(args.templateName ?? 'criativo')
    const blob = await put(`${fileNameBase}_ia_melhorado_${Date.now()}.jpg`, finalBuffer, {
      access: 'public',
      contentType: 'image/jpeg',
      addRandomSuffix: true,
    })

    let googleDriveFileId: string | null = null
    let googleDriveBackupUrl: string | null = null
    if (args.projectGoogleDriveFolderId && googleDriveService.isEnabled()) {
      try {
        const backup = await googleDriveService.uploadCreativeToArtesLagosta(
          finalBuffer,
          args.projectGoogleDriveFolderId,
          args.projectName,
        )
        googleDriveFileId = backup.fileId
        googleDriveBackupUrl = backup.publicUrl
      } catch (backupError) {
        console.warn('[improve.bg] Google Drive backup failed:', backupError)
      }
    }

    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)

    await db.generation.update({
      where: { id: args.jobGenerationId },
      data: {
        status: 'COMPLETED',
        resultUrl: blob.url,
        fileName: blob.pathname,
        googleDriveFileId,
        googleDriveBackupUrl,
        completedAt: new Date(),
        fieldValues: {
          source: 'ai_improvement',
          originalGenerationId: args.originalGenerationId,
          userRequest: args.userRequest,
          backgroundImageUrl: args.backgroundImageUrl ?? null,
          selectedLogoIds: args.selectedLogoIds,
          selectedElementIds: args.selectedElementIds,
          model: getCurrentImageModel(),
          quality: tier,
          /**
           * 🔴 A régua PROPAGA pela cadeia. Melhorar uma melhoria é o caso
           * comum (o Ciro encadeou quatro em 01/09/2026), e a Generation nova
           * vira a ORIGEM da próxima: sem gravar os textos aqui, a régua
           * existe no primeiro elo e se perde em todos os seguintes —
           * `loadExpectedTextsForGeneration` devolve `[]` e o modelo volta a
           * ler o serviço da imagem e a completar o que não entende.
           *
           * Foi exatamente o que aconteceu: o backfill da copy alcançou as
           * artes `arte-enviada` do canvas, e as melhorias em cima delas
           * continuaram sem régua nenhuma.
           */
          ...(textosDaRegua.length > 0 ? { textos: textosDaRegua } : {}),
          regua: origemDaRegua,
          ...(logoInfo ? { logo: JSON.parse(JSON.stringify(logoInfo)) } : {}),
          ...(reguaDaLinhagem > 0 ? { reguaDaLinhagem } : {}),
          ...(reguaPorVisao ? { reguaPorVisao: true } : {}),
          inputSize: openaiSize,
          finalSize: `${finalSize.width}x${finalSize.height}`,
          format,
          elapsedSeconds,
          referenceCounts: {
            background: references.filter((r) => r.role === 'background').length,
            logos: references.filter((r) => r.role === 'logo').length,
            elements: references.filter((r) => r.role === 'element').length,
          },
          ...textCheckInfo,
        },
      },
    })

    // Dedução DEPOIS do sucesso e não-fatal: a arte já foi gerada, verificada
    // e está no Blob — falha de cobrança não pode virar isso em FAILED nem
    // impedir a aplicação ao post. Fica registrada para acerto manual.
    try {
      await deductCreditsForFeature({
        clerkUserId: args.userId,
        feature: 'ai_creative_improvement',
        details: {
          originalGenerationId: args.originalGenerationId,
          newGenerationId: args.jobGenerationId,
          model: getCurrentImageModel(),
          format,
          inputSize: openaiSize,
          elapsedSeconds,
        },
        organizationId: args.orgId,
        projectId: args.projectId,
      })
    } catch (deductError) {
      const deductMessage =
        deductError instanceof Error ? deductError.message : String(deductError)
      console.error(
        `[improve.bg] dedução de créditos FALHOU (generation ${args.jobGenerationId}) — melhoria segue valendo, acertar cobrança à mão:`,
        deductMessage,
      )
      await db.generation
        .update({
          where: { id: args.jobGenerationId },
          data: {
            fieldValues: {
              source: 'ai_improvement',
              originalGenerationId: args.originalGenerationId,
              userRequest: args.userRequest,
              backgroundImageUrl: args.backgroundImageUrl ?? null,
              selectedLogoIds: args.selectedLogoIds,
              selectedElementIds: args.selectedElementIds,
              model: getCurrentImageModel(),
              quality: tier,
              // A régua propaga também por este ramo — sem isto, uma falha
              // de cobrança apagava os `textos` e a próxima melhoria da
              // cadeia nascia sem régua.
              ...(textosDaRegua.length > 0 ? { textos: textosDaRegua } : {}),
              regua: origemDaRegua,
              inputSize: openaiSize,
              finalSize: `${finalSize.width}x${finalSize.height}`,
              format,
              elapsedSeconds,
              referenceCounts: {
                background: references.filter((r) => r.role === 'background').length,
                logos: references.filter((r) => r.role === 'logo').length,
                elements: references.filter((r) => r.role === 'element').length,
              },
              creditDeductionError: deductMessage.slice(0, 400),
              ...textCheckInfo,
            },
          },
        })
        .catch(() => null)
    }

    if (args.applyToItemDePlanoId && args.applyToPlanoId) {
      await reapontarItemDaBancada({
        projectId: args.projectId,
        planoId: args.applyToPlanoId,
        itemId: args.applyToItemDePlanoId,
        slideOrdem: args.applyToSlideOrdem ?? null,
        generationId: args.jobGenerationId,
        resultUrl: blob.url,
      })
    }

    if (args.applyToPostId) {
      /**
       * Carrossel: substitui SÓ o slide melhorado.
       *
       * Antes daqui saía `mediaUrls: [nova]`, o que apagava os outros slides
       * de um carrossel agendado — perda silenciosa, e sem volta, porque a
       * melhoria também marca `renderStatus: NOT_NEEDED` e tira o post do
       * alcance do re-render. A regra agora é: a melhoria NUNCA reduz a
       * quantidade de mídias do post, venha de onde vier o pedido.
       */
      const atual = await db.socialPost.findFirst({
        where: { id: args.applyToPostId, projectId: args.projectId },
        select: { mediaUrls: true },
      })
      const midiasAtuais = atual?.mediaUrls ?? []
      const indice = Math.min(
        Math.max(args.applyToPostMediaIndex ?? 0, 0),
        Math.max(midiasAtuais.length - 1, 0),
      )
      const novasMidias = midiasAtuais.length > 0 ? [...midiasAtuais] : [blob.url]
      novasMidias[indice] = blob.url

      // A melhoria demora ~1min; o post pode ter sido publicado nesse
      // meio-tempo. Só aplica se AINDA estiver em rascunho/agendado — trocar
      // a mídia de um post POSTING/POSTED mentiria sobre o que foi publicado.
      const updated = await db.socialPost.updateMany({
        where: {
          id: args.applyToPostId,
          projectId: args.projectId,
          status: { in: ['DRAFT', 'SCHEDULED'] },
          // Post já entregue ao publicador vai ao ar com a arte que está no
          // Zernio; trocar `mediaUrls` aqui só faria a agenda mentir sobre o
          // que foi publicado. A checagem é feita duas vezes — o serviço
          // recusa ao aceitar o pedido, e aqui de novo, porque a melhoria
          // leva ~140s em `after()` e a janela pode ter fechado no meio.
          laterPostId: null,
          // Compare-and-swap: se outra edição mexeu nas mídias entre a leitura
          // e agora, esta escrita desiste em vez de ressuscitar a lista velha
          ...(atual ? { mediaUrls: { equals: midiasAtuais } } : {}),
        },
        data: {
          mediaUrls: novasMidias,
          generationId: args.jobGenerationId,
          // A arte agora é uma derivação de IA, não o render da página:
          // NOT_NEEDED tira o post do alcance do cron render-stories e da
          // invalidação por edição de página — que zerariam mediaUrls e
          // voltariam a arte crua por cima da melhoria.
          renderStatus: 'NOT_NEEDED',
          nextRenderAt: null,
          renderError: null,
        },
      })
      if (updated.count === 0) {
        console.warn(
          `[improve.bg] post ${args.applyToPostId} mudou de estado ou de mídias — arte melhorada ficou só na galeria (${args.jobGenerationId})`,
        )
      } else {
        console.log(
          `[improve.bg] arte melhorada aplicada ao post ${args.applyToPostId}` +
            (novasMidias.length > 1 ? ` (slide ${indice + 1}/${novasMidias.length})` : ''),
        )
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[improve.bg] failed:', message)

    await db.generation
      .update({
        where: { id: args.jobGenerationId },
        data: {
          status: 'FAILED',
          fieldValues: {
            source: 'ai_improvement',
            originalGenerationId: args.originalGenerationId,
            userRequest: args.userRequest,
            backgroundImageUrl: args.backgroundImageUrl ?? null,
            selectedLogoIds: args.selectedLogoIds,
            selectedElementIds: args.selectedElementIds,
            model: getCurrentImageModel(),
            quality: tier,
            inputSize: openaiSize,
            finalSize: `${finalSize.width}x${finalSize.height}`,
            format,
            error: message,
            failedAt: new Date().toISOString(),
            ...textCheckInfo,
          },
          completedAt: new Date(),
        },
      })
      .catch((updateError) => {
        console.error('[improve.bg] failed to mark generation as FAILED:', updateError)
      })
  }
}

async function ensureUnderLimit(
  buffer: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (buffer.length <= MAX_OPENAI_INPUT_BYTES) {
    return { buffer, mimeType: contentType || 'image/jpeg' }
  }
  let result = await sharp(buffer).jpeg({ quality: 90 }).toBuffer()
  if (result.length > MAX_OPENAI_INPUT_BYTES) {
    result = await sharp(buffer)
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer()
  }
  return { buffer: result, mimeType: 'image/jpeg' }
}

function sanitize(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'criativo'
  )
}
