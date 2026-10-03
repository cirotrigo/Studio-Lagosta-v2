/**
 * Prova de integração da Fase 1 de "Vídeo na agenda" (o vídeo da página vai
 * direto para a agenda, pode ser substituído depois, e o processamento é
 * durável), no BRANCH DE DEV do Neon — Postgres, ffmpeg e Blob de verdade.
 *
 * O que ela prova, com dados criados e apagados por ela (a "Prova da fase" do
 * plano `docs/PLANO-2026-10-03-VIDEO-NA-AGENDA-MOVIMENTO-E-TRANSICOES.md`):
 *  1. página com foto + música; o job com destino AGENDA, processado pelo
 *     caminho real, cria UM post ligado à página (`NOT_NEEDED`, vídeo) — e,
 *     com o job devolvido a PENDING depois do destino (queda simulada antes
 *     de concluir), a repetição não cria post, MP4 nem débito a mais;
 *  2. exportar logo depois de salvar não sai "desatualizado";
 *  3. editar a página: `invalidateScheduledRenders`, `levantarPagina` e a
 *     trava não tocam no post nem na Generation de vídeo — nem na arte de
 *     `post-schedule` que aponta para o vídeo (o risco antigo);
 *  4. substituir troca a mídia; repetir depois da troca (queda antes do fim)
 *     devolve "substituído" sem trocar de novo nem recusar;
 *  5. substituir com `laterPostId` é recusado sem trocar, com o motivo no
 *     histórico do post;
 *  6. mídia trocada na agenda no meio → recusado;
 *  7. vídeo antigo restaurado na agenda no meio → recusado;
 *  8. duas substituições em cadeia, nas duas ordens de chegada → fica a mais nova;
 *  9. post de vídeo com mídia e Generation limpas: a aprovação pela agenda, o
 *     `update-post` do MCP local e o render recusam virar imagem;
 * 10. cobrança com queda simulada depois do commit → um débito só (o débito
 *     repetido é recusado pela marca no mesmo commit).
 *
 * Só roda contra o branch de dev: a guarda por compute E nome de banco de
 * `scripts/lib/destino-da-prova.ts` recusa produção (as URLs de banco saem SÓ
 * do `.env.development.local`). Drive, Zernio, Upstash e Zapier saem do
 * ambiente antes de qualquer módulo do app carregar. Sobe WebM, MP4 e JPG ao
 * Blob de produção e apaga no cleanup; devolve os créditos que os jobs
 * cobraram. Cleanup em passos independentes, e falha dele conta como falha.
 *
 * USO: npx tsx scripts/validar-video-na-agenda.ts [--saida <pasta>]
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync, spawn } from 'node:child_process'
// Módulos puros (sem Prisma e sem env): o cliente de verdade é importado depois de o ambiente apontar para o dev.
import { destinoDaProvaDeDev, type DestinoDaProvaDeDev } from './lib/destino-da-prova'
import { falhasDoCleanup, limparBancoEBlobs, type RegistroDeDescoberta } from './lib/limpeza-de-blobs'

const ROOT = process.cwd()
const FFMPEG = existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg'
const FFPROBE = existsSync('/opt/homebrew/bin/ffprobe') ? '/opt/homebrew/bin/ffprobe' : 'ffprobe'

function parseEnvFile(caminho: string): Record<string, string> {
  if (!existsSync(caminho)) return {}
  const out: Record<string, string> = {}
  for (const linhaCrua of readFileSync(caminho, 'utf8').split('\n')) {
    const linha = linhaCrua.trim()
    if (!linha || linha.startsWith('#')) continue
    const m = linha.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!m) continue
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}
/** Só ANTES de qualquer escrita: depois disso a saída passa pelo cleanup. */
function abortar(titulo: string, linhas: string[] = []): never {
  console.error(`\n✗ ${titulo}\n`)
  for (const l of linhas) console.error(`  ${l}`)
  process.exit(1)
}
function apontarParaODev(): DestinoDaProvaDeDev {
  if (!existsSync(resolve(ROOT, '.env'))) abortar('não há .env aqui para dizer qual compute é PRODUÇÃO.', ['Worktree não herda o .env (gitignored): rode a partir de um checkout que o tenha.'])
  const r = destinoDaProvaDeDev({ prod: parseEnvFile(resolve(ROOT, '.env')), dev: parseEnvFile(resolve(ROOT, '.env.development.local')), processo: process.env })
  if (r.ok === false) abortar(r.titulo, r.linhas)
  Object.assign(process.env, r.destino.ambiente)
  return r.destino
}
const DESTINO = apontarParaODev()
// Nenhum efeito fora do banco de dev e do Blob: sem Drive (o singleton lê o ambiente ao nascer), sem publicador, sem cache.
for (const k of [
  'GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN',
  'LATER_API_KEY', 'LATER_WEBHOOK_SECRET', 'ENABLE_LATER', 'ZERNIO_API_KEY', 'ZAPIER_WEBHOOK_URL',
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'UPSTASH_VECTOR_REST_URL', 'UPSTASH_VECTOR_REST_TOKEN',
  'INSTAGRAM_ACCESS_TOKEN', 'STUDIO_AUTOR',
]) delete process.env[k]

/**
 * O Blob público responde 403 (desafio anti-bot) a leituras repetidas do mesmo
 * IP: cada URL é lida UMA vez e guardada, com nova tentativa espaçada em
 * 403/429/5xx. Só GET no host público; `put`/`list`/`del` vão à API e passam.
 */
const fetchOriginal = globalThis.fetch
const lidosDoBlob = new Map<string, { corpo: ArrayBuffer; tipo: string | null }>()
const BLOB_PUBLICO = /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//
const ESPERAS_DO_BLOB = [20_000, 45_000, 90_000]
function respostaGuardada(g: { corpo: ArrayBuffer; tipo: string | null }): Response {
  return new Response(g.corpo.slice(0), { status: 200, headers: g.tipo ? { 'content-type': g.tipo } : {} })
}
globalThis.fetch = (async (entrada: any, init?: any) => {
  const url: string | undefined = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada?.url
  const metodo = String(init?.method ?? (typeof entrada === 'object' && entrada && 'method' in entrada ? entrada.method : 'GET')).toUpperCase()
  if (metodo !== 'GET' || !url || !BLOB_PUBLICO.test(url)) return fetchOriginal(entrada, init)
  const guardado = lidosDoBlob.get(url)
  if (guardado) return respostaGuardada(guardado)
  for (let i = 0; ; i++) {
    const r = await fetchOriginal(url)
    if (r.ok) {
      const g = { corpo: await r.arrayBuffer(), tipo: r.headers.get('content-type') }
      lidosDoBlob.set(url, g)
      return respostaGuardada(g)
    }
    if (![403, 429, 500, 502, 503, 504].includes(r.status) || i >= ESPERAS_DO_BLOB.length) return r
    console.log(`  … o Blob respondeu ${r.status} — nova tentativa em ${ESPERAS_DO_BLOB[i] / 1000}s`)
    await new Promise((ok) => setTimeout(ok, ESPERAS_DO_BLOB[i]))
  }
}) as typeof fetch

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}
const PROJETO = 8
const MUSICA = 31
const INICIO = new Date()
const SLUG = `prova-video-${INICIO.getTime()}`
const MARCA = `[VIDEO-AGENDA ${INICIO.toISOString()}]`
const SAIDA = resolve(argumento('--saida') ?? join(tmpdir(), `validar-video-na-agenda-${INICIO.getTime()}`))
const LARGURA = 540
const ALTURA = 960
const AUDIO = { source: 'library', musicId: MUSICA, startTime: 0, endTime: 2, volume: 80, fadeIn: false, fadeOut: false, fadeInDuration: 0.5, fadeOutDuration: 0.5 }

let ok = 0
let mau = 0
const registro: Array<{ caso: string; titulo: string; ok: boolean; detalhe: string }> = []
let casoAtual = 'preparo'
function conferir(titulo: string, condicao: boolean, detalhe = '') {
  console.log(`  ${condicao ? '✓' : '✗'} ${titulo}${detalhe ? ` — ${detalhe}` : ''}`)
  registro.push({ caso: casoAtual, titulo, ok: condicao, detalhe })
  if (condicao) ok++
  else mau++
}
async function caso(nome: string, corpo: () => Promise<void>) {
  casoAtual = nome
  console.log(`\n▸ ${nome}`)
  try {
    await corpo()
  } catch (e) {
    conferir('o caso terminou sem exceção', false, (e as Error)?.stack?.split('\n').slice(0, 3).join(' | ') ?? String(e))
  }
}

async function main() {
  mkdirSync(SAIDA, { recursive: true })
  console.log(`Prova "vídeo na agenda" — banco de dev ${DESTINO.compute}, saída em ${SAIDA}`)

  const { db } = await import('../src/lib/db')
  if (process.env.DATABASE_URL !== DESTINO.databaseUrl) abortar('o cliente do banco não nasceu do DATABASE_URL de dev validado.')
  const { put, list, del } = await import('@vercel/blob')
  const { canonicalizeLayersForPersistence } = await import('../src/lib/shape-style')
  const { prepararVideoDaPagina, criarJobDeVideo } = await import('../src/lib/video/enfileirar-video')
  const { processVideoJob, QuedaSimulada, recuperarJobsDeVideoPresos } = await import('../src/lib/video/process-video-job')
  const { decidirRecuperacao, lerVideoDaPagina, MOTIVO_SUBSTITUICAO_NAO_CONCLUIDA, ARRENDAMENTO_DO_VIDEO_MS } = await import(
    '../src/lib/video/destino-do-video'
  )
  const { estadoDoVideoDosPosts } = await import('../src/lib/video/estado-do-video-do-post')
  const { agendarPost } = await import('../src/lib/creatives/agendar')
  const { invalidateScheduledRenders } = await import('../src/lib/posts/invalidate-renders')
  const { levantarPagina, pedirRecomposicaoDaArteCongelada, travarRecomposicaoDaArte } = await import('../src/lib/compositor/recompor')
  const { processarAprovacao } = await import('../src/lib/posts/agenda-acoes')
  const { renderPostArt } = await import('../src/lib/posts/render-post-art')
  const { MOTIVO_VIDEO_REMOVIDO } = await import('../src/lib/posts/post-de-video')
  const { deductCreditsForFeature } = await import('../src/lib/credits/deduct')
  const { CobrancaRecusada, marcarCobrancaNoMesmoCommit } = await import('../src/lib/video/cobranca-do-video')

  // Pré-requisitos, conferidos ANTES da primeira escrita (abortar ainda pode encerrar o processo).
  const projeto = await db.project.findUnique({ where: { id: PROJETO }, select: { id: true, name: true, userId: true, instagramAccountId: true } })
  if (!projeto?.instagramAccountId) abortar(`o projeto ${PROJETO} não existe no dev ou não tem conta do Instagram (a aprovação precisa dela).`)
  const dono = await db.user.findUnique({ where: { id: projeto.userId }, select: { id: true, clerkId: true } })
  if (!dono?.clerkId) abortar('o dono do projeto não tem clerkId no dev (a cobrança do vídeo é por ele).')
  const musica = await db.musicLibrary.findUnique({ where: { id: MUSICA }, select: { id: true } })
  if (!musica) abortar(`a música ${MUSICA} não existe no dev.`)
  const saldoDe = async () => (await db.creditBalance.findUnique({ where: { userId: dono.id }, select: { creditsRemaining: true } }))?.creditsRemaining ?? null
  const saldoInicial = await saldoDe()
  if (saldoInicial === null || saldoInicial < 200) abortar(`o dono do projeto ${PROJETO} tem ${saldoInicial ?? 'nenhum'} crédito no dev (a prova cobra ~100 e devolve).`)

  // O que a rodada cria — cada id entra AQUI logo depois da chamada que o criou.
  const blobs = new Set<string>()
  const posts = new Set<string>()
  const jobs: string[] = []
  const gens: string[] = []
  let templateId: number | null = null
  let pageId: string | null = null

  try {
    // ── Preparo: o WebM gravado, a miniatura, o template e a página ──────────
    const webmLocal = join(SAIDA, 'entrada.webm')
    const thumbLocal = join(SAIDA, 'miniatura.jpg')
    execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=${LARGURA}x${ALTURA}:rate=30`, '-t', '2', '-c:v', 'libvpx-vp9', '-b:v', '500k', '-an', webmLocal])
    execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=${LARGURA}x${ALTURA}`, '-frames:v', '1', thumbLocal])
    const bytesDoWebm = readFileSync(webmLocal)
    const webm = await put(`provas/${SLUG}/entrada.webm`, bytesDoWebm, { access: 'public', contentType: 'video/webm', addRandomSuffix: true })
    blobs.add(webm.url)
    const thumb = await put(`provas/${SLUG}/miniatura.jpg`, readFileSync(thumbLocal), { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true })
    blobs.add(thumb.url)

    const template = await db.template.create({
      data: { name: `${MARCA} vídeo na agenda`, type: 'STORY', dimensions: `${LARGURA}x${ALTURA}`, designData: {}, projectId: PROJETO, createdBy: dono.clerkId },
    })
    templateId = template.id
    const camadas = (texto: string) =>
      canonicalizeLayersForPersistence([
        { id: 'foto', type: 'image', name: 'Foto', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: LARGURA, height: ALTURA }, fileUrl: thumb.url },
        {
          id: 'titulo', type: 'text', name: 'Título', visible: true, locked: false, order: 1, content: texto,
          position: { x: 40, y: 120 }, size: { width: 460, height: 80 },
          style: { fontSize: 48, fontFamily: 'Arial', fontWeight: '700', color: '#FFFFFF', textAlign: 'left', lineHeight: 1.1 },
          textboxConfig: { textMode: 'auto-wrap-fixed', autoWrap: { lineHeight: 1.1, breakMode: 'word', autoExpand: false } },
        },
      ])
    const pagina = await db.page.create({
      data: { name: `${MARCA} página`, width: LARGURA, height: ALTURA, layers: camadas('Vídeo da prova') as any, background: '#000000', audio: AUDIO as any, order: 0, templateId: template.id },
    })
    pageId = pagina.id

    /** O `designData` que a gravação do editor levaria à fila: a página como está no banco. */
    const designDaPagina = async () => {
      const p = await db.page.findUniqueOrThrow({ where: { id: pagina.id }, select: { width: true, height: true, background: true, layers: true, audio: true } })
      return { canvas: { width: p.width, height: p.height, backgroundColor: p.background }, layers: p.layers, audio: p.audio }
    }
    /** As duas funções da rota de fila, na mesma ordem (a rota cuida do login, do upload e dos créditos). */
    let pedidosFeitos = 0
    const enfileirar = async (destino: any, rotulo: string) => {
      const n = ++pedidosFeitos
      const designData = await designDaPagina()
      const prep = await prepararVideoDaPagina({ projectId: PROJETO, templateId: template.id, pageId: pagina.id, destino, designData, videoWidth: LARGURA, videoHeight: ALTURA })
      if (prep.ok === false) throw new Error(`a fila recusou (${rotulo}): ${prep.status} ${prep.error}`)
      const r = await criarJobDeVideo({
        user: { id: dono.id }, clerkUserId: dono.clerkId, orgId: null, project: { id: PROJETO, name: projeto.name },
        templateId: template.id, videoName: `${SLUG}-${n}`, videoDuration: 2, videoWidth: LARGURA, videoHeight: ALTURA,
        webmBlobUrl: webm.url, webmFileSize: bytesDoWebm.length, thumbnailUrl: thumb.url, designData, audioConfig: AUDIO as any,
        videoDaPagina: prep.videoDaPagina,
      })
      jobs.push(r.jobId)
      gens.push(r.generationId)
      return r
    }
    const queda = (onde: string) => () => {
      throw new QuedaSimulada(onde)
    }
    /** A recuperação do job preso: a decisão pura e o compare-and-set no `startedAt` (o que o cron faz). */
    const devolverAFila = async (jobId: string) => {
      const j = await db.videoProcessingJob.findUniqueOrThrow({ where: { id: jobId }, select: { status: true, startedAt: true, attempts: true, mp4ResultUrl: true, creditsDeducted: true } })
      const decisao = decidirRecuperacao({ attempts: j.attempts, videoPronto: !!j.mp4ResultUrl && j.creditsDeducted })
      conferir('a recuperação devolve o job à fila', j.status === 'PROCESSING' && decisao === 'devolver', `${j.status}, tentativa ${j.attempts}, ${decisao}`)
      const r = await db.videoProcessingJob.updateMany({ where: { id: jobId, status: 'PROCESSING', startedAt: j.startedAt }, data: { status: 'PENDING' } })
      conferir('devolvido por compare-and-set no startedAt', r.count === 1)
    }
    const debitosDo = async (jobId: string) => {
      const linhas = await db.usageHistory.findMany({ where: { userId: dono.id, timestamp: { gte: INICIO } }, select: { creditsUsed: true, details: true } })
      return linhas.filter((l) => (l.details as any)?.jobId === jobId)
    }
    const doJob = (jobId: string) =>
      db.videoProcessingJob.findUniqueOrThrow({ where: { id: jobId }, select: { status: true, attempts: true, mp4ResultUrl: true, thumbnailUrl: true, creditsDeducted: true, startedAt: true } })
    const resultadoDe = async (generationId: string) =>
      lerVideoDaPagina((await db.generation.findUniqueOrThrow({ where: { id: generationId }, select: { fieldValues: true } })).fieldValues)?.resultado ?? null
    const doPost = (postId: string) =>
      db.socialPost.findUniqueOrThrow({
        where: { id: postId },
        select: { id: true, pageId: true, templateId: true, generationId: true, mediaUrls: true, status: true, postType: true, renderStatus: true, videoDaPagina: true, laterPostId: true, updatedAt: true, createdAt: true },
      })
    /** O estado do vídeo do post principal como a agenda o lê. */
    const estadoDoPrincipal = async (generationId: string) => {
      const p = await doPost(principalId)
      return (await estadoDoVideoDosPosts(PROJETO, [{ id: p.id, pageId: pagina.id, generationId, createdAt: p.createdAt }])).get(p.id)
    }
    const historicoDaTroca = async (postId: string) => {
      const logs = await db.postLog.findMany({ where: { postId }, select: { message: true, metadata: true } })
      const da = (estado: string) => logs.filter((l) => (l.metadata as any)?.substituicaoDeVideo === estado)
      return { feitas: da('feita'), recusadas: da('recusada') }
    }
    const exportsDoBlob = async (prefixo: string, sufixo: string) => {
      const achados: string[] = []
      let cursor: string | undefined
      do {
        const pagina = await list({ prefix: prefixo, cursor, limit: 1000 })
        for (const b of pagina.blobs) if (b.pathname.endsWith(sufixo)) achados.push(b.url)
        cursor = pagina.hasMore ? pagina.cursor : undefined
      } while (cursor)
      return achados
    }

    let principalId = ''
    let primeiroJob = { jobId: '', generationId: '' }

    // ── 1. Destino agenda pelo caminho real; repetição depois do destino ─────
    await caso('1. vídeo direto para a agenda, e a repetição depois do destino', async () => {
      const quando = new Date(INICIO.getTime() + 30 * 86_400_000)
      quando.setUTCSeconds(0, 0)
      const j = await enfileirar({ tipo: 'agenda', quando: quando.toISOString(), postType: 'STORY', situacao: 'agendado' }, 'agenda')
      primeiroJob = j
      conferir('exportar logo depois de salvar não sai "desatualizado" (versão gravada = a do banco)', j.videoDaPagina?.divergiuNaGravacao === false)
      const r1 = await processVideoJob(j.jobId, { antesDeConcluir: queda('antes de concluir o job') })
      conferir('1ª execução interrompida DEPOIS do destino', r1.outcome === 'interrompido', JSON.stringify(r1))
      const job1 = await doJob(j.jobId)
      const doVideo = await db.socialPost.findMany({ where: { projectId: PROJETO, generationId: j.generationId }, select: { id: true } })
      for (const p of doVideo) posts.add(p.id)
      conferir('o destino criou UM post', doVideo.length === 1, `${doVideo.length}`)
      const post = await doPost(doVideo[0].id)
      principalId = post.id
      conferir('o post está ligado à página e ao template', post.pageId === pagina.id && post.templateId === template.id)
      conferir('o post é de vídeo e fora do render (NOT_NEEDED)', post.videoDaPagina === true && post.renderStatus === 'NOT_NEEDED', `${post.videoDaPagina} ${post.renderStatus}`)
      conferir('a mídia é o MP4 do job', post.mediaUrls.length === 1 && post.mediaUrls[0] === job1.mp4ResultUrl)
      conferir('story agendado', post.postType === 'STORY' && post.status === 'SCHEDULED', `${post.postType} ${post.status}`)
      const gen = await db.generation.findUniqueOrThrow({ where: { id: j.generationId }, select: { status: true, resultUrl: true, fieldValues: true } })
      const fv = gen.fieldValues as Record<string, unknown>
      conferir('a Generation do vídeo está pronta com o MP4', gen.status === 'COMPLETED' && gen.resultUrl === job1.mp4ResultUrl)
      conferir('videoDaPagina.postId aponta o post', lerVideoDaPagina(fv)?.postId === post.id)
      conferir('a Generation de vídeo NÃO grava fieldValues.pageId', fv.pageId === undefined)
      conferir(
        'o progresso é gravado sob o arrendamento (o UPDATE condicionado casa no banco real)',
        fv.processingStartedAt === job1.startedAt?.toISOString() && fv.progress === 100,
        `${fv.processingStartedAt} × ${job1.startedAt?.toISOString()} · progresso ${fv.progress}`,
      )
      conferir('um débito', (await debitosDo(j.jobId)).length === 1)
      // O MP4 de verdade: dimensões da página e a trilha da música.
      const mp4Local = join(SAIDA, 'job-1.mp4')
      writeFileSync(mp4Local, Buffer.from(await (await fetch(job1.mp4ResultUrl!)).arrayBuffer()))
      const sondagem = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-of', 'json', mp4Local]).toString())
      const fluxos: Array<{ codec_type: string; width?: number; height?: number }> = sondagem.streams ?? []
      const video = fluxos.find((s) => s.codec_type === 'video')
      conferir('o MP4 tem a música', fluxos.some((s) => s.codec_type === 'audio'))
      conferir(`o MP4 tem ${LARGURA}x${ALTURA}`, video?.width === LARGURA && video?.height === ALTURA, `${video?.width}x${video?.height}`)

      await devolverAFila(j.jobId)
      const r2 = await processVideoJob(j.jobId)
      conferir('a repetição conclui', r2.outcome === 'completed', JSON.stringify(r2))
      const job2 = await doJob(j.jobId)
      const doVideo2 = await db.socialPost.findMany({ where: { projectId: PROJETO, OR: [{ generationId: j.generationId }, { pageId: pagina.id }] }, select: { id: true } })
      for (const p of doVideo2) posts.add(p.id)
      conferir('nenhum post a mais', doVideo2.length === 1, `${doVideo2.length}`)
      conferir('o mesmo MP4', job2.mp4ResultUrl === job1.mp4ResultUrl && (await doPost(post.id)).mediaUrls[0] === job1.mp4ResultUrl)
      conferir('nenhum débito a mais', (await debitosDo(j.jobId)).length === 1)
      conferir('o job concluiu na 2ª tentativa', job2.status === 'COMPLETED' && job2.attempts === 2, `${job2.status} ${job2.attempts}`)
      const mp4s = await exportsDoBlob(`video-exports/${dono.clerkId}/`, `-${SLUG}-1.mp4`)
      for (const u of mp4s) blobs.add(u)
      conferir('nenhum MP4 a mais no Blob', mp4s.length === 1, `${mp4s.length}`)
    })

    // ── 2. O vídeo recém-exportado não está desatualizado ───────────────────
    await caso('2. exportar logo depois de salvar não sai "desatualizado"', async () => {
      const estado = await estadoDoPrincipal(primeiroJob.generationId)
      conferir('videoDesatualizado é falso', estado?.videoDesatualizado === false, JSON.stringify(estado))
    })

    // ── 3. Editar a página não toca o vídeo ─────────────────────────────────
    await caso('3. editar a página: invalidação, levantamento e trava não tocam o vídeo', async () => {
      // O risco antigo: post de VÍDEO com página e sem Generation — o catálogo cria a arte
      // `post-schedule` com `fieldValues.pageId` e o vídeo como `resultUrl`.
      const quando = new Date(INICIO.getTime() + 31 * 86_400_000)
      quando.setUTCSeconds(0, 0)
      const perigo = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: quando.toISOString(), pageId: pagina.id, mediaUrls: [webm.url], situacao: 'rascunho', caption: MARCA })
      posts.add(perigo.postId)
      let artePerigosa = await db.generation.findFirst({ where: { projectId: PROJETO, resultUrl: webm.url, fieldValues: { path: ['pageId'], equals: pagina.id } }, select: { id: true } })
      if (!artePerigosa) {
        // O catálogo não a criou nesta versão: a linha antiga é montada como `ensurePostGeneration` a montava.
        artePerigosa = await db.generation.create({
          data: { status: 'COMPLETED', templateId: template.id, projectId: PROJETO, createdBy: projeto.userId, resultUrl: webm.url, fieldValues: { source: 'post-schedule', postId: perigo.postId, pageId: pagina.id } as any },
          select: { id: true },
        })
      }
      gens.push(artePerigosa.id)
      // Como uma linha de antes da marca: RENDERED e sem `videoDaPagina`.
      await db.socialPost.update({ where: { id: perigo.postId }, data: { renderStatus: 'RENDERED', videoDaPagina: false } })

      const ids = [principalId, perigo.postId]
      const postsAntes = await Promise.all(ids.map(doPost))
      const artesAntes = await db.generation.findMany({ where: { id: { in: [primeiroJob.generationId, artePerigosa.id] } }, select: { id: true, status: true, resultUrl: true, fieldValues: true } })

      await db.page.update({ where: { id: pagina.id }, data: { layers: camadas('Vídeo da prova editado') as any } })
      const inv = await invalidateScheduledRenders(db, { pageIds: [pagina.id] })
      conferir('a invalidação não devolve post de vídeo à fila de render', inv.invalidados === 0, JSON.stringify(inv))
      const lev = await levantarPagina(pagina.id)
      conferir('levantarPagina não toma o vídeo por arte da página', lev !== null && lev.arte === null && lev.slides.length === 0 && lev.congelados.length === 0, JSON.stringify({ arte: lev?.arte?.generationId ?? null, slides: lev?.slides.length, congelados: lev?.congelados.length }))
      const pedidos = await pedirRecomposicaoDaArteCongelada([pagina.id])
      conferir('nenhuma recomposição pedida', pedidos.length === 0, JSON.stringify(pedidos))
      const travou = await travarRecomposicaoDaArte(pagina.id, 'prova do vídeo na agenda', { projectId: PROJETO })
      conferir('a trava não pega a arte de vídeo', travou === false)

      const postsDepois = await Promise.all(ids.map(doPost))
      const iguais = postsAntes.every((a, i) => {
        const d = postsDepois[i]
        return JSON.stringify(a.mediaUrls) === JSON.stringify(d.mediaUrls) && a.renderStatus === d.renderStatus && a.generationId === d.generationId && a.updatedAt.getTime() === d.updatedAt.getTime()
      })
      conferir('os dois posts ficaram como estavam (mídia, render, Generation, revisão)', iguais)
      const artesDepois = await db.generation.findMany({ where: { id: { in: [primeiroJob.generationId, artePerigosa.id] } }, select: { id: true, status: true, resultUrl: true, fieldValues: true } })
      const porId = new Map(artesDepois.map((g) => [g.id, g]))
      conferir(
        'a Generation de vídeo e a arte post-schedule ficaram como estavam, sem trava',
        artesAntes.every((a) => {
          const d = porId.get(a.id)
          return !!d && d.status === a.status && d.resultUrl === a.resultUrl && JSON.stringify(d.fieldValues) === JSON.stringify(a.fieldValues) && (d.fieldValues as any)?.somenteReRender === undefined
        }),
      )
      conferir('nenhum job de recomposição', (await db.generationJob.count({ where: { generationId: { in: gens } } })) === 0)
      const estado = await estadoDoPrincipal(primeiroJob.generationId)
      conferir('agora o vídeo da agenda está desatualizado', estado?.videoDesatualizado === true)
    })

    // ── 4. Substituir; a repetição depois da troca ──────────────────────────
    await caso('4. substituir troca a mídia; repetir depois da troca devolve "substituído"', async () => {
      const antes = await doPost(principalId)
      const j = await enfileirar({ tipo: 'substituir', postId: principalId }, 'substituir')
      conferir('o pedido guarda o post como estava', j.videoDaPagina?.esperado?.revisao === antes.updatedAt.toISOString())
      const r1 = await processVideoJob(j.jobId, { antesDeConcluir: queda('antes de concluir a substituição') })
      conferir('1ª execução interrompida depois da troca', r1.outcome === 'interrompido', JSON.stringify(r1))
      const novo = (await doJob(j.jobId)).mp4ResultUrl
      const depois1 = await doPost(principalId)
      conferir('a mídia virou o vídeo novo', depois1.mediaUrls.length === 1 && depois1.mediaUrls[0] === novo && depois1.generationId === j.generationId)
      conferir('o post continua de vídeo e fora do render', depois1.videoDaPagina === true && depois1.renderStatus === 'NOT_NEEDED')
      const h1 = await historicoDaTroca(principalId)
      conferir('um registro de troca no histórico', h1.feitas.length === 1 && h1.recusadas.length === 0, `${h1.feitas.length}/${h1.recusadas.length}`)
      await devolverAFila(j.jobId)
      const r2 = await processVideoJob(j.jobId)
      conferir('a repetição conclui', r2.outcome === 'completed', JSON.stringify(r2))
      const depois2 = await doPost(principalId)
      conferir('a repetição não troca de novo', depois2.updatedAt.getTime() === depois1.updatedAt.getTime() && depois2.mediaUrls[0] === novo)
      const h2 = await historicoDaTroca(principalId)
      conferir('nem troca nem recusa a mais no histórico', h2.feitas.length === 1 && h2.recusadas.length === 0, `${h2.feitas.length}/${h2.recusadas.length}`)
      conferir('o desfecho é "substituído"', (await resultadoDe(j.generationId))?.ok === true)
      conferir('um débito', (await debitosDo(j.jobId)).length === 1)
      const estado = await estadoDoPrincipal(depois2.generationId)
      conferir('a agenda mostra "feita" e o vídeo em dia', estado?.substituicao?.estado === 'feita' && estado.videoDesatualizado === false, JSON.stringify(estado))
    })

    // ── 5. Post já entregue ao publicador ───────────────────────────────────
    await caso('5. substituir com laterPostId é recusado, com o motivo no histórico', async () => {
      const j = await enfileirar({ tipo: 'substituir', postId: principalId }, 'substituir entregue')
      await db.socialPost.update({ where: { id: principalId }, data: { laterPostId: `${SLUG}-entregue` } })
      const antes = await doPost(principalId)
      try {
        const r = await processVideoJob(j.jobId)
        conferir('o job conclui', r.outcome === 'completed', JSON.stringify(r))
        const resultado = await resultadoDe(j.generationId)
        conferir('recusado: o post foi entregue para publicar', resultado?.ok === false && /entregue para publicar/.test((resultado as any).motivo), JSON.stringify(resultado))
        const depois = await doPost(principalId)
        conferir('a mídia ficou', JSON.stringify(depois.mediaUrls) === JSON.stringify(antes.mediaUrls) && depois.updatedAt.getTime() === antes.updatedAt.getTime())
        const h = await historicoDaTroca(principalId)
        conferir('o motivo está no histórico do post', h.recusadas.length === 1 && /entregue para publicar/.test(h.recusadas[0].message), h.recusadas[0]?.message ?? '')
      } finally {
        await db.socialPost.update({ where: { id: principalId }, data: { laterPostId: null } })
      }
    })

    // ── 6 e 7. Mudança feita na agenda no meio ──────────────────────────────
    await caso('6. mídia trocada na agenda no meio é recusado', async () => {
      const j = await enfileirar({ tipo: 'substituir', postId: principalId }, 'substituir com mídia trocada')
      const original = (await doPost(principalId)).mediaUrls
      await db.socialPost.update({ where: { id: principalId }, data: { mediaUrls: [webm.url] } })
      try {
        const r = await processVideoJob(j.jobId)
        conferir('o job conclui', r.outcome === 'completed', JSON.stringify(r))
        const resultado = await resultadoDe(j.generationId)
        conferir('recusado: a mudança da agenda foi mantida', resultado?.ok === false && /mudado na agenda/.test((resultado as any).motivo), JSON.stringify(resultado))
        conferir('a mídia da agenda ficou', JSON.stringify((await doPost(principalId)).mediaUrls) === JSON.stringify([webm.url]))
      } finally {
        await db.socialPost.update({ where: { id: principalId }, data: { mediaUrls: original } })
      }
    })
    await caso('7. vídeo antigo restaurado na agenda no meio é recusado', async () => {
      const j = await enfileirar({ tipo: 'substituir', postId: principalId }, 'substituir com restauração')
      const original = (await doPost(principalId)).mediaUrls
      await db.socialPost.update({ where: { id: principalId }, data: { mediaUrls: [webm.url] } })
      await db.socialPost.update({ where: { id: principalId }, data: { mediaUrls: original } })
      const r = await processVideoJob(j.jobId)
      conferir('o job conclui', r.outcome === 'completed', JSON.stringify(r))
      const resultado = await resultadoDe(j.generationId)
      conferir('recusado, mesmo com a mídia igual à do pedido', resultado?.ok === false && /mudado na agenda/.test((resultado as any).motivo), JSON.stringify(resultado))
      conferir('a mídia restaurada ficou', JSON.stringify((await doPost(principalId)).mediaUrls) === JSON.stringify(original))
    })

    // ── 8. Cadeia de substituições, nas duas ordens ─────────────────────────
    await caso('8. duas substituições em cadeia: fica a mais nova nas duas ordens', async () => {
      const a = await enfileirar({ tipo: 'substituir', postId: principalId }, 'cadeia A')
      const b = await enfileirar({ tipo: 'substituir', postId: principalId }, 'cadeia B')
      conferir('B conhece A como anterior', (b.videoDaPagina?.predecessoras ?? []).includes(a.generationId))
      conferir('A conclui (chega primeiro)', (await processVideoJob(a.jobId)).outcome === 'completed')
      conferir('B conclui (chega depois)', (await processVideoJob(b.jobId)).outcome === 'completed')
      conferir('A trocou e B trocou por cima', (await resultadoDe(a.generationId))?.ok === true && (await resultadoDe(b.generationId))?.ok === true)
      const mp4B = (await doJob(b.jobId)).mp4ResultUrl
      const depoisAB = await doPost(principalId)
      conferir('ficou o vídeo de B', depoisAB.mediaUrls[0] === mp4B && depoisAB.generationId === b.generationId)

      const a2 = await enfileirar({ tipo: 'substituir', postId: principalId }, "cadeia A'")
      const b2 = await enfileirar({ tipo: 'substituir', postId: principalId }, "cadeia B'")
      conferir("B' conhece A' como anterior", (b2.videoDaPagina?.predecessoras ?? []).includes(a2.generationId))
      conferir("B' conclui (chega primeiro)", (await processVideoJob(b2.jobId)).outcome === 'completed')
      conferir("A' conclui (chega depois)", (await processVideoJob(a2.jobId)).outcome === 'completed')
      conferir("B' trocou e A' foi recusado", (await resultadoDe(b2.generationId))?.ok === true && (await resultadoDe(a2.generationId))?.ok === false)
      const mp4B2 = (await doJob(b2.jobId)).mp4ResultUrl
      const depoisB2A2 = await doPost(principalId)
      conferir("ficou o vídeo de B'", depoisB2A2.mediaUrls[0] === mp4B2 && depoisB2A2.generationId === b2.generationId)
    })

    // ── 8b. Dois pedidos de troca AO MESMO TEMPO (achado 4) ─────────────────
    await caso('8b. dois pedidos de troca ao mesmo tempo: um conhece o outro, e fica o mais novo', async () => {
      const [x, y] = await Promise.all([
        enfileirar({ tipo: 'substituir', postId: principalId }, 'simultâneo X'),
        enfileirar({ tipo: 'substituir', postId: principalId }, 'simultâneo Y'),
      ])
      const px = x.videoDaPagina?.predecessoras ?? []
      const py = y.videoDaPagina?.predecessoras ?? []
      conferir(
        'com o post travado no commit do pedido, exatamente um conhece o outro',
        px.length + py.length === 1 && px.includes(y.generationId) !== py.includes(x.generationId),
        JSON.stringify({ px, py }),
      )
      const [velho, novo] = py.includes(x.generationId) ? [x, y] : [y, x]
      // A fila processa o mais NOVO primeiro: o velho, chegando depois, não pode desfazer a troca.
      conferir('o mais novo conclui (chega primeiro)', (await processVideoJob(novo.jobId)).outcome === 'completed')
      conferir('o mais velho conclui (chega depois)', (await processVideoJob(velho.jobId)).outcome === 'completed')
      conferir(
        'o novo trocou e o velho foi recusado',
        (await resultadoDe(novo.generationId))?.ok === true && (await resultadoDe(velho.generationId))?.ok === false,
      )
      conferir('ficou o vídeo do mais novo', (await doPost(principalId)).mediaUrls[0] === (await doJob(novo.jobId)).mp4ResultUrl)
    })

    // ── 8c. Troca que esgota as tentativas (achado 9) ───────────────────────
    await caso('8c. troca que esgota as tentativas: a recuperação grava o desfecho E o histórico do post', async () => {
      const antes = await doPost(principalId)
      const recusadasAntes = (await historicoDaTroca(principalId)).recusadas.length
      const j = await enfileirar({ tipo: 'substituir', postId: principalId }, 'troca que esgota')
      const r1 = await processVideoJob(j.jobId, { depoisDeCobrar: queda('depois de cobrar, antes da troca') })
      conferir('1ª execução interrompida antes da troca', r1.outcome === 'interrompido', JSON.stringify(r1))
      // A 2ª tentativa também presa: tentativas esgotadas e o arrendamento vencido. Num passado
      // remoto, para a varredura da recuperação não alcançar nenhum job de fora da prova.
      const presoEm = new Date('2000-01-01T00:00:00Z')
      await db.videoProcessingJob.update({ where: { id: j.jobId }, data: { attempts: 2, startedAt: presoEm } })
      const placar = await recuperarJobsDeVideoPresos(new Date(presoEm.getTime() + ARRENDAMENTO_DO_VIDEO_MS + 60_000))
      conferir('a recuperação conclui só este job', placar.concluidos === 1 && placar.devolvidos === 0 && placar.falhados === 0, JSON.stringify(placar))
      const resultado = await resultadoDe(j.generationId)
      conferir(
        'o desfecho é a troca não concluída',
        resultado?.ok === false && (resultado as any).motivo === MOTIVO_SUBSTITUICAO_NAO_CONCLUIDA,
        JSON.stringify(resultado),
      )
      const h = await historicoDaTroca(principalId)
      conferir(
        'o motivo está no histórico do post',
        h.recusadas.length === recusadasAntes + 1 && h.recusadas.some((l) => l.message.includes(MOTIVO_SUBSTITUICAO_NAO_CONCLUIDA)),
        `${recusadasAntes} → ${h.recusadas.length}`,
      )
      conferir('a mídia do post ficou', JSON.stringify((await doPost(principalId)).mediaUrls) === JSON.stringify(antes.mediaUrls))
      const job = await doJob(j.jobId)
      conferir('o job concluiu, cobrado uma vez', job.status === 'COMPLETED' && (await debitosDo(j.jobId)).length === 1, job.status)
    })

    // ── 9. Mídia e Generation limpas: nenhuma porta vira imagem ─────────────
    await caso('9. post de vídeo com mídia e Generation limpas não vira imagem', async () => {
      await db.socialPost.update({ where: { id: principalId }, data: { status: 'DRAFT', mediaUrls: [], generationId: null, renderStatus: 'NOT_NEEDED' } })
      const ap = await processarAprovacao({ projectId: PROJETO, postIds: [principalId], action: 'APPROVE' })
      conferir(
        'a aprovação pela agenda recusa com o motivo',
        !ap.processados.includes(principalId) && ap.ignorados.some((i) => i.postId === principalId && i.motivo === MOTIVO_VIDEO_REMOVIDO),
        JSON.stringify({ processados: ap.processados, ignorados: ap.ignorados }),
      )
      const depoisDaAprovacao = await doPost(principalId)
      conferir('continua rascunho, sem mídia e fora do render', depoisDaAprovacao.status === 'DRAFT' && depoisDaAprovacao.mediaUrls.length === 0 && depoisDaAprovacao.renderStatus === 'NOT_NEEDED')

      const mcp = await chamarUpdatePostNoMcpLocal(principalId)
      conferir('o update-post do MCP local recusa com o motivo', mcp.isError && mcp.texto.includes(MOTIVO_VIDEO_REMOVIDO), mcp.texto.slice(0, 200))
      const depoisDoMcp = await doPost(principalId)
      conferir('nada foi alterado pelo MCP', depoisDoMcp.status === 'DRAFT' && depoisDoMcp.updatedAt.getTime() === depoisDaAprovacao.updatedAt.getTime())

      await db.socialPost.update({ where: { id: principalId }, data: { renderStatus: 'PENDING' } })
      const render = await renderPostArt({ id: principalId, pageId: pagina.id, slotValues: null, renderAttempts: 0 })
      conferir('o render recusa desenhar a página no lugar do vídeo', render.ok === false && render.motivo === 'video-removido', JSON.stringify(render))
      const depoisDoRender = await doPost(principalId)
      conferir('o post sai da fila com o motivo, sem imagem', depoisDoRender.renderStatus === 'RENDER_FAILED' && depoisDoRender.mediaUrls.length === 0)
    })

    // ── 10. Queda depois da cobrança ────────────────────────────────────────
    await caso('10. cobrança com queda depois do commit: um débito só', async () => {
      const j = await enfileirar({ tipo: 'galeria' }, 'galeria')
      const r1 = await processVideoJob(j.jobId, { depoisDeCobrar: queda('depois de cobrar') })
      conferir('1ª execução interrompida depois de cobrar', r1.outcome === 'interrompido', JSON.stringify(r1))
      const job = await doJob(j.jobId)
      conferir('a marca da cobrança está gravada', job.creditsDeducted === true && job.status === 'PROCESSING')
      conferir('um débito', (await debitosDo(j.jobId)).length === 1)
      const saldoAntes = await saldoDe()
      let recusada = false
      try {
        await deductCreditsForFeature({
          clerkUserId: dono.clerkId, feature: 'video_export', details: { jobId: j.jobId, prova: SLUG }, projectId: PROJETO,
          noMesmoCommit: marcarCobrancaNoMesmoCommit(j.jobId, job.startedAt!),
        })
      } catch (e) {
        recusada = e instanceof CobrancaRecusada || (e as Error)?.name === 'CobrancaRecusada'
      }
      conferir('o débito repetido é recusado pela marca no mesmo commit', recusada)
      conferir('o débito recusado foi desfeito (histórico e saldo)', (await debitosDo(j.jobId)).length === 1 && (await saldoDe()) === saldoAntes)
      await devolverAFila(j.jobId)
      conferir('a repetição conclui', (await processVideoJob(j.jobId)).outcome === 'completed')
      conferir('continua um débito só', (await debitosDo(j.jobId)).length === 1)
    })

    // ── 11. Cobrança ambígua (achado 1) ─────────────────────────────────────
    await caso('11. cobrança ambígua: o débito confirmado pela marca não falha o job; sem a marca, o job volta à fila', async () => {
      const j = await enfileirar({ tipo: 'galeria' }, 'galeria, débito com a resposta perdida')
      const r = await processVideoJob(j.jobId, {
        cobrar: async (debitar) => {
          await debitar()
          throw new Error('a conexão caiu depois do commit do débito (simulada)')
        },
      })
      conferir('o job conclui: a marca relida confirma a cobrança', r.outcome === 'completed', JSON.stringify(r))
      const job = await doJob(j.jobId)
      conferir('um débito, com a marca gravada', (await debitosDo(j.jobId)).length === 1 && job.creditsDeducted === true)

      const k = await enfileirar({ tipo: 'galeria' }, 'galeria, cobrança incerta')
      const saldoAntes = await saldoDe()
      const r1 = await processVideoJob(k.jobId, {
        cobrar: async () => {
          throw new Error('a conexão caiu antes do commit (simulada)')
        },
      })
      conferir('sem a marca, a cobrança é incerta: o job é interrompido, não falha', r1.outcome === 'interrompido', JSON.stringify(r1))
      const kj = await doJob(k.jobId)
      conferir(
        'nada cobrado, e o job segue recuperável',
        kj.status === 'PROCESSING' && kj.creditsDeducted === false && (await debitosDo(k.jobId)).length === 0 && (await saldoDe()) === saldoAntes,
        `${kj.status} ${kj.creditsDeducted}`,
      )
      await devolverAFila(k.jobId)
      conferir('a repetição conclui', (await processVideoJob(k.jobId)).outcome === 'completed')
      conferir('cobrado uma vez', (await debitosDo(k.jobId)).length === 1)
    })

    // ── 12. Queda entre o post criado e os efeitos (achado 8) ───────────────
    await caso('12. queda antes dos efeitos do agendamento: a repetição os refaz a partir do post que existe', async () => {
      const quando = new Date(INICIO.getTime() + 32 * 86_400_000)
      quando.setUTCSeconds(0, 0)
      const j = await enfileirar({ tipo: 'agenda', quando: quando.toISOString(), postType: 'STORY', situacao: 'rascunho' }, 'agenda, queda antes dos efeitos')
      const lerVideo = async () =>
        lerVideoDaPagina((await db.generation.findUniqueOrThrow({ where: { id: j.generationId }, select: { fieldValues: true } })).fieldValues)
      const r1 = await processVideoJob(j.jobId, { antesDosEfeitos: queda('antes dos efeitos do agendamento') })
      conferir('1ª execução interrompida antes dos efeitos', r1.outcome === 'interrompido', JSON.stringify(r1))
      const v1 = await lerVideo()
      const postId = v1?.postId ?? ''
      if (postId) posts.add(postId)
      conferir('o post existe, sem os efeitos marcados', !!postId && !v1?.efeitosEm, JSON.stringify(v1))
      const sinaisDoHorario = () => db.learningSignal.count({ where: { chave: `slot:post:${postId}` } })
      conferir('o sinal do horário ainda não existe', (await sinaisDoHorario()) === 0)
      await devolverAFila(j.jobId)
      conferir('a repetição conclui', (await processVideoJob(j.jobId)).outcome === 'completed')
      const v2 = await lerVideo()
      conferir('os efeitos foram refeitos e marcados', !!v2?.efeitosEm && v2.postId === postId, JSON.stringify(v2))
      conferir('o sinal do horário registrado uma vez', (await sinaisDoHorario()) === 1)
      const doVideo = await db.socialPost.findMany({ where: { projectId: PROJETO, generationId: j.generationId }, select: { id: true } })
      for (const p of doVideo) posts.add(p.id)
      conferir('nenhum post a mais', doVideo.length === 1, `${doVideo.length}`)
      conferir('um débito', (await debitosDo(j.jobId)).length === 1)
    })

    casoAtual = 'fecho'
    const porJob = await Promise.all(jobs.map(debitosDo))
    conferir(`cada um dos ${jobs.length} jobs foi cobrado exatamente uma vez`, porJob.every((d) => d.length === 1), porJob.map((d) => d.length).join(','))
  } catch (e) {
    conferir('a prova terminou sem exceção', false, (e as Error)?.stack?.split('\n').slice(0, 3).join(' | ') ?? String(e))
  } finally {
    casoAtual = 'cleanup'
    console.log('\n▸ cleanup')
    const falhasDosPassos: string[] = []
    const passo = async (rotulo: string, fazer: () => Promise<unknown>) => {
      try {
        await fazer()
      } catch (e) {
        falhasDosPassos.push(`${rotulo}: ${(e as Error)?.message ?? String(e)}`)
      }
    }
    const juntar = (...urls: unknown[]) => {
      for (const u of urls) if (typeof u === 'string') blobs.add(u)
    }
    const cleanup = await limparBancoEBlobs(
      blobs,
      async (descoberta: RegistroDeDescoberta) => {
        const descobrir = async (rotulo: string, fazer: () => Promise<void>) => {
          descoberta.pendente(rotulo)
          await passo(rotulo, async () => {
            await fazer()
            descoberta.feita(rotulo)
          })
        }
        await descobrir('posts da rodada', async () => {
          const achados = await db.socialPost.findMany({
            where: { OR: [{ id: { in: [...posts] } }, { projectId: PROJETO, OR: [...(pageId ? [{ pageId }] : []), { generationId: { in: gens } }] }] },
            select: { id: true, mediaUrls: true, renderedImageUrl: true },
          })
          for (const p of achados) {
            posts.add(p.id)
            juntar(...p.mediaUrls, p.renderedImageUrl)
          }
        })
        await descobrir('jobs da rodada', async () => {
          const achados = await db.videoProcessingJob.findMany({
            where: { OR: [{ id: { in: jobs } }, ...(templateId ? [{ templateId }] : [])] },
            select: { id: true, mp4ResultUrl: true, thumbnailUrl: true, webmBlobUrl: true, generationId: true },
          })
          for (const j of achados) {
            if (!jobs.includes(j.id)) jobs.push(j.id)
            if (j.generationId && !gens.includes(j.generationId)) gens.push(j.generationId)
            juntar(j.mp4ResultUrl, j.thumbnailUrl, j.webmBlobUrl)
          }
        })
        await descobrir('artes da rodada', async () => {
          const achados = await db.generation.findMany({
            where: { OR: [{ id: { in: gens } }, ...(templateId ? [{ templateId }] : [])] },
            select: { id: true, resultUrl: true, fieldValues: true },
          })
          for (const g of achados) {
            if (!gens.includes(g.id)) gens.push(g.id)
            const fv = (g.fieldValues ?? {}) as Record<string, any>
            juntar(g.resultUrl, fv.thumbnailUrl, fv.videoUrl, ...(fv.recomposicao?.urlsAnteriores ?? []))
          }
        })
        await descobrir('arquivos da rodada no Blob', async () => {
          if (!dono?.clerkId) return
          for (const prefixo of [`video-exports/${dono.clerkId}/`, `video-thumbnails/${dono.clerkId}/`, `provas/${SLUG}/`]) {
            let cursor: string | undefined
            do {
              const pagina = await list({ prefix: prefixo, cursor, limit: 1000 })
              for (const b of pagina.blobs) if (b.pathname.includes(SLUG)) blobs.add(b.url)
              cursor = pagina.hasMore ? pagina.cursor : undefined
            } while (cursor)
          }
        })

        const idsDosPosts = [...posts]
        await passo('sinais de aprendizado', () =>
          db.learningSignal.deleteMany({
            where: {
              projectId: PROJETO, createdAt: { gte: INICIO },
              OR: [{ postId: { in: idsDosPosts } }, ...(pageId ? [{ pageId }] : []), { generationId: { in: gens } }],
            },
          }),
        )
        await passo('posts (o histórico vai junto)', () => db.socialPost.deleteMany({ where: { id: { in: idsDosPosts } } }))
        await passo('jobs de recomposição', () => db.generationJob.deleteMany({ where: { generationId: { in: gens } } }))
        await passo('créditos devolvidos', async () => {
          if (!dono) return
          const linhas = (await db.usageHistory.findMany({ where: { userId: dono.id, timestamp: { gte: INICIO } }, select: { id: true, creditsUsed: true, details: true } }))
            .filter((l) => jobs.includes((l.details as any)?.jobId))
          const total = linhas.reduce((s, l) => s + l.creditsUsed, 0)
          await db.$transaction([
            db.usageHistory.deleteMany({ where: { id: { in: linhas.map((l) => l.id) } } }),
            db.creditBalance.update({ where: { userId: dono.id }, data: { creditsRemaining: { increment: total } } }),
          ])
        })
        await passo('jobs de vídeo', () => db.videoProcessingJob.deleteMany({ where: { id: { in: jobs } } }))
        await passo('artes', () => db.generation.deleteMany({ where: { OR: [{ id: { in: gens } }, ...(templateId ? [{ templateId }] : [])] } }))
        await passo('página', () => (pageId ? db.page.deleteMany({ where: { id: pageId } }) : Promise.resolve()))
        await passo('template', () => (templateId ? db.template.deleteMany({ where: { id: templateId } }) : Promise.resolve()))
        await passo('conferência: nenhum sinal sobrou', async () => {
          const sobra = await db.learningSignal.count({ where: { projectId: PROJETO, createdAt: { gte: INICIO }, postId: { in: idsDosPosts } } })
          if (sobra > 0) throw new Error(`${sobra} sinal(is) dos posts da rodada ficaram`)
        })
        await passo('conferência: o saldo voltou', async () => {
          const saldo = await saldoDe()
          if (saldo !== saldoInicial) throw new Error(`saldo ${saldo}, era ${saldoInicial}`)
        })
        if (falhasDosPassos.length) throw new Error(falhasDosPassos.join(' · '))
      },
      (urls) => del(urls),
    )
    const falhas = falhasDoCleanup(cleanup)
    for (const f of falhas) conferir('cleanup', false, f)
    if (!falhas.length) console.log(`  ✓ cleanup completo (${cleanup.blobs.apagados} arquivo(s) do Blob apagado(s))`)

    writeFileSync(
      join(SAIDA, 'resultado.json'),
      JSON.stringify({ carimbo: INICIO.toISOString(), banco: DESTINO.compute, ok, mau, conferencias: registro, cleanup }, null, 2),
    )
    console.log(`\n${mau === 0 ? '✓' : '✗'} ${ok} ok, ${mau} falha(s) — ${join(SAIDA, 'resultado.json')}`)
    await db.$disconnect().catch(() => undefined)
  }
}

/**
 * O `update-post` do MCP LOCAL de verdade (`scripts/mcp-server.ts`, stdio), com o
 * ambiente desta prova: o `dotenv/config` dele aponta para um arquivo que não
 * existe e não sobrescreve variável já posta, então o banco é o de dev.
 */
async function chamarUpdatePostNoMcpLocal(postId: string): Promise<{ isError: boolean; texto: string }> {
  const filho = spawn(resolve(ROOT, 'node_modules/.bin/tsx'), ['scripts/mcp-server.ts'], {
    cwd: ROOT,
    env: { ...process.env, DOTENV_CONFIG_PATH: join(SAIDA, 'sem-env-de-proposito') },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let resto = ''
  let stderr = ''
  const pendentes = new Map<number, { ok: (m: any) => void; falha: (e: Error) => void }>()
  filho.stderr.on('data', (d) => (stderr += d))
  filho.stdout.setEncoding('utf8')
  filho.stdout.on('data', (pedaco: string) => {
    resto += pedaco
    for (let i = resto.indexOf('\n'); i >= 0; i = resto.indexOf('\n')) {
      const linha = resto.slice(0, i).trim()
      resto = resto.slice(i + 1)
      if (!linha.startsWith('{')) continue
      try {
        const msg = JSON.parse(linha)
        const p = typeof msg.id === 'number' ? pendentes.get(msg.id) : undefined
        if (p) {
          pendentes.delete(msg.id)
          p.ok(msg)
        }
      } catch {
        // linha de log que não é JSON-RPC
      }
    }
  })
  filho.on('exit', (codigo) => {
    for (const p of pendentes.values()) p.falha(new Error(`o MCP local saiu (${codigo}) antes de responder: ${stderr.slice(-600)}`))
    pendentes.clear()
  })
  const enviar = (msg: unknown) => filho.stdin.write(`${JSON.stringify(msg)}\n`)
  const pedir = (id: number, method: string, params: unknown) =>
    new Promise<any>((ok, falha) => {
      const prazo = setTimeout(() => falha(new Error(`o MCP local não respondeu a ${method} em 120s: ${stderr.slice(-600)}`)), 120_000)
      pendentes.set(id, { ok: (m) => (clearTimeout(prazo), ok(m)), falha: (e) => (clearTimeout(prazo), falha(e)) })
      enviar({ jsonrpc: '2.0', id, method, params })
    })
  try {
    await pedir(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'validar-video-na-agenda', version: '1' } })
    enviar({ jsonrpc: '2.0', method: 'notifications/initialized' })
    const r = await pedir(2, 'tools/call', { name: 'update-post', arguments: { postId, status: 'SCHEDULED' } })
    const texto = (r.result?.content ?? []).map((c: { text?: string }) => c.text ?? '').join('\n') || JSON.stringify(r.error ?? r)
    return { isError: r.result?.isError === true || !!r.error, texto }
  } finally {
    filho.kill('SIGTERM')
  }
}

main()
  .then(() => process.exit(mau > 0 ? 1 : 0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
