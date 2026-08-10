/**
 * Pipeline da geração de arte do zero — o trabalho pesado que a rota (ou a
 * tool MCP) dispara em background via `after()`.
 *
 * Irmão do creative-improvement-runner, com as mesmas garantias: fases
 * medidas e logadas, verificação de texto por visão (trilha `arte`), budget
 * de tempo com retentativa consciente, dedução de créditos não-fatal DEPOIS
 * do sucesso, e FAILED honesto com o motivo gravado.
 *
 * O contrato de referências (docs/PLANO-2026-08-09-GERACAO-IA-E-BANCADA.md):
 * subject → âncoras → style → brand-card → logo, com o preâmbulo de papéis
 * prefixado pelo backend. Toda geração grava {prompt, refs, params, modelo}
 * em fieldValues — o registro atômico que permite aprender com cada run.
 */

import sharp from 'sharp'
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { deductCreditsForFeature } from '@/lib/credits/deduct'
import { fetchImageSource } from '@/lib/ai/fetch-image-source'
import { runImageEdit, type RawEditImage } from '@/lib/ai/openai-image-client'
import { generateImageWithGemini } from '@/lib/ai/gemini-image-client'
import { loadBrandContext } from '@/lib/brand/brand-context'
import { getBrandReferenceCard } from '@/lib/ai/brand-reference-card'
import { verifyImageTexts } from '@/lib/ai/creative-text-verification'
import {
  buildArtePrompt,
  buildImagePromptViaLLM,
  buildReferencePreamble,
  orderReferences,
  validateImagePrompt,
  type ArtReferenceRole,
  type GenerationTrack,
} from '@/lib/ai/image-prompt-builder'
import { googleDriveService } from '@/server/google-drive-service'
import { comporLogo, instrucaoAreaReservada, type LogoCorner } from '@/lib/ai/logo-compositor'
import { ancoraAmbienteAutomatica } from '@/lib/ai/anchor-images'
import { MAX_ANCHOR_REFS } from '@/lib/ai/image-prompt-builder'
import type { FeatureKey } from '@/lib/credits/feature-config'

// Mesmo teto de sanitização do insta-automatico: foto acima de 4000px/lado
// (48MP de iPhone) derruba a API com `invalid_image_file`.
const MAX_INPUT_DIM = 4000
// Âncoras e referências secundárias não precisam de 4000px — 3000 mantém o
// detalhe e segura o payload (Gemini recebe tudo inline em base64).
const MAX_REF_DIM = 3000
const MAX_OPENAI_INPUT_BYTES = 4 * 1024 * 1024

const MAX_GENERATION_ATTEMPTS = 2
/**
 * Canto reservado para a logo. Fixo (e não escolhido pela medição de calma)
 * porque o prompt precisa saber ONDE deixar limpo ANTES de gerar — medir
 * depois só serviria para achar um canto que o modelo não preparou.
 */
const LOGO_CORNER: LogoCorner = 'bottom-right'
const BACKGROUND_BUDGET_MS = 290_000
const FINALIZE_RESERVE_MS = 35_000
const MIN_RETRY_BUDGET_MS = 45_000

export interface ArtGenerationReference {
  role: Exclude<ArtReferenceRole, 'brand-card' | 'logo'>
  url?: string
  driveFileId?: string
  label?: string
}

export interface ArtGenerationJobArgs {
  jobGenerationId: string
  projectId: number
  projectName: string
  projectGoogleDriveFolderId: string | null
  actorClerkId: string
  orgId?: string
  track: GenerationTrack
  pedido: string
  copy: string[]
  instrucaoImagem: string | null
  formato: 'story' | 'feed' | 'quadrado'
  aspectRatio: string
  openaiSize: string
  finalSize: { width: number; height: number }
  referencias: ArtGenerationReference[]
  modelo: string
  resolution: '1K' | '2K' | '4K'
  finalPrompt: string | null
  feature: FeatureKey
  creditQuantity: number
}

interface LoadedRef {
  role: ArtReferenceRole
  label?: string
  buffer: Buffer
  mimeType: string
}

export async function processArtGenerationInBackground(args: ArtGenerationJobArgs): Promise<void> {
  const startedAt = Date.now()
  let textCheckInfo: Record<string, unknown> = { textCheck: 'skipped' }
  let promptUsado: string | null = null

  try {
    const brand = await loadBrandContext(args.projectId)

    // ── Referências do usuário (acervo/upload) ────────────────────────────
    const loadedRefs: LoadedRef[] = []
    const downloads = await Promise.all(
      args.referencias.map(async (ref): Promise<LoadedRef | null> => {
        try {
          const source = ref.driveFileId
            ? await fetchImageSource(`/api/google-drive/image/${ref.driveFileId}`)
            : await fetchImageSource(ref.url!)
          const maxDim = ref.role === 'subject' ? MAX_INPUT_DIM : MAX_REF_DIM
          const sane = await sanitizeInput(source.buffer, maxDim)
          return { role: ref.role, label: ref.label, ...sane }
        } catch (error) {
          // Âncora que falhou não derruba a geração; subject sim — sem a foto
          // do prato a trilha `arte` produziria cena inventada.
          if (ref.role === 'subject') {
            throw new Error(
              `Falha ao baixar a foto principal: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
          console.warn(`[arte-ia.bg] referência ${ref.role} falhou — seguindo sem ela:`, error)
          return null
        }
      }),
    )
    loadedRefs.push(...downloads.filter((d): d is LoadedRef => d !== null))

    // ── Âncora de ambiente automática (trilha `imagem`) ───────────────────
    // A cena é GERADA nesta trilha; sem foto real do lugar o modelo inventa
    // um ambiente genérico. Se o projeto tem anchor sheet e o chamador não
    // escolheu âncora de ambiente, o sistema injeta a canônica.
    let autoAnchorUsada: string | null = null
    if (args.track === 'imagem' && !loadedRefs.some((r) => r.role === 'anchor-ambient')) {
      const anchorsAtuais = loadedRefs.filter(
        (r) => r.role === 'anchor-ambient' || r.role === 'anchor-dish',
      ).length
      if (anchorsAtuais < MAX_ANCHOR_REFS) {
        const auto = await ancoraAmbienteAutomatica(args.projectId).catch(() => null)
        if (auto) {
          try {
            const source = await fetchImageSource(auto.blobUrl)
            const sane = await sanitizeInput(source.buffer, MAX_REF_DIM)
            loadedRefs.push({
              role: 'anchor-ambient',
              label: auto.label ?? 'ambiente da casa',
              ...sane,
            })
            autoAnchorUsada = auto.id
            console.log(`[arte-ia.bg] âncora de ambiente automática injetada (${auto.id})`)
          } catch (error) {
            console.warn('[arte-ia.bg] âncora automática não baixou — seguindo sem ela:', error)
          }
        }
      }
    }

    // ── Referências do sistema: brand card (só na trilha `arte`) ─────────
    // A logo NÃO entra como referência para o modelo desenhar: ela é composta
    // depois (logo-compositor). O card mostra a logo apenas para o modelo
    // reconhecer a marca, e o prompt proíbe reproduzi-la.
    let logoParaCompor: Buffer | null = null
    if (args.track === 'arte') {
      const card = await getBrandReferenceCard(brand).catch((error) => {
        console.warn('[arte-ia.bg] brand card falhou — seguindo sem ele:', error)
        return null
      })
      if (card) {
        loadedRefs.push({ role: 'brand-card', buffer: card.buffer, mimeType: card.mimeType })
      }
      if (brand?.logoUrl) {
        try {
          const logo = await fetchImageSource(brand.logoUrl)
          logoParaCompor = logo.buffer
        } catch (error) {
          console.warn('[arte-ia.bg] logo não baixou — a arte sai sem marca:', error)
        }
      } else {
        console.warn(
          `[arte-ia.bg] projeto ${args.projectId} sem logo cadastrada — a arte sai sem marca`,
        )
      }
    }

    const ordered = orderReferences(loadedRefs)
    const downloadMs = Date.now() - startedAt
    console.log(
      `[arte-ia.bg] fase download: ${(downloadMs / 1000).toFixed(1)}s | refs: ${ordered
        .map((r) => r.role)
        .join(', ')}`,
    )

    // ── Prompt ────────────────────────────────────────────────────────────
    const preamble = buildReferencePreamble(ordered)
    let body: string
    let promptIssues: string[] = []

    if (args.finalPrompt) {
      // Modo diretor (MCP): o assistente escreveu o prompt — validamos com a
      // mesma régua da trilha antes de aceitar.
      body = args.finalPrompt
      if (args.track === 'imagem') {
        const check = validateImagePrompt(body)
        promptIssues = check.issues
        if (!check.ok) {
          console.warn(`[arte-ia.bg] finalPrompt com ressalvas: ${check.issues.join(' | ')}`)
        }
      }
    } else if (args.track === 'imagem') {
      const built = await buildImagePromptViaLLM({
        pedido: args.pedido,
        brand,
        refs: ordered.map((r) => ({ role: r.role, label: r.label })),
        aspectRatio: args.aspectRatio,
      })
      body = built.prompt
      promptIssues = built.issues
    } else {
      body = buildArtePrompt({
        copy: args.copy,
        pedido: args.pedido || undefined,
        brand,
        refs: ordered.map((r) => ({ role: r.role, label: r.label })),
        instrucaoImagem: args.instrucaoImagem,
        // Só reserva área quando existe logo para colar lá; sem logo, pedir
        // um canto vazio seria desperdiçar composição à toa.
        blocoLogo: logoParaCompor ? instrucaoAreaReservada(LOGO_CORNER) : null,
      })
    }

    const prompt = preamble ? `${preamble}\n\n${body}` : body
    promptUsado = prompt
    console.log(`[arte-ia.bg] prompt pronto (${prompt.length} chars, trilha ${args.track})`)

    // ── Geração (+ verificação de texto na trilha `arte`) ────────────────
    const expectedTexts = args.track === 'arte' ? args.copy : []
    let resultBuffer: Buffer | null = null
    const attemptsLog: Array<Record<string, unknown>> = []
    let lastMissing: string[] = []

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      const remainingMs = BACKGROUND_BUDGET_MS - FINALIZE_RESERVE_MS - (Date.now() - startedAt)
      if (attempt > 1 && remainingMs < MIN_RETRY_BUDGET_MS) {
        console.warn(`[arte-ia.bg] sem orçamento para a tentativa ${attempt} — parando`)
        break
      }

      const genStartedAt = Date.now()
      const candidate = await generateOnce(args, ordered, prompt, Math.max(30_000, remainingMs))
      const generationMs = Date.now() - genStartedAt

      if (expectedTexts.length === 0) {
        resultBuffer = candidate
        textCheckInfo =
          args.track === 'arte'
            ? { textCheck: 'skipped', textCheckReason: 'peça sem texto (capa pura)' }
            : { textCheck: 'skipped', textCheckReason: 'trilha imagem — peça não leva texto' }
        break
      }

      try {
        const checkStartedAt = Date.now()
        const check = await verifyImageTexts(candidate, expectedTexts)
        const checkMs = Date.now() - checkStartedAt
        attemptsLog.push({ attempt, generationMs, checkMs, passed: check.passed, missing: check.missing })
        console.log(
          `[arte-ia.bg] tentativa ${attempt}: geração ${(generationMs / 1000).toFixed(1)}s, checagem ${(checkMs / 1000).toFixed(1)}s → ${check.passed ? 'texto OK' : `divergente (${check.missing.length})`}`,
        )
        if (check.passed) {
          resultBuffer = candidate
          textCheckInfo = { textCheck: 'passed', textCheckAttempts: attemptsLog }
          break
        }
        lastMissing = check.missing
        textCheckInfo = {
          textCheck: 'failed',
          textCheckAttempts: attemptsLog,
          textCheckExtracted: check.extracted.slice(0, 30),
        }
      } catch (visionError) {
        console.warn('[arte-ia.bg] visão indisponível — aplicando sem verificação:', visionError)
        resultBuffer = candidate
        textCheckInfo = {
          textCheck: 'skipped',
          textCheckReason: `visão indisponível: ${visionError instanceof Error ? visionError.message : String(visionError)}`,
          textCheckAttempts: attemptsLog,
        }
        break
      }
    }

    if (!resultBuffer) {
      const sample = lastMissing.slice(0, 3).map((t) => `"${t}"`).join(', ')
      throw new Error(
        `texto divergente após ${attemptsLog.length} tentativa(s): a arte não reproduziu ${sample}${lastMissing.length > 3 ? ` (+${lastMissing.length - 3})` : ''}`,
      )
    }

    // ── Finalização: resize → logo → Blob → backup Drive → Generation ────
    let finalBuffer = await sharp(resultBuffer)
      .resize(args.finalSize.width, args.finalSize.height, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 92 })
      .toBuffer()

    // A logo REAL entra aqui, depois do resize — nunca desenhada pelo modelo.
    // Falha ao compor não derruba a arte: ela sai sem marca e o aviso fica
    // gravado, porque arte sem logo ainda é editável e uma logo inventada não.
    let logoInfo: Record<string, unknown> = { logoComposta: false }
    if (logoParaCompor) {
      try {
        const comLogo = await comporLogo(finalBuffer, logoParaCompor, {
          cornerReservado: LOGO_CORNER,
        })
        finalBuffer = comLogo.buffer
        logoInfo = {
          logoComposta: true,
          logoCanto: comLogo.corner,
          logoMudouDeCanto: comLogo.moveu,
        }
        console.log(
          `[arte-ia.bg] logo oficial composta no canto ${comLogo.corner}` +
            (comLogo.moveu ? ` (o canto reservado ${LOGO_CORNER} estava ocupado)` : ''),
        )
      } catch (logoError) {
        const msg = logoError instanceof Error ? logoError.message : String(logoError)
        console.warn('[arte-ia.bg] composição da logo falhou — arte sai sem marca:', msg)
        logoInfo = { logoComposta: false, logoErro: msg.slice(0, 200) }
      }
    }

    const blob = await put(
      `arte-ia/${args.projectId}/${sanitizeName(args.pedido || args.copy[0] || 'arte')}_${Date.now()}.jpg`,
      finalBuffer,
      { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true },
    )

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
        console.warn('[arte-ia.bg] backup no Drive falhou:', backupError)
      }
    }

    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)
    const baseFieldValues = buildFieldValues(args, {
      prompt,
      promptIssues,
      refsUsadas: ordered.map((r) => ({ role: r.role, label: r.label ?? null })),
      autoAnchorId: autoAnchorUsada,
      elapsedSeconds,
      ...logoInfo,
      ...textCheckInfo,
    })

    await db.generation.update({
      where: { id: args.jobGenerationId },
      data: {
        status: 'COMPLETED',
        resultUrl: blob.url,
        fileName: blob.pathname,
        googleDriveFileId,
        googleDriveBackupUrl,
        completedAt: new Date(),
        fieldValues: baseFieldValues as any,
      },
    })
    console.log(`[arte-ia.bg] concluído em ${elapsedSeconds}s → ${blob.url}`)

    // Dedução DEPOIS do sucesso e não-fatal (regra da casa desde a melhoria).
    try {
      await deductCreditsForFeature({
        clerkUserId: args.actorClerkId,
        feature: args.feature,
        quantity: args.creditQuantity,
        details: {
          generationId: args.jobGenerationId,
          track: args.track,
          model: args.modelo,
          formato: args.formato,
          elapsedSeconds,
        },
        organizationId: args.orgId,
        projectId: args.projectId,
      })
    } catch (deductError) {
      const msg = deductError instanceof Error ? deductError.message : String(deductError)
      console.error(
        `[arte-ia.bg] dedução de créditos FALHOU (generation ${args.jobGenerationId}) — arte segue valendo, acertar à mão:`,
        msg,
      )
      await db.generation
        .update({
          where: { id: args.jobGenerationId },
          data: { fieldValues: { ...baseFieldValues, creditDeductionError: msg.slice(0, 400) } as any },
        })
        .catch(() => null)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[arte-ia.bg] failed:', message)
    await db.generation
      .update({
        where: { id: args.jobGenerationId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          fieldValues: buildFieldValues(args, {
            prompt: promptUsado,
            error: message,
            failedAt: new Date().toISOString(),
            ...textCheckInfo,
          }) as any,
        },
      })
      .catch((updateError) => {
        console.error('[arte-ia.bg] falha ao marcar FAILED:', updateError)
      })
  }
}

/** Uma chamada de geração, roteada pela trilha. */
async function generateOnce(
  args: ArtGenerationJobArgs,
  ordered: LoadedRef[],
  prompt: string,
  timeoutMs: number,
): Promise<Buffer> {
  if (args.track === 'arte') {
    const images: RawEditImage[] = ordered.map((r, i) => ({
      buffer: r.buffer,
      mimeType: r.mimeType,
      name: `${i + 1}-${r.role}.${r.mimeType.includes('png') ? 'png' : 'jpg'}`,
    }))
    return runImageEdit({ images, prompt, size: args.openaiSize, timeoutMs })
  }

  const model = args.modelo === 'nano-banana-pro' ? 'nano-banana-pro' : 'nano-banana-2'
  const result = await generateImageWithGemini({
    model,
    prompt,
    aspectRatio: args.aspectRatio,
    resolution: args.resolution,
    referenceImages: ordered.length > 0 ? ordered.map((r) => r.buffer) : undefined,
    referenceImageTypes: ordered.length > 0 ? ordered.map((r) => r.mimeType) : undefined,
    mode: 'generate',
  })
  return result.imageBuffer
}

/**
 * fieldValues completo da Generation — o REGISTRO ATÔMICO da run
 * {prompt, refs, params, veredito}. Só 2 de 35 runs das skills guardaram o
 * prompt, e foram as únicas que permitiram reconstruir os aprendizados; aqui
 * ele é gravado sempre, no sucesso e na falha.
 */
function buildFieldValues(
  args: ArtGenerationJobArgs,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    source: 'arte-ia',
    track: args.track,
    pedido: args.pedido,
    slotValues: Object.fromEntries(args.copy.map((b, i) => [`bloco${i + 1}`, b])),
    formato: args.formato,
    referencias: args.referencias as unknown as Record<string, unknown>[],
    instrucaoImagem: args.instrucaoImagem,
    model: args.modelo,
    resolution: args.track === 'imagem' ? args.resolution : null,
    inputSize: args.track === 'arte' ? args.openaiSize : null,
    finalSize: `${args.finalSize.width}x${args.finalSize.height}`,
    quality: args.track === 'arte' ? 'high' : null,
    ...extra,
  }
}

/**
 * Sanitização de entrada: EXIF aplicado + teto de dimensão + teto de bytes.
 * PNG é preservado quando pedido (logo precisa do canal alpha — convertê-lo
 * vira retângulo sólido, erro documentado no padrão de produção).
 */
async function sanitizeInput(
  buffer: Buffer,
  maxDim: number,
  { preservePng = false }: { preservePng?: boolean } = {},
): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    const meta = await sharp(buffer).metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    const tooBig = w > maxDim || h > maxDim || buffer.length > MAX_OPENAI_INPUT_BYTES
    if (!tooBig) {
      const mime = meta.format === 'png' ? 'image/png' : meta.format === 'webp' ? 'image/webp' : 'image/jpeg'
      return { buffer, mimeType: mime }
    }
    const pipeline = sharp(buffer)
      .rotate() // EXIF antes do resize, senão a foto pode girar
      .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    if (preservePng && meta.format === 'png') {
      return { buffer: await pipeline.png().toBuffer(), mimeType: 'image/png' }
    }
    return { buffer: await pipeline.jpeg({ quality: 90 }).toBuffer(), mimeType: 'image/jpeg' }
  } catch {
    return { buffer, mimeType: 'image/jpeg' }
  }
}

function sanitizeName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'arte'
  )
}
