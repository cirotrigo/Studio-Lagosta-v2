/**
 * Prova de INTEGRAÇÃO do revisor da arte (PR 0 de "Marca simples, copy
 * melhor", 12/09/2026), contra o BRANCH DE DESENVOLVIMENTO do Neon.
 *
 * Pelo SERVIÇO (`revisarArte` + `ajustarArte`), não pela tool nem pela rota:
 * o que precisa ser provado é o miolo — versão da página, isolamento por
 * projeto, página-modelo, a agenda avisada mesmo quando o render falha,
 * imagem única e slide de carrossel. Os testes unitários cobrem os módulos
 * puros; este é o que toca banco, Blob e a fila.
 *
 * O QUE ELE PROVA
 *   0. compõe UMA peça real do cliente (`comporPeca`, sem `provar`) — é o
 *      objeto do resto da prova;
 *   1. `revisarArte` sem visão devolve versão e relatório;
 *   2. `ajustes` sem `versaoEsperada` → VERSAO_OBRIGATORIA (400);
 *   3. outro projeto → PAGE_NOT_FOUND (404), nas duas funções;
 *   4. página-modelo → revisão só leitura (`aplicavel: false`) e
 *      PAGINA_E_MODELO no ajuste;
 *   5. autosave no meio → VERSAO_DIVERGENTE (409) e nada gravado;
 *   6. ajuste aplicado: versão nova, copy intacta, o rascunho de imagem única
 *      volta a PENDING e o slide de carrossel entra na fila de recomposição
 *      (job COMPOR com `recompor`), sem perder mídia;
 *   7. render falhando (Blob recusa o token): a página fica gravada E a agenda
 *      é avisada do mesmo jeito;
 *   8. (opcional, `--com-visao`) uma revisão com a visão, para a evidência.
 *
 * EFEITOS FORA DO BANCO DE DEV, declarados: os renders sobem PNG ao Blob de
 * PRODUÇÃO (`arte-rapida/8/…` e `compor/…`) — apagados no cleanup pelas URLs
 * criadas; `--com-visao` faz UMA chamada paga ao modelo de visão. Nenhum sinal
 * de aprendizado é emitido por busca (não chama sugerirPosts nem
 * buscarNoAcervo); o agendamento grava o seu sinal de slot, apagado junto.
 *
 * ⚠️ NUNCA contra produção: o banco é resolvido à mão (`.env` →
 * `.env.development.local`) e o script ABORTA se o compute for o de produção.
 * Protocolo da casa: projeto 8, REMINDER, +7 dias, cleanup completo.
 *
 * USO
 *   npx tsx scripts/validar-revisor-da-arte.ts [--com-visao] [--saida <pasta>]
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const DB_KEYS = ['DATABASE_URL', 'DIRECT_URL'] as const

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
function endpointDe(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '')
  } catch {
    return null
  }
}
function abortar(titulo: string, linhas: string[] = []): never {
  console.error(`\n✗ ${titulo}\n`)
  for (const l of linhas) console.error(`  ${l}`)
  process.exit(1)
}
function apontarParaODev(): string {
  const prod = parseEnvFile(resolve(ROOT, '.env'))
  const dev = parseEnvFile(resolve(ROOT, '.env.development.local'))
  // 🔴 Falha FECHADA: sem o .env não há como saber qual compute é produção.
  if (!existsSync(resolve(ROOT, '.env'))) abortar('não há .env aqui para dizer qual compute é PRODUÇÃO.')
  if (!dev.DATABASE_URL) abortar('.env.development.local não define DATABASE_URL.', ['Rode  npm run db:dev:setup  antes.'])
  for (const [k, v] of Object.entries(prod)) if (!(k in process.env)) process.env[k] = v
  for (const k of DB_KEYS) if (dev[k]) process.env[k] = dev[k]
  const alvo = endpointDe(process.env.DATABASE_URL)
  const producao = new Set(DB_KEYS.map((k) => endpointDe(prod[k])).filter((e): e is string => e !== null))
  if (!alvo || producao.has(alvo)) abortar('O banco resolvido é o de PRODUÇÃO.', [`DATABASE_URL aponta para ${alvo ?? '(ilegível)'}.`])
  return alvo
}
const ENDPOINT = apontarParaODev()

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}
const PROJETO = 8
const COM_VISAO = process.argv.includes('--com-visao')
const SAIDA = argumento('--saida') ?? '.tmp-validar-revisor'
const MARCA = `[PR0-REVISOR ${new Date().toISOString()}]`

let ok = 0
let mau = 0
function conferir(titulo: string, condicao: boolean, detalhe = '') {
  console.log(`  ${condicao ? '✓' : '✗'} ${titulo}${detalhe ? ` — ${detalhe}` : ''}`)
  condicao ? ok++ : mau++
}
async function erroDe(p: Promise<unknown>): Promise<{ code?: string; status?: number; message: string } | null> {
  try {
    await p
    return null
  } catch (e) {
    const x = e as { code?: string; status?: number; message?: string }
    return { code: x.code, status: x.status, message: x.message ?? String(e) }
  }
}

async function main() {
  mkdirSync(SAIDA, { recursive: true })
  const inicio = new Date()
  console.log(`\nbanco: ${ENDPOINT} (desenvolvimento) | projeto ${PROJETO} | ${MARCA}\n`)

  const { db } = await import('../src/lib/db')
  const { comporPeca } = await import('../src/lib/compositor/compor')
  const { revisarArte } = await import('../src/lib/creatives/revisao/revisar-arte')
  const { ajustarArte } = await import('../src/lib/creatives/arte-rapida')
  const { agendarPost } = await import('../src/lib/creatives/agendar')
  const { copyDeCamadas } = await import('../src/lib/aprendizado/diff-copy')
  const { lerCamadas } = await import('../src/lib/posts/page-layers')
  const { del } = await import('@vercel/blob')

  const projeto = await db.project.findUnique({ where: { id: PROJETO }, select: { id: true, name: true, userId: true } })
  if (!projeto) abortar(`Projeto ${PROJETO} não existe neste banco.`)

  const templatesAntes = new Set((await db.template.findMany({ where: { projectId: PROJETO }, select: { id: true } })).map((t) => t.id))
  const posts: string[] = []
  const blobs = new Set<string>()
  let pageId: string | null = null
  const tokenDoBlob = process.env.BLOB_READ_WRITE_TOKEN

  try {
    // ── 0. a peça ──────────────────────────────────────────────────────────
    console.log('0) compor uma peça real (story, +7 dias)')
    const foto = await db.generation.findFirst({
      where: { projectId: PROJETO, status: 'COMPLETED', resultUrl: { contains: 'blob.vercel-storage.com' }, fieldValues: { path: ['track'], equals: 'imagem' } },
      orderBy: { createdAt: 'desc' },
      select: { resultUrl: true },
    })
    const fotoUrl = foto?.resultUrl ?? 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1600'
    const daqui7 = new Date(Date.now() + 7 * 86_400_000)
    const quando = `${daqui7.toISOString().slice(0, 10)} 10:00`
    const composta = await comporPeca(
      {
        projectId: PROJETO,
        formato: 'story',
        foto: { url: fotoUrl },
        blocos: [
          { papel: 'pre', linhas: ['Prova do revisor'] },
          { papel: 'headline', linhas: ['Título de teste', 'para revisar'] },
          { papel: 'apoio', linhas: ['Peça criada pela prova de integração.', 'Pode apagar.'] },
          { papel: 'cta', linhas: ['Conheça nossos pacotes'] },
          { papel: 'servico', linhas: ['Seg a sex · 9h às 18h'] },
        ],
        nome: `${MARCA} peça`,
        quando,
        tema: 'teste',
      },
      { canal: 'claude-code' },
    )
    const persistido = composta.persistido
    if (!persistido) abortar('a composição não persistiu nada')
    pageId = persistido.pageId
    blobs.add(persistido.url)
    conferir('peça composta e persistida', !!pageId, `page ${pageId}, generation ${persistido.generationId}`)
    const copyOriginal = copyDeCamadas(lerCamadas((await db.page.findUnique({ where: { id: pageId }, select: { layers: true } }))!.layers).camadas as never)

    // ── 1. revisar ─────────────────────────────────────────────────────────
    console.log('1) revisarArte sem visão')
    const r1 = await revisarArte({ projectId: PROJETO, pageId, visao: false, previa: true })
    writeFileSync(resolve(SAIDA, 'revisao-1.json'), JSON.stringify({ ...r1, previa: undefined }, null, 2))
    if (r1.previa) writeFileSync(resolve(SAIDA, 'revisao-1.jpg'), r1.previa)
    conferir('versão calculada', typeof r1.versao === 'string' && r1.versao.startsWith('v1:'), r1.versao ?? '')
    conferir('aplicável (não é modelo)', r1.aplicavel)
    conferir('cobertura diz que a visão não rodou', r1.visao.estado === 'desligada' && r1.relatorio.cobertura.visao?.estado === 'nao-avaliada', r1.relatorio.resumo.slice(0, 120))
    console.log(`     achados: ${r1.relatorio.achados.map((a) => `${a.regra}(${a.severidade[0]})`).join(' ') || '—'}; ajustes: ${r1.relatorio.ajustes.length}`)

    // ── 2. sem versão ──────────────────────────────────────────────────────
    console.log('2) ajustes sem versaoEsperada')
    const e2 = await erroDe(ajustarArte({ projectId: PROJETO, pageId, ajustes: [{ tipo: 'mover', camadas: ['headline'], dy: -8 }] }))
    conferir('VERSAO_OBRIGATORIA 400', e2?.code === 'VERSAO_OBRIGATORIA' && e2.status === 400, e2?.message.slice(0, 90))

    // ── 3. projeto errado ──────────────────────────────────────────────────
    console.log('3) outro projeto')
    const outro = await db.project.findFirst({ where: { id: { not: PROJETO } }, select: { id: true } })
    const e3a = await erroDe(revisarArte({ projectId: outro!.id, pageId, visao: false, previa: false }))
    const e3b = await erroDe(ajustarArte({ projectId: outro!.id, pageId, versaoEsperada: r1.versao, ajustes: [{ tipo: 'mover', camadas: ['headline'], dy: -8 }] }))
    conferir('revisar recusa (PAGE_NOT_FOUND 404)', e3a?.code === 'PAGE_NOT_FOUND' && e3a.status === 404)
    conferir('ajustar recusa (PAGE_NOT_FOUND 404)', e3b?.code === 'PAGE_NOT_FOUND' && e3b.status === 404)

    // ── 4. página-modelo ───────────────────────────────────────────────────
    console.log('4) página-modelo')
    await db.page.update({ where: { id: pageId }, data: { isTemplate: true } })
    const r4 = await revisarArte({ projectId: PROJETO, pageId, visao: false, previa: false })
    const e4 = await erroDe(ajustarArte({ projectId: PROJETO, pageId, versaoEsperada: r4.versao, ajustes: [{ tipo: 'mover', camadas: ['headline'], dy: -8 }] }))
    await db.page.update({ where: { id: pageId }, data: { isTemplate: false } })
    conferir('revisão vale como leitura (aplicavel false, com motivo)', r4.aplicavel === false && !!r4.motivo)
    conferir('ajuste recusado (PAGINA_E_MODELO 400)', e4?.code === 'PAGINA_E_MODELO' && e4.status === 400)

    // ── posts da agenda ────────────────────────────────────────────────────
    console.log('   preparando a agenda: rascunho de imagem única (pela página) e slide de carrossel (arte congelada)')
    const unico = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: quando, pageId, situacao: 'rascunho', lembrete: true, caption: `${MARCA} imagem única` })
    posts.push(unico.postId)
    const carrossel = await db.socialPost.create({
      data: {
        projectId: PROJETO,
        userId: projeto.userId,
        postType: 'CAROUSEL',
        caption: `${MARCA} carrossel — pode apagar`,
        mediaUrls: [fotoUrl, persistido.url],
        scheduleType: 'SCHEDULED',
        scheduledDatetime: daqui7,
        status: 'DRAFT',
        publishType: 'REMINDER',
        renderStatus: 'NOT_NEEDED',
      },
      select: { id: true },
    })
    posts.push(carrossel.id)
    const unicoAntes = await db.socialPost.findUnique({ where: { id: unico.postId }, select: { renderStatus: true, pageId: true } })
    conferir('rascunho único nasceu RENDERED pela página', unicoAntes?.renderStatus === 'RENDERED' && unicoAntes.pageId === pageId, String(unicoAntes?.renderStatus))

    // ── 5. autosave no meio ────────────────────────────────────────────────
    console.log('5) autosave no meio: a página muda entre a revisão e o ajuste')
    const paginaAntes = await db.page.findUnique({ where: { id: pageId }, select: { layers: true, updatedAt: true } })
    const camadasAntes = lerCamadas(paginaAntes!.layers).camadas as Array<Record<string, any>>
    const autosave = camadasAntes.map((c) => (c.type === 'text' && c.position ? { ...c, position: { ...c.position, x: c.position.x + 1 } } : c))
    await db.page.update({ where: { id: pageId }, data: { layers: autosave as never } })
    const e5 = await erroDe(ajustarArte({ projectId: PROJETO, pageId, versaoEsperada: r1.versao, ajustes: [{ tipo: 'mover', camadas: ['headline'], dy: -8 }] }))
    const depoisDo5 = await db.page.findUnique({ where: { id: pageId }, select: { layers: true } })
    conferir('VERSAO_DIVERGENTE 409', e5?.code === 'VERSAO_DIVERGENTE' && e5.status === 409, e5?.message.slice(0, 80))
    conferir('nada foi gravado por cima do autosave', JSON.stringify(lerCamadas(depoisDo5!.layers).camadas) === JSON.stringify(autosave))
    const geracoesAntesDo6 = await db.generation.count({ where: { projectId: PROJETO, fieldValues: { path: ['pageId'], equals: pageId } } })

    // ── 6. ajuste aplicado ─────────────────────────────────────────────────
    console.log('6) revisar de novo e aplicar um ajuste')
    const r6 = await revisarArte({ projectId: PROJETO, pageId, visao: false, previa: false })
    const headline = (lerCamadas(depoisDo5!.layers).camadas as Array<Record<string, any>>).find((c) => c.type === 'text' && /headline/i.test(String(c.name ?? c.id)))
    const ajustes = r6.relatorio.ajustes.length > 0 ? r6.relatorio.ajustes : [{ tipo: 'mover' as const, camadas: [String(headline?.id)], dy: -10 }]
    const a6 = await ajustarArte({ projectId: PROJETO, pageId, versaoEsperada: r6.versao, ajustes, canal: 'claude-code' })
    blobs.add(a6.url)
    const paginaDepois = await db.page.findUnique({ where: { id: pageId }, select: { layers: true } })
    const copyDepois = copyDeCamadas(lerCamadas(paginaDepois!.layers).camadas as never)
    conferir('versão mudou depois do ajuste', !!a6.versao && a6.versao !== r6.versao, `${r6.versao} → ${a6.versao}`)
    conferir('algum ajuste aplicado', (a6.ajustesAplicados?.length ?? 0) > 0, `${a6.ajustesAplicados?.length ?? 0} aplicado(s), ${a6.ajustesRecusados?.length ?? 0} recusado(s)`)
    conferir('a copy ficou intacta', JSON.stringify(copyDepois) === JSON.stringify(copyOriginal))
    const geracoesDepoisDo6 = await db.generation.count({ where: { projectId: PROJETO, fieldValues: { path: ['pageId'], equals: pageId } } })
    conferir('uma Generation nova de ajuste-arte', geracoesDepoisDo6 === geracoesAntesDo6 + 1, `${geracoesAntesDo6} → ${geracoesDepoisDo6}`)
    const unicoDepois = await db.socialPost.findUnique({ where: { id: unico.postId }, select: { renderStatus: true } })
    conferir('imagem única voltou à fila de render (PENDING)', unicoDepois?.renderStatus === 'PENDING', String(unicoDepois?.renderStatus))
    const idsDaPagina = (await db.generation.findMany({ where: { projectId: PROJETO, fieldValues: { path: ['pageId'], equals: pageId } }, select: { id: true } })).map((g) => g.id)
    const job = await db.generationJob.findFirst({ where: { generationId: { in: idsDaPagina }, kind: 'COMPOR' }, select: { id: true, status: true, payload: true } })
    const payload = (job?.payload ?? {}) as Record<string, any>
    conferir('slide de carrossel entrou na fila de recomposição (job COMPOR com recompor)', !!job && payload.recompor?.pageId === pageId, job ? `job ${job.id} ${job.status}` : 'sem job')
    const carrosselDepois = await db.socialPost.findUnique({ where: { id: carrossel.id }, select: { mediaUrls: true } })
    conferir('o carrossel não perdeu mídia', (carrosselDepois?.mediaUrls.length ?? 0) === 2)
    writeFileSync(resolve(SAIDA, 'ajuste-6.json'), JSON.stringify({ ajustes, aplicados: a6.ajustesAplicados, recusados: a6.ajustesRecusados, versao: a6.versao }, null, 2))

    // ── 7. render falhando ─────────────────────────────────────────────────
    console.log('7) render falhando (Blob recusa o token): página gravada e agenda avisada')
    await db.socialPost.update({ where: { id: unico.postId }, data: { renderStatus: 'RENDERED' } })
    await db.generationJob.updateMany({ where: { generationId: { in: idsDaPagina }, kind: 'COMPOR' }, data: { status: 'DONE', finishedAt: new Date() } })
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_INVALIDO_prova'
    const e7 = await erroDe(ajustarArte({ projectId: PROJETO, pageId, versaoEsperada: a6.versao, ajustes: [{ tipo: 'mover', camadas: [String(headline?.id)], dy: 4 }], canal: 'claude-code' }))
    process.env.BLOB_READ_WRITE_TOKEN = tokenDoBlob
    const { versaoDaPagina } = await import('../src/lib/creatives/revisao/versao')
    const paginaDo7 = await db.page.findUnique({ where: { id: pageId } })
    const unicoDo7 = await db.socialPost.findUnique({ where: { id: unico.postId }, select: { renderStatus: true } })
    const jobDo7 = await db.generationJob.findFirst({ where: { generationId: { in: idsDaPagina }, kind: 'COMPOR' }, select: { status: true } })
    conferir('o render falhou (erro subiu)', !!e7 && e7.code !== 'VERSAO_DIVERGENTE', e7?.message.slice(0, 80))
    conferir('a página ficou gravada com o ajuste (versão nova)', !!paginaDo7 && versaoDaPagina(paginaDo7) !== a6.versao)
    conferir('imagem única voltou a PENDING mesmo com o render falhando', unicoDo7?.renderStatus === 'PENDING', String(unicoDo7?.renderStatus))
    conferir('o job de recomposição foi reaberto mesmo com o render falhando', jobDo7?.status === 'PENDING', String(jobDo7?.status))

    // ── 8. visão (opcional) ────────────────────────────────────────────────
    if (COM_VISAO) {
      console.log('8) revisão com a visão (uma chamada paga)')
      const r8 = await revisarArte({ projectId: PROJETO, pageId, visao: true, previa: true })
      writeFileSync(resolve(SAIDA, 'revisao-8.json'), JSON.stringify({ ...r8, previa: undefined }, null, 2))
      if (r8.previa) writeFileSync(resolve(SAIDA, 'revisao-8.jpg'), r8.previa)
      conferir('visão rodou', r8.visao.estado === 'feita', `${r8.visao.modelo} em ${r8.visao.ms}ms; ${r8.relatorio.achados.length} achado(s)`)
    }
  } catch (erro) {
    // O erro da prova é impresso ANTES do cleanup: sem isto uma falha no
    // cleanup engoliria a causa (aconteceu na primeira rodada).
    console.error('\n✗ a prova parou:', erro instanceof Error ? erro.stack ?? erro.message : erro)
    mau++
  } finally {
    process.env.BLOB_READ_WRITE_TOKEN = tokenDoBlob
    console.log('\ncleanup (só os ids criados por esta prova)')
    const criados = { posts: posts.length, generations: 0, jobs: 0, sinais: 0, pages: pageId ? 1 : 0, templates: 0, blobs: blobs.size }
    if (posts.length) {
      criados.sinais += (await db.learningSignal.deleteMany({ where: { projectId: PROJETO, postId: { in: posts }, createdAt: { gte: inicio } } })).count
      await db.socialPost.deleteMany({ where: { id: { in: posts } } })
    }
    if (pageId) {
      const gens = (await db.generation.findMany({ where: { projectId: PROJETO, fieldValues: { path: ['pageId'], equals: pageId } }, select: { id: true, resultUrl: true } }))
      for (const g of gens) if (g.resultUrl) blobs.add(g.resultUrl)
      criados.jobs += (await db.generationJob.deleteMany({ where: { generationId: { in: gens.map((g) => g.id) } } })).count
      criados.sinais += (await db.learningSignal.deleteMany({ where: { projectId: PROJETO, pageId, createdAt: { gte: inicio } } })).count
      criados.generations += (await db.generation.deleteMany({ where: { id: { in: gens.map((g) => g.id) } } })).count
      const pagina = await db.page.findUnique({ where: { id: pageId }, select: { templateId: true } })
      await db.page.delete({ where: { id: pageId } })
      // A pasta da semana só sai se nasceu nesta prova e ficou vazia.
      if (pagina && !templatesAntes.has(pagina.templateId)) {
        const restam = await db.page.count({ where: { templateId: pagina.templateId } })
        const gensNoTemplate = await db.generation.count({ where: { templateId: pagina.templateId } })
        if (restam === 0 && gensNoTemplate === 0) {
          await db.template.delete({ where: { id: pagina.templateId } })
          criados.templates++
        }
      }
    }
    const urls = [...blobs].filter((u): u is string => typeof u === 'string' && u.includes('blob.vercel-storage.com'))
    try {
      if (urls.length) await del(urls)
    } catch (e) {
      console.warn('  blob não apagado:', e instanceof Error ? e.message : e)
    }
    console.log(`  apagados: ${JSON.stringify(criados)}`)
    await db.$disconnect()
  }

  console.log(`\n${ok} ok, ${mau} falha(s). Saída em ${SAIDA}`)
  if (mau > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
