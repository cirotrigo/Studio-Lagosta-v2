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
 *   6. render falhando (Blob recusa o token) num ajuste SÓ de força do
 *      gradiente, antes de qualquer ajuste bem-sucedido: a página fica gravada,
 *      a agenda é avisada e o slide de carrossel entra na fila pela
 *      recomposição FORÇADA (R2 — sem Generation nova e sem diff geométrico),
 *      e o job forçado EXECUTA: re-render como está, só o slide certo troca e a
 *      força do gradiente ajustada fica (REV-01);
 *   7. ajuste aplicado: versão nova, copy intacta, o rascunho de imagem única
 *      volta a PENDING e o slide volta à fila (job reaberto), sem perder mídia;
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
  // 🔴 Falha FECHADA também aqui: `.env` sem URL de banco reconhecível deixaria
  // o conjunto de produção vazio e QUALQUER destino passaria — inclusive a
  // produção (achado R1 da revisão do Codex, 12/09/2026).
  if (producao.size === 0) abortar('o .env não tem DATABASE_URL/DIRECT_URL reconhecível: não dá para saber qual compute é PRODUÇÃO.')
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
/**
 * O domínio público do Blob levanta o "Vercel Security Checkpoint" (403 para
 * TODA URL, por alguns minutos) quando esta máquina faz muitas idas em pouco
 * tempo — cada render busca fontes, foto e logo lá, e sobe o PNG. Medido em
 * 12/09/2026: duas rodadas seguidas pararam no mesmo ponto (a composição da
 * segunda peça) com "Failed to load image" da logo. As pausas espaçam o pico.
 */
async function pausaParaOBlob(ms: number, porque: string) {
  console.log(`   (pausa de ${Math.round(ms / 1000)}s: ${porque})`)
  await new Promise((r) => setTimeout(r, ms))
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
  // A prova diz qual CÓDIGO rodou: SHA, worktree e sujeira pendente vão para o log.
  const { execSync } = await import('node:child_process')
  const git = (cmd: string) => { try { return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '(indisponível)' } }
  console.log(`\nbanco: ${ENDPOINT} (desenvolvimento) | projeto ${PROJETO} | ${MARCA}`)
  console.log(`código: ${git('git rev-parse HEAD')} (${git('git branch --show-current')}) em ${ROOT}; pendente: ${git('git status --short | grep -v prisma/generated | wc -l | tr -d " "')} arquivo(s) | render: napi-rs local | node ${process.version}\n`)

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
        // A MARCA vai no TEMA: `nomeDaPagina` prioriza o tema sobre o nome, e é
        // pelo nome da página que o cleanup recupera o que a composição criou
        // antes de falhar (REV-02 da revisão do Codex).
        nome: `${MARCA} peça`,
        quando,
        tema: `${MARCA} teste`,
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

    // ── 6. render falhando, ANTES de qualquer ajuste bem-sucedido ───────────
    // Ajuste SÓ de força do gradiente: não muda a copy nem a geometria, então o
    // diff de defasagem não vê nada, e sem Generation nova não há URL que
    // denuncie — o job de recomposição só pode nascer pela recomposição FORÇADA
    // do catch (achado R2 da revisão do Codex). O carrossel aponta para a arte
    // atual (U0), que é a `urlAtual` do levantamento.
    // ── 6a. um pedido NORMAL já está na fila (edição de texto pelo editor) ───
    // REV-03: a força não pode ser descartada por um job PENDING anterior.
    console.log('6a) edição de texto pelo editor deixa um job de recomposição NORMAL pendente')
    const { pedirRecomposicaoDaArteCongelada } = await import('../src/lib/compositor/recompor')
    const camadasDo5 = lerCamadas(depoisDo5!.layers).camadas as Array<Record<string, any>>
    const headlineDo5 = camadasDo5.find((c) => c.type === 'text' && /headline/i.test(String(c.name ?? c.id)))
    const textoDo6a = 'Título editado\npela equipe'
    await db.page.update({ where: { id: pageId }, data: { layers: camadasDo5.map((c) => (c.id === headlineDo5?.id ? { ...c, content: textoDo6a } : c)) as never } })
    await pedirRecomposicaoDaArteCongelada([pageId])
    const idsDaPaginaDo6a = (await db.generation.findMany({ where: { projectId: PROJETO, fieldValues: { path: ['pageId'], equals: pageId } }, select: { id: true } })).map((g) => g.id)
    const jobDo6a = await db.generationJob.findFirst({ where: { generationId: { in: idsDaPaginaDo6a }, kind: 'COMPOR' }, select: { id: true, status: true, payload: true } })
    conferir('job normal pendente, SEM forcar', !!jobDo6a && jobDo6a.status === 'PENDING' && (jobDo6a.payload as Record<string, any>).recompor?.forcar !== true, jobDo6a ? `job ${jobDo6a.id}` : 'sem job')

    console.log('6) render falhando (Blob recusa o token) num ajuste só de gradiente: página gravada e agenda avisada')
    const r6 = await revisarArte({ projectId: PROJETO, pageId, visao: false, previa: false })
    const camadasDo6 = lerCamadas((await db.page.findUnique({ where: { id: pageId }, select: { layers: true } }))!.layers).camadas as Array<Record<string, any>>
    const gradienteDeLeitura = camadasDo6.find((c) => (c.type === 'gradient' || c.type === 'gradient2') && c.metadata?.tratamentoDeTexto)
    const bordaDo6 = (gradienteDeLeitura?.metadata?.borda === 'topo' ? 'topo' : 'rodape') as 'topo' | 'rodape'
    const forcaAtual = Number(gradienteDeLeitura?.metadata?.forca ?? 0.5)
    const ajusteDeForca = { tipo: 'gradiente' as const, borda: bordaDo6, forca: Math.min(0.9, Math.round((forcaAtual + 0.1) * 1000) / 1000), ...(gradienteDeLeitura ? { camadas: [String(gradienteDeLeitura.id)] } : {}) }
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_INVALIDO_prova'
    const e6 = await erroDe(ajustarArte({ projectId: PROJETO, pageId, versaoEsperada: r6.versao, ajustes: [ajusteDeForca], canal: 'claude-code' }))
    process.env.BLOB_READ_WRITE_TOKEN = tokenDoBlob
    const { versaoDaPagina } = await import('../src/lib/creatives/revisao/versao')
    const paginaDo6 = await db.page.findUnique({ where: { id: pageId } })
    const unicoDo6 = await db.socialPost.findUnique({ where: { id: unico.postId }, select: { renderStatus: true } })
    const idsDaPaginaDo6 = (await db.generation.findMany({ where: { projectId: PROJETO, fieldValues: { path: ['pageId'], equals: pageId } }, select: { id: true } })).map((g) => g.id)
    const jobDo6 = await db.generationJob.findFirst({ where: { generationId: { in: idsDaPaginaDo6 }, kind: 'COMPOR' }, select: { id: true, status: true, payload: true } })
    conferir('o render falhou (erro subiu)', !!e6 && e6.code !== 'VERSAO_DIVERGENTE', e6?.message.slice(0, 80))
    conferir('nenhuma Generation nova nasceu', idsDaPaginaDo6.length === geracoesAntesDo6, `${idsDaPaginaDo6.length}`)
    conferir('a página ficou gravada com o ajuste (versão nova)', !!paginaDo6 && versaoDaPagina(paginaDo6) !== r6.versao)
    conferir('imagem única voltou a PENDING mesmo com o render falhando', unicoDo6?.renderStatus === 'PENDING', String(unicoDo6?.renderStatus))
    conferir(
      'o job PENDENTE foi promovido à recuperação FORÇADA (REV-03: o mesmo job, agora com forcar no payload)',
      !!jobDo6 && jobDo6.id === jobDo6a?.id && jobDo6.status === 'PENDING' && (jobDo6.payload as Record<string, any>).recompor?.forcar === true && (jobDo6.payload as Record<string, any>).recompor?.pageId === pageId,
      jobDo6 ? `job ${jobDo6.id} ${jobDo6.status} forcar=${String((jobDo6.payload as Record<string, any>).recompor?.forcar)}` : 'sem job',
    )
    // ── 6b. o job forçado EXECUTA e troca só o slide certo ──────────────────
    // REV-01 da revisão do Codex: enfileirar não bastava — o executor repetia a
    // checagem de defasagem e terminava sem renderizar. Aqui o job roda de
    // verdade (com o Blob de volta), a página é re-renderizada COMO ESTÁ (com a
    // força nova do gradiente) e só o slide da arte troca de URL.
    console.log('6b) o job de recuperação forçada roda: re-render como está, só o slide certo troca')
    const { processarRecomposicaoEmBackground } = await import('../src/lib/compositor/recompor')
    const payloadDo6 = (jobDo6?.payload ?? {}) as Record<string, any>
    conferir('o payload do job carrega forcar: true', payloadDo6.recompor?.forcar === true, JSON.stringify(payloadDo6.recompor))
    const forcaGravada = (camadas: Array<Record<string, any>>) => Number(camadas.find((c) => c.id === gradienteDeLeitura?.id)?.metadata?.forca ?? NaN)
    const antesDo6b = (await db.page.findUnique({ where: { id: pageId }, select: { layers: true } }))!
    const forcaAntesDo6b = forcaGravada(lerCamadas(antesDo6b.layers).camadas as Array<Record<string, any>>)
    if (jobDo6) {
      await processarRecomposicaoEmBackground({ generationId: persistido.generationId, projectId: PROJETO, recompor: payloadDo6.recompor, queueJobId: jobDo6.id })
      // A prova chamou o PROCESSADOR direto, sem a fila: na produção `executarJob`
      // fecha o job DONE ao terminar (`fecharJob`). Simula esse fechamento — sem
      // ele, 6c encontraria o mesmo job ainda PENDING com o payload forçado, que
      // é artefato da prova, não comportamento da fila.
      await db.generationJob.updateMany({ where: { id: jobDo6.id, status: 'PENDING' }, data: { status: 'DONE', finishedAt: new Date(), lastError: null } })
    }
    const carrosselDo6b = await db.socialPost.findUnique({ where: { id: carrossel.id }, select: { mediaUrls: true } })
    const genDo6b = await db.generation.findUnique({ where: { id: persistido.generationId }, select: { resultUrl: true, fieldValues: true } })
    const depoisDo6b = (await db.page.findUnique({ where: { id: pageId }, select: { layers: true } }))!
    if (genDo6b?.resultUrl) blobs.add(genDo6b.resultUrl)
    conferir('o slide da arte trocou de URL e a capa (foto) ficou', !!carrosselDo6b && carrosselDo6b.mediaUrls[0] === fotoUrl && carrosselDo6b.mediaUrls[1] !== persistido.url && carrosselDo6b.mediaUrls.length === 2, JSON.stringify(carrosselDo6b?.mediaUrls.map((u) => u.slice(-40))))
    conferir('a arte foi RE-RENDERIZADA (não recomposta): a mesma Generation, marcada "re-renderizada"', genDo6b?.resultUrl === carrosselDo6b?.mediaUrls[1] && (genDo6b?.fieldValues as Record<string, any>)?.recomposicao?.estado === 're-renderizada', String((genDo6b?.fieldValues as Record<string, any>)?.recomposicao?.estado))
    conferir('a força do gradiente ajustada continua na página (o forçado não recompôs pela spec)', Number.isFinite(forcaAntesDo6b) && forcaGravada(lerCamadas(depoisDo6b.layers).camadas as Array<Record<string, any>>) === forcaAntesDo6b && forcaAntesDo6b === ajusteDeForca.forca, `${forcaAntesDo6b}`)
    const textoDepoisDo6b = String((lerCamadas(depoisDo6b.layers).camadas as Array<Record<string, any>>).find((c) => c.id === headlineDo5?.id)?.content)
    conferir('o texto editado em 6a continua (re-render como está, não pela spec)', textoDepoisDo6b === textoDo6a, textoDepoisDo6b)
    conferir('a arte ficou marcada somenteReRender (REV-04: a spec não conhece o ajuste)', !!(genDo6b?.fieldValues as Record<string, any>)?.somenteReRender)
    const idsDaPaginaDo6b = (await db.generation.findMany({ where: { projectId: PROJETO, fieldValues: { path: ['pageId'], equals: pageId } }, select: { id: true } })).map((g) => g.id)
    conferir('nenhuma Generation nova nasceu no re-render forçado', idsDaPaginaDo6b.length === geracoesAntesDo6, `${idsDaPaginaDo6b.length}`)

    // ── 6c. edição de texto DEPOIS da recuperação: recomposição normal NÃO recompõe pela spec ──
    console.log('6c) outra edição de texto pelo editor: a fila normal re-renderiza como está e preserva o gradiente (REV-04)')
    const textoDo6c = 'Título editado\nde novo'
    const camadasDo6c = lerCamadas(depoisDo6b.layers).camadas as Array<Record<string, any>>
    await db.page.update({ where: { id: pageId }, data: { layers: camadasDo6c.map((c) => (c.id === headlineDo5?.id ? { ...c, content: textoDo6c } : c)) as never } })
    await pedirRecomposicaoDaArteCongelada([pageId])
    const jobDo6c = await db.generationJob.findFirst({ where: { generationId: { in: idsDaPaginaDo6b }, kind: 'COMPOR', status: 'PENDING' }, select: { id: true, payload: true } })
    conferir('job normal (sem forcar) pendente para a edição', !!jobDo6c && (jobDo6c.payload as Record<string, any>).recompor?.forcar !== true, jobDo6c ? jobDo6c.id : 'sem job')
    if (jobDo6c) await processarRecomposicaoEmBackground({ generationId: persistido.generationId, projectId: PROJETO, recompor: (jobDo6c.payload as Record<string, any>).recompor, queueJobId: jobDo6c.id })
    const genDo6c = await db.generation.findUnique({ where: { id: persistido.generationId }, select: { resultUrl: true, fieldValues: true } })
    const paginaDo6c = (await db.page.findUnique({ where: { id: pageId }, select: { layers: true } }))!
    const camadasFinaisDo6c = lerCamadas(paginaDo6c.layers).camadas as Array<Record<string, any>>
    if (genDo6c?.resultUrl) blobs.add(genDo6c.resultUrl)
    conferir('a arte foi RE-RENDERIZADA de novo (não "feita" pela spec)', (genDo6c?.fieldValues as Record<string, any>)?.recomposicao?.estado === 're-renderizada' && genDo6c?.resultUrl !== genDo6b?.resultUrl, String((genDo6c?.fieldValues as Record<string, any>)?.recomposicao?.estado))
    conferir('o texto novo está na peça e a força do gradiente ajustada FICOU', String(camadasFinaisDo6c.find((c) => c.id === headlineDo5?.id)?.content) === textoDo6c && forcaGravada(camadasFinaisDo6c) === ajusteDeForca.forca)
    const carrosselDo6c = await db.socialPost.findUnique({ where: { id: carrossel.id }, select: { mediaUrls: true } })
    conferir('só o slide da arte trocou de URL outra vez', !!carrosselDo6c && carrosselDo6c.mediaUrls[0] === fotoUrl && carrosselDo6c.mediaUrls[1] === genDo6c?.resultUrl && carrosselDo6c.mediaUrls.length === 2)

    // ── 6d. a força chega enquanto o job está RUNNING: o executor pede outra tentativa ──
    console.log('6d) força que chega durante a execução: o executor não a honrou, e o FECHAMENTO devolve o job à fila (REV-03/REV-06)')
    const { enfileirarRecomposicao, fecharJob, pedirNovaTentativa } = await import('../src/lib/ai/generation-queue')
    const payloadNormal = { generationId: persistido.generationId, projectId: PROJETO, recompor: { pageId, origem: 'editor' } }
    const jobId6d = await enfileirarRecomposicao({ generationId: persistido.generationId, projectId: PROJETO, recompor: { pageId, origem: 'editor' } })
    await db.generationJob.update({ where: { id: jobId6d }, data: { status: 'RUNNING', attempts: 1, maxAttempts: 3, startedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 600_000), payload: payloadNormal as never } })
    await enfileirarRecomposicao({ generationId: persistido.generationId, projectId: PROJETO, recompor: { pageId, origem: 'editor', forcar: true } })
    const jobRunning = await db.generationJob.findUnique({ where: { id: jobId6d }, select: { status: true, payload: true, maxAttempts: true } })
    const pedidaEm6d = String((jobRunning?.payload as Record<string, any>)?.recompor?.forcaPedidaEm ?? '')
    conferir('o job RUNNING recebeu o payload forçado, com o carimbo forcaPedidaEm', jobRunning?.status === 'RUNNING' && (jobRunning.payload as Record<string, any>).recompor?.forcar === true && pedidaEm6d.length > 0, pedidaEm6d)
    // a execução em curso partiu SEM força e termina sem honrá-la
    await processarRecomposicaoEmBackground({ generationId: persistido.generationId, projectId: PROJETO, recompor: { pageId, origem: 'editor' }, queueJobId: jobId6d })
    const desfecho6d = await fecharJob(jobId6d, persistido.generationId)
    const jobDepoisDo6d = await db.generationJob.findUnique({ where: { id: jobId6d }, select: { status: true, lastError: true, payload: true } })
    conferir('fecharJob devolveu o job à fila (REENFILEIRADO → PENDING) com o motivo, em vez de DONE com a força no payload', desfecho6d === 'REENFILEIRADO' && jobDepoisDo6d?.status === 'PENDING' && /forçada/.test(String(jobDepoisDo6d.lastError)), `${desfecho6d}; ${jobDepoisDo6d?.status}: ${jobDepoisDo6d?.lastError}`)
    // a execução seguinte, FORÇADA, honra o pedido e fecha DONE
    await db.generationJob.update({ where: { id: jobId6d }, data: { status: 'RUNNING', attempts: { increment: 1 }, startedAt: new Date() } })
    await processarRecomposicaoEmBackground({ generationId: persistido.generationId, projectId: PROJETO, recompor: (jobDepoisDo6d!.payload as Record<string, any>).recompor, queueJobId: jobId6d })
    const desfecho6dB = await fecharJob(jobId6d, persistido.generationId)
    const jobFim6d = await db.generationJob.findUnique({ where: { id: jobId6d }, select: { status: true, payload: true } })
    conferir('a execução forçada seguinte marca forcaAtendida = forcaPedidaEm e o job fecha DONE', desfecho6dB === 'DONE' && jobFim6d?.status === 'DONE' && (jobFim6d.payload as Record<string, any>).recompor?.forcaAtendida === pedidaEm6d, `${desfecho6dB}; atendida=${(jobFim6d?.payload as Record<string, any>)?.recompor?.forcaAtendida}`)
    const urlDaArte = async () => (await db.generation.findUnique({ where: { id: persistido.generationId }, select: { resultUrl: true } }))?.resultUrl ?? null
    { const u = await urlDaArte(); if (u) blobs.add(u) }

    console.log('6e) a força chega no job RUNNING da ÚLTIMA tentativa: ganha orçamento próprio e a re-execução cabe (REV-07)')
    await db.generationJob.update({ where: { id: jobId6d }, data: { status: 'RUNNING', attempts: 3, maxAttempts: 3, startedAt: new Date(), payload: payloadNormal as never } })
    await enfileirarRecomposicao({ generationId: persistido.generationId, projectId: PROJETO, recompor: { pageId, origem: 'editor', forcar: true } })
    const job6e = await db.generationJob.findUnique({ where: { id: jobId6d }, select: { status: true, attempts: true, maxAttempts: true, payload: true } })
    conferir('maxAttempts subiu para attempts + 1 (3 → 4) e o payload é o forçado', job6e?.status === 'RUNNING' && job6e.attempts === 3 && job6e.maxAttempts === 4 && (job6e.payload as Record<string, any>).recompor?.forcar === true, `${job6e?.attempts}/${job6e?.maxAttempts}`)
    // A execução NORMAL em curso não escreve no job (só a forçada marca
    // `forcaAtendida`, provado em 6d): o que se prova aqui é o FECHAMENTO, e
    // rodar o render de novo só gastaria Blob (ver `pausaParaOBlob`).
    const desfecho6e = await fecharJob(jobId6d, persistido.generationId)
    const job6eDepois = await db.generationJob.findUnique({ where: { id: jobId6d }, select: { status: true, attempts: true, maxAttempts: true } })
    conferir('o fechamento devolve à fila e a próxima varredura ainda pega o job (attempts < maxAttempts)', desfecho6e === 'REENFILEIRADO' && job6eDepois?.status === 'PENDING' && job6eDepois.attempts < job6eDepois.maxAttempts, `${desfecho6e}; ${job6eDepois?.attempts}/${job6eDepois?.maxAttempts}`)
    { const u = await urlDaArte(); if (u) blobs.add(u) }

    console.log('6f) a força chega DEPOIS de o executor terminar e ANTES do fechamento: REENFILEIRADO, nunca DONE (REV-06)')
    await db.generationJob.update({ where: { id: jobId6d }, data: { status: 'RUNNING', attempts: 1, maxAttempts: 3, startedAt: new Date(), payload: payloadNormal as never } })
    // (a execução normal terminou — sem escrever no job, como em 6e) e a força chega ANTES do fechamento:
    await enfileirarRecomposicao({ generationId: persistido.generationId, projectId: PROJETO, recompor: { pageId, origem: 'editor', forcar: true } })
    const desfecho6f = await fecharJob(jobId6d, persistido.generationId)
    const job6f = await db.generationJob.findUnique({ where: { id: jobId6d }, select: { status: true, payload: true } })
    conferir('força na janela entre o runner e o fechamento: o job volta à fila com o pedido', desfecho6f === 'REENFILEIRADO' && job6f?.status === 'PENDING' && (job6f.payload as Record<string, any>).recompor?.forcar === true, `${desfecho6f}; ${job6f?.status}`)
    { const u = await urlDaArte(); if (u) blobs.add(u) }
    // fecha o job de vez (a força atendida) para o passo 7 encontrar a fila limpa
    await db.generationJob.update({ where: { id: jobId6d }, data: { status: 'DONE', finishedAt: new Date(), payload: { ...(job6f!.payload as object), recompor: { ...((job6f!.payload as Record<string, any>).recompor as object), forcaAtendida: (job6f!.payload as Record<string, any>).recompor?.forcaPedidaEm } } as never } })

    // ── 6g. a página muda ENQUANTO a arte é recomposta (REV-05) ─────────────
    await pausaParaOBlob(75_000, 'a segunda peça e as execuções de 6g/6h buscam fontes, foto e logo no Blob')
    console.log('6g) segunda peça: o revisor grava um ajuste (render falha) ENQUANTO a arte era recomposta — nada é gravado por cima (REV-05)')
    const composta2 = await comporPeca(
      {
        projectId: PROJETO,
        formato: 'story',
        foto: { url: fotoUrl },
        blocos: [
          { papel: 'pre', linhas: ['Prova do revisor 2'] },
          { papel: 'headline', linhas: ['Segunda peça', 'da prova'] },
          { papel: 'apoio', linhas: ['Também pode apagar.'] },
          { papel: 'cta', linhas: ['Fale com a gente'] },
          { papel: 'servico', linhas: ['Seg a sex · 9h às 18h'] },
        ],
        nome: `${MARCA} peça 2`,
        quando,
        tema: `${MARCA} teste 2`,
      },
      { canal: 'claude-code' },
    )
    const persistido2 = composta2.persistido
    if (!persistido2) abortar('a segunda composição não persistiu nada')
    const pageId2 = persistido2.pageId
    blobs.add(persistido2.url)
    const carrossel2 = await db.socialPost.create({
      data: { projectId: PROJETO, userId: projeto.userId, postType: 'CAROUSEL', caption: `${MARCA} carrossel 2 — pode apagar`, mediaUrls: [fotoUrl, persistido2.url], scheduleType: 'SCHEDULED', scheduledDatetime: daqui7, status: 'DRAFT', publishType: 'REMINDER', renderStatus: 'NOT_NEEDED' },
      select: { id: true },
    })
    posts.push(carrossel2.id)
    const camadasDaPagina = async (id: string) => lerCamadas((await db.page.findUnique({ where: { id }, select: { layers: true } }))!.layers).camadas as Array<Record<string, any>>
    const camadas2 = await camadasDaPagina(pageId2)
    const headline2 = camadas2.find((c) => c.type === 'text' && c.metadata?.compositor?.papel === 'headline')
    const gradiente2 = camadas2.find((c) => (c.type === 'gradient' || c.type === 'gradient2') && c.metadata?.tratamentoDeTexto)
    const forcaDe = (camadas: Array<Record<string, any>>) => Number(camadas.find((c) => c.id === gradiente2?.id)?.metadata?.forca ?? NaN)
    // 1. edição de TEXTO pelo editor → job normal (a recomposição vai RECOMPOR pela spec)
    const textoDo6g = 'Segunda peça\neditada'
    await db.page.update({ where: { id: pageId2 }, data: { layers: camadas2.map((c) => (c.id === headline2?.id ? { ...c, content: textoDo6g } : c)) as never } })
    const { levantarPagina, recomporPaginaDefasada } = await import('../src/lib/compositor/recompor')
    const pedido6g = await pedirRecomposicaoDaArteCongelada([pageId2])
    const jobId2 = pedido6g[0]?.jobId ?? null
    const lev6g = await levantarPagina(pageId2)
    conferir('a edição é só de texto (a recomposição RECOMPORIA pela spec) e há job normal pendente', lev6g?.defasagem.soTexto === true && !lev6g.defasagem.ilegivel && !!jobId2, JSON.stringify({ soTexto: lev6g?.defasagem.soTexto, papeis: lev6g?.defasagem.papeis, job: jobId2 }))
    if (jobId2) await db.generationJob.update({ where: { id: jobId2 }, data: { status: 'RUNNING', attempts: 1, startedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 600_000) } })
    // 2. a recomposição roda; ENTRE a leitura e a gravação, o revisor grava um ajuste de gradiente e o render falha
    const forcaNova2 = Math.min(0.9, Math.round((Number(gradiente2?.metadata?.forca ?? 0.5) + 0.15) * 1000) / 1000)
    const ajuste2 = { tipo: 'gradiente' as const, borda: (gradiente2?.metadata?.borda === 'topo' ? 'topo' : 'rodape') as 'topo' | 'rodape', forca: forcaNova2, ...(gradiente2 ? { camadas: [String(gradiente2.id)] } : {}) }
    let erroDoAjuste6g: Awaited<ReturnType<typeof erroDe>> = null
    const e6g = await erroDe(
      recomporPaginaDefasada({
        pageId: pageId2,
        origem: 'editor',
        antesDeGravar: async () => {
          const rv = await revisarArte({ projectId: PROJETO, pageId: pageId2, visao: false, previa: false })
          process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_INVALIDO_prova'
          erroDoAjuste6g = await erroDe(ajustarArte({ projectId: PROJETO, pageId: pageId2, versaoEsperada: rv.versao, ajustes: [ajuste2], canal: 'claude-code' }))
          process.env.BLOB_READ_WRITE_TOKEN = tokenDoBlob
        },
      }),
    )
    const pagina6g = await camadasDaPagina(pageId2)
    const gen6g = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { resultUrl: true } })
    const job6g = jobId2 ? await db.generationJob.findUnique({ where: { id: jobId2 }, select: { status: true, payload: true, attempts: true, maxAttempts: true } }) : null
    conferir('o ajuste do revisor gravou a página e o render falhou (como no passo 6)', !!erroDoAjuste6g && erroDoAjuste6g.code !== 'VERSAO_DIVERGENTE', erroDoAjuste6g?.message.slice(0, 60))
    conferir('a recomposição recusou gravar por cima (PAGINA_MUDOU_DURANTE 409)', e6g?.code === 'PAGINA_MUDOU_DURANTE' && e6g.status === 409, e6g?.message.slice(0, 80))
    conferir('a página ficou com o ajuste concorrente E o texto editado (nada foi sobrescrito)', forcaDe(pagina6g) === forcaNova2 && String(pagina6g.find((c) => c.id === headline2?.id)?.content) === textoDo6g, `força ${forcaDe(pagina6g)} (esperava ${forcaNova2})`)
    conferir('a arte não trocou (a composição foi descartada)', gen6g?.resultUrl === persistido2.url)
    conferir('o job RUNNING foi promovido à força pelo ajuste, com orçamento (maxAttempts ≥ attempts + 1)', job6g?.status === 'RUNNING' && (job6g.payload as Record<string, any>).recompor?.forcar === true && job6g.maxAttempts >= job6g.attempts + 1, job6g ? `${job6g.attempts}/${job6g.maxAttempts}` : 'sem job')
    // 3. como faria o executor: a falha vira nova tentativa e o fechamento devolve à fila
    if (jobId2) {
      await pedirNovaTentativa(jobId2, e6g?.message ?? 'PAGINA_MUDOU_DURANTE')
      const d = await fecharJob(jobId2, persistido2.generationId)
      conferir('o executor devolve o job à fila (REENFILEIRADO)', d === 'REENFILEIRADO', d)
      // 4. a execução seguinte é a FORÇADA: re-render como está — texto novo E força nova preservados
      const jobF = await db.generationJob.findUnique({ where: { id: jobId2 }, select: { payload: true } })
      await db.generationJob.update({ where: { id: jobId2 }, data: { status: 'RUNNING', attempts: { increment: 1 }, startedAt: new Date() } })
      await processarRecomposicaoEmBackground({ generationId: persistido2.generationId, projectId: PROJETO, recompor: (jobF!.payload as Record<string, any>).recompor, queueJobId: jobId2 })
      const dF = await fecharJob(jobId2, persistido2.generationId)
      const genF = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { resultUrl: true, fieldValues: true } })
      if (genF?.resultUrl) blobs.add(genF.resultUrl)
      const paginaF = await camadasDaPagina(pageId2)
      const carrosselF = await db.socialPost.findUnique({ where: { id: carrossel2.id }, select: { mediaUrls: true } })
      conferir('a execução forçada re-renderiza como está (não recompõe), fecha DONE e marca somenteReRender', dF === 'DONE' && (genF?.fieldValues as Record<string, any>)?.recomposicao?.estado === 're-renderizada' && !!(genF?.fieldValues as Record<string, any>)?.somenteReRender, `${dF}; ${(genF?.fieldValues as Record<string, any>)?.recomposicao?.estado}`)
      conferir('texto editado e força ajustada estão na página e o slide trocou', String(paginaF.find((c) => c.id === headline2?.id)?.content) === textoDo6g && forcaDe(paginaF) === forcaNova2 && carrosselF?.mediaUrls[1] === genF?.resultUrl && carrosselF.mediaUrls.length === 2)
    }

    // ── 6h. somenteReRender isolado: spec válida, SÓ texto mudou, e mesmo assim re-render ──
    await pausaParaOBlob(45_000, 'mais um render no Blob')
    console.log('6h) somenteReRender isolado: edição SÓ de texto numa página recuperada (spec válida, soTexto) re-renderiza, não recompõe')
    const textoDo6h = 'Segunda peça\nde novo'
    const camadas6h = await camadasDaPagina(pageId2)
    await db.page.update({ where: { id: pageId2 }, data: { layers: camadas6h.map((c) => (c.id === headline2?.id ? { ...c, content: textoDo6h } : c)) as never } })
    const pedido6h = await pedirRecomposicaoDaArteCongelada([pageId2])
    const jobId6h = pedido6h[0]?.jobId ?? null
    const lev6h = await levantarPagina(pageId2)
    conferir('a defasagem é só de texto (sem a marca, isto RECOMPORIA pela spec)', lev6h?.defasagem.soTexto === true && !lev6h.defasagem.ilegivel && !!jobId6h, JSON.stringify({ soTexto: lev6h?.defasagem.soTexto, papeis: lev6h?.defasagem.papeis }))
    if (jobId6h) {
      const job6h = await db.generationJob.findUnique({ where: { id: jobId6h }, select: { payload: true } })
      conferir('o job é NORMAL (sem forcar)', (job6h?.payload as Record<string, any>)?.recompor?.forcar !== true)
      await db.generationJob.update({ where: { id: jobId6h }, data: { status: 'RUNNING', attempts: 1, startedAt: new Date() } })
      await processarRecomposicaoEmBackground({ generationId: persistido2.generationId, projectId: PROJETO, recompor: (job6h!.payload as Record<string, any>).recompor, queueJobId: jobId6h })
      const d6h = await fecharJob(jobId6h, persistido2.generationId)
      const gen6h = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { resultUrl: true, fieldValues: true } })
      if (gen6h?.resultUrl) blobs.add(gen6h.resultUrl)
      const pagina6h = await camadasDaPagina(pageId2)
      conferir('re-renderizada (não "feita" pela spec), DONE, texto novo e força ajustada preservados (REV-04 isolado)', d6h === 'DONE' && (gen6h?.fieldValues as Record<string, any>)?.recomposicao?.estado === 're-renderizada' && String(pagina6h.find((c) => c.id === headline2?.id)?.content) === textoDo6h && forcaDe(pagina6h) === forcaNova2, `${d6h}; ${(gen6h?.fieldValues as Record<string, any>)?.recomposicao?.estado}; força ${forcaDe(pagina6h)}`)
    }

    // a copy de referência do passo 7 passa a ser a da página como está agora
    for (const k of Object.keys(copyOriginal)) delete (copyOriginal as Record<string, unknown>)[k]
    Object.assign(copyOriginal, copyDeCamadas(paginaDo6c.layers))

    await db.socialPost.update({ where: { id: unico.postId }, data: { renderStatus: 'RENDERED' } })
    await db.generationJob.updateMany({ where: { generationId: { in: idsDaPaginaDo6 }, kind: 'COMPOR' }, data: { status: 'DONE', finishedAt: new Date() } })

    // ── 7. ajuste aplicado ─────────────────────────────────────────────────
    console.log('7) revisar de novo e aplicar um ajuste')
    const r7 = await revisarArte({ projectId: PROJETO, pageId, visao: false, previa: false })
    const headline = camadasDo6.find((c) => c.type === 'text' && /headline/i.test(String(c.name ?? c.id)))
    const ajustes = r7.relatorio.ajustes.length > 0 ? r7.relatorio.ajustes : [{ tipo: 'mover' as const, camadas: [String(headline?.id)], dy: -10 }]
    const a7 = await ajustarArte({ projectId: PROJETO, pageId, versaoEsperada: r7.versao, ajustes, canal: 'claude-code' })
    blobs.add(a7.url)
    const paginaDepois = await db.page.findUnique({ where: { id: pageId }, select: { layers: true } })
    const copyDepois = copyDeCamadas(lerCamadas(paginaDepois!.layers).camadas as never)
    conferir('versão mudou depois do ajuste', !!a7.versao && a7.versao !== r7.versao, `${r7.versao} → ${a7.versao}`)
    conferir('algum ajuste aplicado', (a7.ajustesAplicados?.length ?? 0) > 0, `${a7.ajustesAplicados?.length ?? 0} aplicado(s), ${a7.ajustesRecusados?.length ?? 0} recusado(s)`)
    conferir('a copy ficou intacta', JSON.stringify(copyDepois) === JSON.stringify(copyOriginal))
    const geracoesDepoisDo7 = await db.generation.count({ where: { projectId: PROJETO, fieldValues: { path: ['pageId'], equals: pageId } } })
    conferir('uma Generation nova de ajuste-arte', geracoesDepoisDo7 === geracoesAntesDo6 + 1, `${geracoesAntesDo6} → ${geracoesDepoisDo7}`)
    conferir('a conferência 6b não deixou a copy diferente', JSON.stringify(copyDepois) === JSON.stringify(copyOriginal))
    const unicoDepois = await db.socialPost.findUnique({ where: { id: unico.postId }, select: { renderStatus: true } })
    conferir('imagem única voltou à fila de render (PENDING)', unicoDepois?.renderStatus === 'PENDING', String(unicoDepois?.renderStatus))
    const idsDaPagina = (await db.generation.findMany({ where: { projectId: PROJETO, fieldValues: { path: ['pageId'], equals: pageId } }, select: { id: true } })).map((g) => g.id)
    // O ajuste criou uma Generation nova, e a fila é por generationId: o job
    // PENDENTE é o da arte mais nova (o do passo 6 ficou DONE de propósito).
    const job = await db.generationJob.findFirst({ where: { generationId: { in: idsDaPagina }, kind: 'COMPOR', status: 'PENDING' }, select: { id: true, status: true, payload: true } })
    const payload = (job?.payload ?? {}) as Record<string, any>
    conferir('slide de carrossel voltou à fila de recomposição (job COMPOR pendente com recompor)', !!job && payload.recompor?.pageId === pageId, job ? `job ${job.id} ${job.status}` : 'sem job pendente')
    const carrosselDepois = await db.socialPost.findUnique({ where: { id: carrossel.id }, select: { mediaUrls: true } })
    conferir('o carrossel não perdeu mídia', (carrosselDepois?.mediaUrls.length ?? 0) === 2)
    writeFileSync(resolve(SAIDA, 'ajuste-7.json'), JSON.stringify({ ajusteDeForca, ajustes, aplicados: a7.ajustesAplicados, recusados: a7.ajustesRecusados, versao: a7.versao }, null, 2))

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
    // Falha no meio da composição deixa Page (e às vezes Generation) sem que
    // `pageId` tenha sido preenchido: o que foi criado com a MARCA desta rodada
    // entra no cleanup do mesmo jeito (achado R2 da revisão do Codex).
    if (!pageId) {
      const orfas = await db.page.findMany({ where: { name: { contains: MARCA }, Template: { projectId: PROJETO } }, select: { id: true } })
      if (orfas.length === 1) pageId = orfas[0].id
      else if (orfas.length > 1) console.warn(`  ${orfas.length} páginas com a marca desta rodada — apagando todas`)
      for (const extra of orfas.slice(1)) {
        const gensExtra = await db.generation.findMany({ where: { projectId: PROJETO, fieldValues: { path: ['pageId'], equals: extra.id } }, select: { id: true, resultUrl: true } })
        for (const g of gensExtra) if (g.resultUrl) blobs.add(g.resultUrl)
        await db.generationJob.deleteMany({ where: { generationId: { in: gensExtra.map((g) => g.id) } } })
        criados.generations += (await db.generation.deleteMany({ where: { id: { in: gensExtra.map((g) => g.id) } } })).count
        await db.page.delete({ where: { id: extra.id } })
        criados.pages++
      }
      const gensSemPagina = await db.generation.findMany({ where: { projectId: PROJETO, createdAt: { gte: inicio }, fieldValues: { path: ['spec', 'nome'], equals: `${MARCA} peça` } }, select: { id: true, resultUrl: true } })
      for (const g of gensSemPagina) if (g.resultUrl) blobs.add(g.resultUrl)
      if (gensSemPagina.length) {
        await db.generationJob.deleteMany({ where: { generationId: { in: gensSemPagina.map((g) => g.id) } } })
        criados.generations += (await db.generation.deleteMany({ where: { id: { in: gensSemPagina.map((g) => g.id) } } })).count
      }
      const postsOrfaos = await db.socialPost.findMany({ where: { projectId: PROJETO, caption: { contains: MARCA } }, select: { id: true } })
      for (const p of postsOrfaos) if (!posts.includes(p.id)) posts.push(p.id)
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
    if (posts.length) {
      criados.posts = posts.length
      criados.sinais += (await db.learningSignal.deleteMany({ where: { projectId: PROJETO, postId: { in: posts }, createdAt: { gte: inicio } } })).count
      await db.socialPost.deleteMany({ where: { id: { in: posts } } })
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
