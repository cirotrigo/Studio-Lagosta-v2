/**
 * E2E da verificação de texto pós-melhoria (sessão 30/07/2026).
 *
 * Protocolo de teste em produção (guardrails do plano):
 * - Projeto 8 (Lagosta Criativa), publishType REMINDER (o executor ignora
 *   REMINDER em todas as filas — nada chega ao Zernio), data +7 dias.
 * - 1 melhoria REAL (25 créditos + OpenAI).
 * - Cleanup completo no fim (post + generations + page de teste), inclusive
 *   em caso de erro.
 *
 * Uso: npx dotenv-cli -e .env -- npx tsx scripts/.tmp-test-improve-e2e.ts
 */
import { db } from '@/lib/db'
import { createArteRapida } from '@/lib/creatives/arte-rapida'
import { processImprovementInBackground } from '@/lib/ai/creative-improvement-runner'
import { loadExpectedTextsForGeneration } from '@/lib/ai/creative-text-verification'

const PROJECT_ID = 8
const SOURCE_PAGE_ID = 'cmhwr95300001jp04sltfdhpo' // t24 "Página 8" — 3 camadas de texto
// Clerk id REAL do Ciro (o fluxo de produção usa o usuário autenticado; o
// project.userId é o id interno e NÃO serve para a dedução de créditos).
const CLERK_USER_ID = 'user_3348L5utqkVPHDPW0cTFzGzsLnD'

const SLOT_VALUES: Record<string, string> = {
  // Preço + horário: exatamente os casos que a verificação existe para pegar.
  '174986ca-b897-4b6c-9b13-5a08df376658': 'ALMOÇO EXECUTIVO DA LAGOSTA',
  'dea14e4d-abfb-49b7-bc7a-cddb75457feb': 'Terça a sexta, 11h30 às 14h',
  'c2276b10-bb42-4126-b3bc-96c42c6c0300': 'R$ 49,90 por pessoa',
}

async function main() {
  const cleanup: Array<() => Promise<void>> = []
  let ok = false
  try {
    const project = await db.project.findUniqueOrThrow({
      where: { id: PROJECT_ID },
      select: { id: true, name: true, userId: true, googleDriveFolderId: true },
    })
    console.log(`[e2e] projeto: ${project.name} (user ${project.userId})`)

    // ── Fase 1: arte-rápida real (render local, sem custo de IA) ─────────────
    console.log('[e2e] criando arte-rápida…')
    const arte = await createArteRapida({
      projectId: PROJECT_ID,
      sourcePageId: SOURCE_PAGE_ID,
      slotValues: SLOT_VALUES,
      name: 'E2E verificação de texto — apagar',
    })
    console.log(`[e2e] arte criada: generation=${arte.generationId} page=${arte.pageId} url=${arte.url}`)
    cleanup.push(async () => {
      await db.generation.deleteMany({ where: { id: arte.generationId } })
      await db.page.deleteMany({ where: { id: arte.pageId } })
      console.log('[cleanup] arte-rápida (generation + page) apagada')
    })

    const expected = await loadExpectedTextsForGeneration(arte.generationId)
    console.log('[e2e] textos esperados extraídos:', JSON.stringify(expected))
    if (expected.length !== 3) throw new Error(`esperava 3 textos, veio ${expected.length}`)

    // ── Fase 2: post REMINDER +7 dias (nunca chega ao Zernio) ────────────────
    const scheduled = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const post = await db.socialPost.create({
      data: {
        projectId: PROJECT_ID,
        userId: project.userId,
        postType: 'STORY',
        caption: 'E2E verificação de texto — apagar',
        mediaUrls: [arte.url],
        scheduleType: 'SCHEDULED',
        scheduledDatetime: scheduled,
        status: 'SCHEDULED',
        publishType: 'REMINDER',
        generationId: arte.generationId,
        renderStatus: 'NOT_NEEDED',
      },
    })
    console.log(`[e2e] post de teste: ${post.id} (REMINDER, ${scheduled.toISOString()})`)
    cleanup.push(async () => {
      await db.postLog.deleteMany({ where: { postId: post.id } }).catch(() => null)
      await db.postRetry.deleteMany({ where: { postId: post.id } }).catch(() => null)
      await db.socialPost.deleteMany({ where: { id: post.id } })
      console.log('[cleanup] post de teste (+logs/retries) apagado')
    })

    // ── Fase 3: job de melhoria — o MESMO caminho da rota ────────────────────
    const job = await db.generation.create({
      data: {
        templateId: arte.templateId,
        projectId: PROJECT_ID,
        status: 'PROCESSING',
        fieldValues: {
          source: 'ai_improvement',
          originalGenerationId: arte.generationId,
          userRequest: '',
          applyToPostId: post.id,
          processingStartedAt: new Date().toISOString(),
        },
        templateName: 'E2E verificação — apagar (melhorado)',
        projectName: project.name,
        createdBy: project.userId,
      },
    })
    cleanup.push(async () => {
      await db.generation.deleteMany({ where: { id: job.id } })
      console.log('[cleanup] generation da melhoria apagada')
    })

    console.log(`[e2e] rodando processImprovementInBackground (job ${job.id})…`)
    const t0 = Date.now()
    await processImprovementInBackground({
      jobGenerationId: job.id,
      originalGenerationId: arte.generationId,
      originalResultUrl: arte.url,
      applyToPostId: post.id,
      userId: CLERK_USER_ID,
      projectId: PROJECT_ID,
      projectName: project.name,
      projectGoogleDriveFolderId: project.googleDriveFolderId ?? null,
      templateName: 'E2E verificação — apagar',
      userRequest: '',
      backgroundImageUrl: null,
      selectedLogoIds: [],
      selectedElementIds: [],
      format: 'STORY',
    })
    console.log(`[e2e] runner terminou em ${((Date.now() - t0) / 1000).toFixed(1)}s`)

    // ── Fase 4: asserções ────────────────────────────────────────────────────
    const jobAfter = await db.generation.findUniqueOrThrow({
      where: { id: job.id },
      select: { status: true, resultUrl: true, fieldValues: true },
    })
    const fv = (jobAfter.fieldValues ?? {}) as Record<string, unknown>
    console.log(`[e2e] job status: ${jobAfter.status}`)
    console.log(`[e2e] textCheck: ${fv.textCheck} | attempts: ${JSON.stringify(fv.textCheckAttempts ?? [])}`)
    if (fv.textCheck === 'failed' || jobAfter.status === 'FAILED') {
      console.log(`[e2e] erro registrado: ${fv.error}`)
      console.log(`[e2e] extraído da arte: ${JSON.stringify(fv.textCheckExtracted ?? [])}`)
    }

    const postAfter = await db.socialPost.findUniqueOrThrow({
      where: { id: post.id },
      select: { mediaUrls: true, generationId: true, renderStatus: true, status: true },
    })
    const applied = postAfter.mediaUrls[0] === jobAfter.resultUrl && postAfter.generationId === job.id

    if (jobAfter.status === 'COMPLETED') {
      if (fv.textCheck !== 'passed') throw new Error(`COMPLETED mas textCheck=${fv.textCheck} (esperava passed)`)
      if (!applied) throw new Error('COMPLETED mas a arte não foi aplicada ao post')
      console.log('[e2e] ✅ PASSOU: melhoria verificada e aplicada ao post')
      console.log(`[e2e] arte melhorada: ${jobAfter.resultUrl}`)
    } else if (jobAfter.status === 'FAILED' && fv.textCheck === 'failed') {
      if (applied) throw new Error('FAILED por texto divergente mas a arte FOI aplicada — bug grave')
      if (postAfter.mediaUrls[0] !== arte.url) throw new Error('post não manteve a arte original')
      console.log('[e2e] ✅ PASSOU (caminho de divergência): FAILED e o post manteve a arte original')
    } else {
      throw new Error(`desfecho inesperado: status=${jobAfter.status} textCheck=${fv.textCheck}`)
    }
    ok = true
  } finally {
    console.log('[e2e] cleanup…')
    for (const fn of cleanup.reverse()) {
      await fn().catch((e) => console.error('[cleanup] falhou:', e))
    }
    await db.$disconnect()
    if (!ok) process.exitCode = 1
  }
}

main()
