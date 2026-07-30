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
import {
  loadExpectedTextsForGeneration,
  verifyImageTexts,
} from '@/lib/ai/creative-text-verification'
import { googleDriveService } from '@/server/google-drive-service'

const MAX_OPENAI_INPUT_BYTES = 4 * 1024 * 1024 // 4MB

// Verificação de texto: até 2 gerações no total (a segunda só quando a
// primeira diverge). O teto da function é 300s; cada geração leva 30–100s e
// cada checagem de visão ~5–15s, então o orçamento fecha — mas é medido a cada
// rodada e a retentativa é PULADA quando não sobra tempo para ela terminar.
const MAX_GENERATION_ATTEMPTS = 2
const BACKGROUND_BUDGET_MS = 290_000
const FINALIZE_RESERVE_MS = 35_000 // resize + blob + drive + updates finais
const MIN_RETRY_BUDGET_MS = 45_000

export interface ImprovementJobArgs {
  jobGenerationId: string
  originalGenerationId: string
  originalResultUrl: string
  applyToPostId: string | null
  userId: string
  orgId?: string
  projectId: number
  projectName: string
  projectGoogleDriveFolderId: string | null
  templateName: string | null | undefined
  userRequest: string
  backgroundImageUrl: string | null
  selectedLogoIds: number[]
  selectedElementIds: number[]
  format: ImprovementFormat
}

interface DownloadResult {
  buffer: Buffer
  mimeType: string
  role: 'primary' | 'background' | 'logo' | 'element'
  label?: string
}

export async function processImprovementInBackground(args: ImprovementJobArgs): Promise<void> {
  const startedAt = Date.now()
  let format = args.format
  let openaiSize = OPENAI_INPUT_SIZE[format]
  let finalSize = FINAL_OUTPUT_SIZE[format]

  // Resultado da verificação de texto — declarado fora do try para o caminho
  // de FAILED também gravar o que foi conferido (auditoria).
  let textCheckInfo: Record<string, unknown> = { textCheck: 'skipped' }

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

    for (const logo of downloads.filter((d) => d.role === 'logo')) {
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

    const downloadMs = Date.now() - startedAt
    console.log(
      `[improve.bg] fase download: ${(downloadMs / 1000).toFixed(1)}s | textos esperados: ${expectedTexts.length}`,
    )

    // Gera e confere. Sem textos esperados (upload externo, export do editor)
    // não há o que comparar: uma geração só, verificação pulada.
    let improvedBuffer: Buffer | null = null
    const attemptsLog: Array<Record<string, unknown>> = []
    let lastMissing: string[] = []

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      const remainingMs = BACKGROUND_BUDGET_MS - FINALIZE_RESERVE_MS - (Date.now() - startedAt)
      if (attempt > 1 && remainingMs < MIN_RETRY_BUDGET_MS) {
        console.warn(
          `[improve.bg] sem orçamento para a tentativa ${attempt} (${Math.round(remainingMs / 1000)}s restantes) — mantendo o resultado divergente como FAILED`,
        )
        break
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
        expectedTexts,
        timeoutMs: Math.max(30_000, remainingMs),
      })
      const generationMs = Date.now() - genStartedAt

      if (expectedTexts.length === 0) {
        improvedBuffer = candidate
        textCheckInfo = { textCheck: 'skipped', textCheckReason: 'sem texto esperado na Generation original' }
        break
      }

      try {
        const checkStartedAt = Date.now()
        const check = await verifyImageTexts(candidate, expectedTexts)
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
          quality: 'high',
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
              quality: 'high',
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

    if (args.applyToPostId) {
      // A melhoria demora ~1min; o post pode ter sido publicado ou despromovido
      // nesse meio-tempo. Só aplica se AINDA estiver aprovado — trocar a mídia
      // de um post POSTING/POSTED mentiria sobre o que foi publicado.
      const updated = await db.socialPost.updateMany({
        where: {
          id: args.applyToPostId,
          projectId: args.projectId,
          status: 'SCHEDULED',
        },
        data: {
          mediaUrls: [blob.url],
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
          `[improve.bg] post ${args.applyToPostId} não estava mais SCHEDULED — arte melhorada ficou só na galeria (${args.jobGenerationId})`,
        )
      } else {
        console.log(`[improve.bg] arte melhorada aplicada ao post ${args.applyToPostId}`)
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
            quality: 'high',
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
