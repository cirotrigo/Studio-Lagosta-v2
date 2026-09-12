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
  if (condicao) ok++
  else mau++
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

  // O Blob de produção devolve 403 (o desafio anti-bot) no meio da rodada: as
  // provas 29 a 33 pararam no MESMO ponto, na logo da Lagosta que a prova
  // renderiza dezenas de vezes. O que se prova aqui é a composição e a revisão,
  // não a disponibilidade do Blob: neste processo, cada imagem do Blob é baixada
  // UMA vez por URL (a URL do Blob leva sufixo aleatório, o conteúdo dela não
  // muda), com User-Agent próprio e nova tentativa espaçada em 403/429/5xx. O
  // "render falhando" dos passos 6 e 9 continua real: ele vem do token de
  // gravação recusado, não da leitura de imagem.
  const { CanvasRenderer } = await import('../src/lib/canvas-renderer')
  const { loadImage } = await import('@napi-rs/canvas')
  const HOST_DO_BLOB = /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//
  const bytesDoBlob = new Map<string, Promise<Buffer>>()
  const esperasDoBlob = [20_000, 45_000, 90_000, 120_000]
  const baixarDoBlob = async (url: string): Promise<Buffer> => {
    for (let tentativa = 0; ; tentativa++) {
      const r = await fetch(url, { headers: { 'user-agent': 'studio-lagosta-prova/1.0 (validar-revisor-da-arte)' } })
      if (r.ok) return Buffer.from(await r.arrayBuffer())
      if (![403, 429, 500, 502, 503, 504].includes(r.status) || tentativa >= esperasDoBlob.length) throw new Error(`o Blob respondeu ${r.status}`)
      console.log(`  (Blob ${r.status} em ${url.split('/').pop()} — nova tentativa em ${esperasDoBlob[tentativa] / 1000}s)`)
      await new Promise((pronto) => setTimeout(pronto, esperasDoBlob[tentativa]))
    }
  }
  const prototipo = CanvasRenderer.prototype as unknown as { nodeImageLoader?: (url: string) => Promise<unknown> }
  const carregarOriginal = prototipo.nodeImageLoader
  if (typeof carregarOriginal !== 'function') abortar('CanvasRenderer.nodeImageLoader não existe mais: a leitura do Blob desta prova precisa ser refeita.')
  prototipo.nodeImageLoader = async function (this: unknown, url: string) {
    if (!HOST_DO_BLOB.test(url)) return carregarOriginal!.call(this, url)
    let bytes = bytesDoBlob.get(url)
    if (!bytes) {
      bytes = baixarDoBlob(url)
      bytesDoBlob.set(url, bytes)
      bytes.catch(() => bytesDoBlob.delete(url))
    }
    try {
      return await loadImage(await bytes)
    } catch (erro) {
      console.error('[prova] imagem do Blob indisponível:', url, erro)
      throw new Error(`Failed to load image: ${url}`)
    }
  }

  const projeto = await db.project.findUnique({ where: { id: PROJETO }, select: { id: true, name: true, userId: true } })
  if (!projeto) abortar(`Projeto ${PROJETO} não existe neste banco.`)

  const templatesAntes = new Set((await db.template.findMany({ where: { projectId: PROJETO }, select: { id: true } })).map((t) => t.id))
  const posts: string[] = []
  // Passo 9 (REV-9E-01): a leva e a dica de copy criadas pela prova, apagadas no cleanup.
  let plano9Id: string | null = null
  const sinaisDaProva: string[] = []
  const blobs = new Set<string>()
  /** Toda página que esta rodada criou (a 1ª e a 2ª peça): o cleanup limpa TODAS (REV-08). */
  const paginasCriadas: string[] = []
  /**
   * Generations de prova criadas em OUTRO projeto (a órfã alheia do 6s): o
   * cleanup externo filtra pelo PROJETO e pela MARCA e não as alcançaria. O id
   * entra aqui no instante da criação e é apagado no `finally` externo, pelo id
   * exato, com a falha de exclusão CONTADA — nunca engolida (REV-052-01).
   */
  const generationsAlheias: string[] = []
  /** Apaga Generations pelo id EXATO, uma a uma, e diz quais NÃO sumiram: exclusão que não acontece é falha da prova, não silêncio. */
  const apagarGenerationsPorId = async (ids: string[]): Promise<{ apagadas: string[]; faltaram: Array<{ id: string; motivo: string }> }> => {
    const apagadas: string[] = []
    const faltaram: Array<{ id: string; motivo: string }> = []
    for (const id of ids) {
      try {
        const r = await db.generation.deleteMany({ where: { id } })
        if (r.count === 1) apagadas.push(id)
        else faltaram.push({ id, motivo: `deleteMany devolveu ${r.count}` })
      } catch (e) {
        faltaram.push({ id, motivo: e instanceof Error ? e.message : String(e) })
      }
    }
    return { apagadas, faltaram }
  }
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
    // REV-2CEB-02: uma Generation de OUTRO projeto apontando para ESTA página (é o que o `konva-export` deixa
    // gravar e o que a prova do PR 6 cria) — mais recente que a arte real — NÃO pode ser a "arte da página":
    // o job tem de nascer preso à Generation deste projeto. Registrada para o cleanup pelo id exato.
    const outroProjeto6a = await db.project.findFirst({ where: { id: { not: PROJETO } }, select: { id: true, userId: true, Template: { take: 1, select: { id: true } } } })
    if (outroProjeto6a?.Template[0]) {
      const alheia = await db.generation.create({ data: { projectId: outroProjeto6a.id, templateId: outroProjeto6a.Template[0].id, createdBy: outroProjeto6a.userId, status: 'COMPLETED', resultUrl: 'https://exemplo.invalido/alheia-6a.png', fieldValues: { pageId, prova: '6a-alheia', marca: MARCA } as never }, select: { id: true } })
      generationsAlheias.push(alheia.id)
    }
    await pedirRecomposicaoDaArteCongelada([pageId])
    const idsDaPaginaDo6a = (await db.generation.findMany({ where: { projectId: PROJETO, fieldValues: { path: ['pageId'], equals: pageId } }, select: { id: true } })).map((g) => g.id)
    const jobDo6a = await db.generationJob.findFirst({ where: { generationId: { in: idsDaPaginaDo6a }, kind: 'COMPOR' }, select: { id: true, status: true, payload: true } })
    conferir('job normal pendente, SEM forcar', !!jobDo6a && jobDo6a.status === 'PENDING' && (jobDo6a.payload as Record<string, any>).recompor?.forcar !== true, jobDo6a ? `job ${jobDo6a.id}` : 'sem job')
    const jobsAlheios6a = generationsAlheias.length ? await db.generationJob.count({ where: { generationId: { in: generationsAlheias }, kind: 'COMPOR' } }) : 0
    conferir('REV-2CEB-02: a Generation de outro projeto com o pageId desta página (mais recente) NÃO recebeu o job — o levantamento é só do projeto da página', outroProjeto6a?.Template[0] ? jobsAlheios6a === 0 && !!jobDo6a : true, outroProjeto6a?.Template[0] ? `jobs na alheia: ${jobsAlheios6a}` : 'sem outro projeto no dev — não exercitado')

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
    // A URL da arte entra no cleanup IMEDIATAMENTE depois de cada render: dois renders seguidos sobre a mesma
    // Generation sobrescrevem `resultUrl`, e capturar só no fim deixava o 1º PNG no Blob (REV-9E-02).
    const urlDaArte = async () => (await db.generation.findUnique({ where: { id: persistido.generationId }, select: { resultUrl: true } }))?.resultUrl ?? null
    const jobId6d = await enfileirarRecomposicao({ generationId: persistido.generationId, projectId: PROJETO, recompor: { pageId, origem: 'editor' } })
    await db.generationJob.update({ where: { id: jobId6d }, data: { status: 'RUNNING', attempts: 1, maxAttempts: 3, startedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 600_000), payload: payloadNormal as never } })
    await enfileirarRecomposicao({ generationId: persistido.generationId, projectId: PROJETO, recompor: { pageId, origem: 'editor', forcar: true } })
    const jobRunning = await db.generationJob.findUnique({ where: { id: jobId6d }, select: { status: true, payload: true, maxAttempts: true } })
    const pedidaEm6d = String((jobRunning?.payload as Record<string, any>)?.recompor?.forcaPedidaEm ?? '')
    conferir('o job RUNNING recebeu o payload forçado, com o carimbo forcaPedidaEm', jobRunning?.status === 'RUNNING' && (jobRunning.payload as Record<string, any>).recompor?.forcar === true && pedidaEm6d.length > 0, pedidaEm6d)
    // a execução em curso partiu SEM força e termina sem honrá-la
    await processarRecomposicaoEmBackground({ generationId: persistido.generationId, projectId: PROJETO, recompor: { pageId, origem: 'editor' }, queueJobId: jobId6d })
    { const u = await urlDaArte(); if (u) blobs.add(u) }
    const desfecho6d = await fecharJob(jobId6d, persistido.generationId)
    const jobDepoisDo6d = await db.generationJob.findUnique({ where: { id: jobId6d }, select: { status: true, lastError: true, payload: true } })
    conferir('fecharJob devolveu o job à fila (REENFILEIRADO → PENDING) com o motivo, em vez de DONE com a força no payload', desfecho6d === 'REENFILEIRADO' && jobDepoisDo6d?.status === 'PENDING' && /forçada/.test(String(jobDepoisDo6d.lastError)), `${desfecho6d}; ${jobDepoisDo6d?.status}: ${jobDepoisDo6d?.lastError}`)
    // a execução seguinte, FORÇADA, honra o pedido e fecha DONE
    await db.generationJob.update({ where: { id: jobId6d }, data: { status: 'RUNNING', attempts: { increment: 1 }, startedAt: new Date() } })
    await processarRecomposicaoEmBackground({ generationId: persistido.generationId, projectId: PROJETO, recompor: (jobDepoisDo6d!.payload as Record<string, any>).recompor, queueJobId: jobId6d })
    const desfecho6dB = await fecharJob(jobId6d, persistido.generationId)
    const jobFim6d = await db.generationJob.findUnique({ where: { id: jobId6d }, select: { status: true, payload: true } })
    conferir('a execução forçada seguinte marca forcaAtendida = forcaPedidaEm e o job fecha DONE', desfecho6dB === 'DONE' && jobFim6d?.status === 'DONE' && (jobFim6d.payload as Record<string, any>).recompor?.forcaAtendida === pedidaEm6d, `${desfecho6dB}; atendida=${(jobFim6d?.payload as Record<string, any>)?.recompor?.forcaAtendida}`)
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
    paginasCriadas.push(pageId2)
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
    // REV-F01 (revisão FINAL): a trava `somenteReRender` nasce JUNTO da gravação
    // do ajuste — antes de qualquer render bem-sucedido. Sem ela, com o render e
    // as recuperações falhando, a edição de texto seguinte recomporia pela spec
    // antiga e desfaria o ajuste. O passo 6h prova o outro lado (trava ⇒ re-render).
    const genTravada6g = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { fieldValues: true } })
    const trava6g = (genTravada6g?.fieldValues as Record<string, any>)?.somenteReRender
    conferir('a trava somenteReRender foi gravada na arte JUNTO do ajuste, com o render falhando (REV-F01)', /ajuste do revisor/.test(String(trava6g?.motivo ?? '')), JSON.stringify(trava6g))
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

    // ── 6i. o ajuste chega ENTRE o levantamento e a leitura que compõe (REV-05, 2ª rodada) ──
    console.log('6i) o ajuste do revisor entra entre o levantamento e a leitura da página: a recomposição para ANTES de compor')
    const camadas6i = await camadasDaPagina(pageId2)
    const textoDo6i = 'Segunda peça\nterceira vez'
    await db.page.update({ where: { id: pageId2 }, data: { layers: camadas6i.map((c) => (c.id === headline2?.id ? { ...c, content: textoDo6i } : c)) as never } })
    const forcaDo6i = Math.min(0.9, Math.round((forcaNova2 + 0.05) * 1000) / 1000)
    const ajuste6i = { ...ajuste2, forca: forcaDo6i }
    let erroDoAjuste6i: Awaited<ReturnType<typeof erroDe>> = null
    const genAntes6i = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { resultUrl: true } })
    const e6i = await erroDe(
      recomporPaginaDefasada({
        pageId: pageId2,
        origem: 'editor',
        depoisDoLevantamento: async () => {
          const rv = await revisarArte({ projectId: PROJETO, pageId: pageId2, visao: false, previa: false })
          process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_INVALIDO_prova'
          erroDoAjuste6i = await erroDe(ajustarArte({ projectId: PROJETO, pageId: pageId2, versaoEsperada: rv.versao, ajustes: [ajuste6i], canal: 'claude-code' }))
          process.env.BLOB_READ_WRITE_TOKEN = tokenDoBlob
        },
      }),
    )
    const pagina6i = await camadasDaPagina(pageId2)
    const gen6i = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { resultUrl: true } })
    conferir('o ajuste gravou a página (render falhou) na janela entre as duas leituras', !!erroDoAjuste6i && erroDoAjuste6i.code !== 'VERSAO_DIVERGENTE', erroDoAjuste6i?.message.slice(0, 60))
    conferir('a recomposição parou ANTES de compor (PAGINA_MUDOU_DURANTE 409) — a decisão do levantamento não vale para a página nova', e6i?.code === 'PAGINA_MUDOU_DURANTE' && e6i.status === 409, e6i?.message.slice(0, 90))
    conferir('página com o ajuste E o texto novo; arte intocada', forcaDe(pagina6i) === forcaDo6i && String(pagina6i.find((c) => c.id === headline2?.id)?.content) === textoDo6i && gen6i?.resultUrl === genAntes6i?.resultUrl, `força ${forcaDe(pagina6i)} (esperava ${forcaDo6i})`)
    // fecha o pedido forçado que o ajuste deixou na fila desta página (o executor da prova não vai rodá-lo)
    {
      const jobs2 = await db.generationJob.findMany({ where: { generationId: persistido2.generationId }, select: { id: true, payload: true } })
      for (const j of jobs2) {
        const rec = (j.payload as Record<string, any>).recompor ?? {}
        await db.generationJob.update({ where: { id: j.id }, data: { status: 'DONE', finishedAt: new Date(), payload: { ...(j.payload as object), recompor: { ...rec, forcaAtendida: rec.forcaPedidaEm ?? '' } } as never } })
      }
    }

    // ── 6j. falha na última tentativa COM força pendente: falharJob devolve à fila (REV-06, 2ª rodada) ──
    console.log('6j) erro na última tentativa enquanto uma força chegou: falharJob devolve à fila em vez de FAILED')
    const { falharJob, reservarJob, buscarJob } = await import('../src/lib/ai/generation-queue')
    await db.generationJob.update({ where: { id: jobId6d }, data: { status: 'RUNNING', attempts: 3, maxAttempts: 3, startedAt: new Date(), payload: payloadNormal as never } })
    await enfileirarRecomposicao({ generationId: persistido.generationId, projectId: PROJETO, recompor: { pageId, origem: 'editor', forcar: true } })
    const desfecho6j = await falharJob(jobId6d, 'erro simulado da prova')
    const job6j = await db.generationJob.findUnique({ where: { id: jobId6d }, select: { status: true, attempts: true, maxAttempts: true, lastError: true, payload: true } })
    conferir('falharJob com força pendente → REENFILEIRADO/PENDING, com o motivo e a força no registro, e orçamento para rodar', desfecho6j === 'REENFILEIRADO' && job6j?.status === 'PENDING' && /forçada/.test(String(job6j.lastError)) && job6j.attempts < job6j.maxAttempts && (job6j.payload as Record<string, any>).recompor?.forcar === true, `${desfecho6j}; ${job6j?.status} ${job6j?.attempts}/${job6j?.maxAttempts}: ${job6j?.lastError}`)
    // sem força pendente, falharJob continua marcando FAILED
    await db.generationJob.update({ where: { id: jobId6d }, data: { status: 'RUNNING', payload: payloadNormal as never } })
    const desfecho6jB = await falharJob(jobId6d, 'erro simulado sem força')
    const job6jB = await db.generationJob.findUnique({ where: { id: jobId6d }, select: { status: true, lastError: true } })
    conferir('sem força pendente, falharJob marca FAILED com o motivo', desfecho6jB === 'FAILED' && job6jB?.status === 'FAILED' && job6jB.lastError === 'erro simulado sem força')

    // ── 6k. força promovida entre a varredura e a reserva: o executor roda o payload FRESCO (REV-07, 2ª rodada) ──
    console.log('6k) força que chega entre a varredura e a reserva: a reserva devolve o job fresco, com a força')
    await db.generationJob.update({ where: { id: jobId6d }, data: { status: 'PENDING', attempts: 2, maxAttempts: 3, nextAttemptAt: new Date(), payload: payloadNormal as never } })
    const capturadoPelaVarredura = await buscarJob(jobId6d)
    await enfileirarRecomposicao({ generationId: persistido.generationId, projectId: PROJETO, recompor: { pageId, origem: 'editor', forcar: true } })
    const fresco = await reservarJob(jobId6d)
    const estado6k = await db.generationJob.findUnique({ where: { id: jobId6d }, select: { status: true, attempts: true } })
    conferir('a varredura tinha o payload antigo (sem força) e a reserva devolve o fresco (com força), RUNNING 3/3', (capturadoPelaVarredura?.payload as Record<string, any>)?.recompor?.forcar !== true && (fresco?.payload as Record<string, any>)?.recompor?.forcar === true && estado6k?.status === 'RUNNING' && estado6k.attempts === 3 && fresco?.attempts === 3, JSON.stringify({ antes: (capturadoPelaVarredura?.payload as Record<string, any>)?.recompor?.forcar, depois: (fresco?.payload as Record<string, any>)?.recompor?.forcar, estado: estado6k }))
    // deixa a fila limpa para o passo 7
    {
      const rec = (fresco?.payload as Record<string, any>)?.recompor ?? {}
      await db.generationJob.update({ where: { id: jobId6d }, data: { status: 'DONE', finishedAt: new Date(), payload: { ...((fresco?.payload as object) ?? {}), recompor: { ...rec, forcaAtendida: rec.forcaPedidaEm ?? '' } } as never } })
    }

    // ── 6l. a PRÓPRIA execução forçada falha na última tentativa: FAILED terminal, reabrível (REV-09) ──
    console.log('6l) a execução FORÇADA falha na última tentativa: FAILED (não PENDING sem orçamento) e a próxima edição reabre o job')
    const { marcarForcaEmExecucao } = await import('../src/lib/ai/generation-queue')
    await db.generationJob.update({ where: { id: jobId6d }, data: { status: 'PENDING', attempts: 2, maxAttempts: 3, nextAttemptAt: new Date(), payload: payloadNormal as never } })
    await enfileirarRecomposicao({ generationId: persistido.generationId, projectId: PROJETO, recompor: { pageId, origem: 'editor', forcar: true } })
    const reservado6l = await reservarJob(jobId6d)
    const pedida6l = String((reservado6l?.payload as Record<string, any>)?.recompor?.forcaPedidaEm ?? '')
    // como o executor faz ao começar uma execução forçada:
    await marcarForcaEmExecucao(jobId6d, pedida6l)
    const desfecho6l = await falharJob(jobId6d, 'render falhou na execução forçada (simulado)')
    const job6l = await db.generationJob.findUnique({ where: { id: jobId6d }, select: { status: true, attempts: true, maxAttempts: true, lastError: true, payload: true } })
    conferir('a força que a própria execução tentava atender e falhou NÃO reabre: FAILED terminal, com o motivo', desfecho6l === 'FAILED' && job6l?.status === 'FAILED' && /simulado/.test(String(job6l.lastError)) && (job6l.payload as Record<string, any>).recompor?.forcaTentada === pedida6l, `${desfecho6l}; ${job6l?.status} ${job6l?.attempts}/${job6l?.maxAttempts}`)
    const reaberto = await enfileirarRecomposicao({ generationId: persistido.generationId, projectId: PROJETO, recompor: { pageId, origem: 'editor' } })
    const job6lB = await db.generationJob.findUnique({ where: { id: reaberto }, select: { status: true, attempts: true, maxAttempts: true, payload: true } })
    conferir('a próxima edição reabre o MESMO job do zero (PENDING 0/3, payload normal)', reaberto === jobId6d && job6lB?.status === 'PENDING' && job6lB.attempts === 0 && job6lB.maxAttempts === 3 && (job6lB.payload as Record<string, any>).recompor?.forcar !== true, `${job6lB?.status} ${job6lB?.attempts}/${job6lB?.maxAttempts}`)
    // e força NOVA chegando durante uma execução forçada que falha continua voltando à fila
    await db.generationJob.update({ where: { id: jobId6d }, data: { status: 'RUNNING', attempts: 3, maxAttempts: 3, startedAt: new Date(), payload: { ...payloadNormal, recompor: { ...payloadNormal.recompor, forcar: true, forcaPedidaEm: '2026-09-12T00:00:00.000Z', forcaTentada: '2026-09-12T00:00:00.000Z' } } as never } })
    await enfileirarRecomposicao({ generationId: persistido.generationId, projectId: PROJETO, recompor: { pageId, origem: 'editor', forcar: true } })
    const desfecho6lC = await falharJob(jobId6d, 'render falhou (simulado) com força nova a caminho')
    const job6lC = await db.generationJob.findUnique({ where: { id: jobId6d }, select: { status: true, attempts: true, maxAttempts: true } })
    conferir('força NOVA durante a execução forçada que falha: volta à fila COM orçamento', desfecho6lC === 'REENFILEIRADO' && job6lC?.status === 'PENDING' && job6lC.attempts < job6lC.maxAttempts, `${desfecho6lC}; ${job6lC?.status} ${job6lC?.attempts}/${job6lC?.maxAttempts}`)
    {
      const j = await db.generationJob.findUnique({ where: { id: jobId6d }, select: { payload: true } })
      const rec = (j?.payload as Record<string, any>)?.recompor ?? {}
      await db.generationJob.update({ where: { id: jobId6d }, data: { status: 'DONE', finishedAt: new Date(), payload: { ...((j?.payload as object) ?? {}), recompor: { ...rec, forcaAtendida: rec.forcaPedidaEm ?? '' } } as never } })
    }

    // ── 6m. a página muda ENQUANTO o re-render FORÇADO desenha (REV-F02, revisão FINAL) ──
    await pausaParaOBlob(45_000, 'dois renders no Blob (6m)')
    console.log('6m) só a força do gradiente muda ENQUANTO o re-render forçado desenha: o job volta à fila em vez de fechar DONE com o slide velho (REV-F02)')
    const camadas6m = await camadasDaPagina(pageId2)
    const forcaAntes6m = forcaDe(camadas6m)
    const forcaDurante6m = Math.max(0.45, Math.round((forcaAntes6m - 0.1) * 1000) / 1000)
    const pedido6m = await pedirRecomposicaoDaArteCongelada([pageId2], 'editor', { forcar: true })
    const jobId6m = pedido6m[0]?.jobId ?? null
    conferir('há job FORÇADO na fila para a segunda peça', !!jobId6m && Number.isFinite(forcaAntes6m) && forcaDurante6m !== forcaAntes6m, JSON.stringify({ job: jobId6m, forcaAntes: forcaAntes6m, forcaDurante: forcaDurante6m }))
    if (jobId6m) {
      const reservado6m = await reservarJob(jobId6m)
      const rec6m = (reservado6m?.payload as Record<string, any>)?.recompor
      const genAntes6m = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { resultUrl: true } })
      await processarRecomposicaoEmBackground({
        generationId: persistido2.generationId,
        projectId: PROJETO,
        recompor: rec6m,
        queueJobId: jobId6m,
        seams: {
          // o editor salva OUTRA força de gradiente (sem mudar copy) enquanto o render desenha
          antesDeRenderizar: async () => {
            const c = await camadasDaPagina(pageId2)
            await db.page.update({ where: { id: pageId2 }, data: { layers: c.map((l) => (l.id === gradiente2?.id ? { ...l, metadata: { ...(l.metadata ?? {}), forca: forcaDurante6m } } : l)) as never } })
          },
        },
      })
      const job6m = await db.generationJob.findUnique({ where: { id: jobId6m }, select: { status: true, lastError: true, attempts: true, maxAttempts: true, payload: true } })
      const gen6m = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { resultUrl: true } })
      if (gen6m?.resultUrl) blobs.add(gen6m.resultUrl)
      const rec6mDepois = (job6m?.payload as Record<string, any>)?.recompor ?? {}
      conferir('o re-render desenhou a versão lida, mas a página mudou durante (só a força): o job VOLTOU À FILA com o motivo, em vez de DONE', gen6m?.resultUrl !== genAntes6m?.resultUrl && job6m?.status === 'PENDING' && /editada de novo/.test(String(job6m.lastError)), `${job6m?.status} ${job6m?.attempts}/${job6m?.maxAttempts}: ${String(job6m?.lastError).slice(0, 60)}`)
      conferir('a força NÃO foi marcada como atendida (a execução não refletiu a página nova)', rec6mDepois.forcaAtendida !== rec6mDepois.forcaPedidaEm, JSON.stringify({ pedida: rec6mDepois.forcaPedidaEm, atendida: rec6mDepois.forcaAtendida }))
      const d6m = await fecharJob(jobId6m, persistido2.generationId)
      conferir('o fechamento devolve REENFILEIRADO', d6m === 'REENFILEIRADO', d6m)
      // a execução seguinte (ainda forçada) desenha a página COMO ESTÁ AGORA
      const reservado6mB = await reservarJob(jobId6m)
      await processarRecomposicaoEmBackground({ generationId: persistido2.generationId, projectId: PROJETO, recompor: (reservado6mB?.payload as Record<string, any>)?.recompor, queueJobId: jobId6m })
      const d6mB = await fecharJob(jobId6m, persistido2.generationId)
      const gen6mB = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { resultUrl: true } })
      if (gen6mB?.resultUrl) blobs.add(gen6mB.resultUrl)
      const carrossel6m = await db.socialPost.findUnique({ where: { id: carrossel2.id }, select: { mediaUrls: true } })
      const pagina6mB = await camadasDaPagina(pageId2)
      conferir('a execução seguinte fecha DONE, o slide carrega a arte da página ATUAL e a força gravada durante o render ficou', d6mB === 'DONE' && gen6mB?.resultUrl !== gen6m?.resultUrl && carrossel6m?.mediaUrls[1] === gen6mB?.resultUrl && carrossel6m.mediaUrls.length === 2 && forcaDe(pagina6mB) === forcaDurante6m, `${d6mB}; força ${forcaDe(pagina6mB)} (esperava ${forcaDurante6m}); slide=${carrossel6m?.mediaUrls[1] === gen6mB?.resultUrl}`)
    }

    // ── 6n. a divergência visual na ÚLTIMA tentativa nunca termina DONE (REV-D02) ──
    await pausaParaOBlob(45_000, 'um render no Blob (6n)')
    console.log('6n) mesma corrida do 6m, SEM orçamento (attempts = maxAttempts): falha explícita, força NÃO atendida, nunca DONE com o slide velho (REV-D02)')
    const camadas6n = await camadasDaPagina(pageId2)
    const forcaAntes6n = forcaDe(camadas6n)
    const forcaDurante6n = Math.min(0.9, Math.round((forcaAntes6n + 0.07) * 1000) / 1000)
    const pedido6n = await pedirRecomposicaoDaArteCongelada([pageId2], 'editor', { forcar: true })
    const jobId6n = pedido6n[0]?.jobId ?? null
    conferir('há job FORÇADO na fila para a segunda peça (6n)', !!jobId6n && forcaDurante6n !== forcaAntes6n, JSON.stringify({ job: jobId6n, forcaAntes: forcaAntes6n, forcaDurante: forcaDurante6n }))
    if (jobId6n) {
      const reservado6n = await reservarJob(jobId6n)
      const rec6n = (reservado6n?.payload as Record<string, any>)?.recompor
      const teto6n = await db.generationJob.findUnique({ where: { id: jobId6n }, select: { maxAttempts: true } })
      await db.generationJob.update({ where: { id: jobId6n }, data: { attempts: teto6n!.maxAttempts } })
      const genAntes6n = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { resultUrl: true } })
      const e6n = await erroDe(
        processarRecomposicaoEmBackground({
          generationId: persistido2.generationId,
          projectId: PROJETO,
          recompor: rec6n,
          queueJobId: jobId6n,
          seams: {
            antesDeRenderizar: async () => {
              const c = await camadasDaPagina(pageId2)
              await db.page.update({ where: { id: pageId2 }, data: { layers: c.map((l) => (l.id === gradiente2?.id ? { ...l, metadata: { ...(l.metadata ?? {}), forca: forcaDurante6n } } : l)) as never } })
            },
          },
        }),
      )
      const gen6n = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { resultUrl: true } })
      if (gen6n?.resultUrl) blobs.add(gen6n.resultUrl)
      const jobAberto6n = await db.generationJob.findUnique({ where: { id: jobId6n }, select: { status: true, payload: true } })
      const rec6nDepois = (jobAberto6n?.payload as Record<string, any>)?.recompor ?? {}
      conferir('sem orçamento, o runner FALHA explicitamente (PAGINA_MUDOU_DURANTE) em vez de seguir até o sucesso', e6n?.code === 'PAGINA_MUDOU_DURANTE' && gen6n?.resultUrl !== genAntes6n?.resultUrl, e6n?.message.slice(0, 90))
      conferir('a força NÃO foi marcada como atendida; o job segue RUNNING para o executor decidir', jobAberto6n?.status === 'RUNNING' && rec6nDepois.forcaAtendida !== rec6nDepois.forcaPedidaEm, JSON.stringify({ status: jobAberto6n?.status, pedida: rec6nDepois.forcaPedidaEm, atendida: rec6nDepois.forcaAtendida }))
      // como o executor faz com o erro: falharJob
      const d6n = await falharJob(jobId6n, e6n?.message ?? 'PAGINA_MUDOU_DURANTE')
      const job6n = await db.generationJob.findUnique({ where: { id: jobId6n }, select: { status: true, lastError: true, attempts: true, maxAttempts: true } })
      conferir('o executor fecha FAILED terminal com o motivo — nunca DONE; a próxima edição reabre o job', d6n === 'FAILED' && job6n?.status === 'FAILED' && /editada de novo/.test(String(job6n.lastError)), `${d6n}; ${job6n?.status} ${job6n?.attempts}/${job6n?.maxAttempts}: ${String(job6n?.lastError).slice(0, 60)}`)
      const gen6nRegistro = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { fieldValues: true } })
      const recusa6n = (gen6nRegistro?.fieldValues as Record<string, any>)?.recomposicao
      conferir('a recusa ficou registrada na arte (fieldValues.recomposicao) com o código', recusa6n?.codigo === 'PAGINA_MUDOU_DURANTE' || /PAGINA_MUDOU_DURANTE/.test(JSON.stringify(recusa6n ?? {})), JSON.stringify(recusa6n).slice(0, 120))
    }

    // ── 6o. página e trava numa transação (REV-D01), em peça SEM trava, lendo página E arte (REV-R02) ──
    console.log('6o) o ajuste grava a página e a trava numa TRANSAÇÃO: falhou depois da página, tudo volta; página e trava só aparecem juntas (REV-D01, REV-R02)')
    // 🔴 O leitor externo precisa de um cliente PRÓPRIO: no pool do dev uma
    // leitura pelo `db` com a transação aberta no MESMO cliente fica presa até
    // o timeout dela (P2028 aos 20s) — foi o que derrubou a rodada 14 (medido
    // por sonda isolada em 12/09/2026). Em produção o worker é OUTRO processo.
    const { PrismaClient } = await import('../prisma/generated/client')
    const leitor6o = new PrismaClient()
    const gensDaPagina2 = async (c: { generation: { findMany: (args: any) => Promise<any> } } = db): Promise<Array<{ id: string; fieldValues: unknown }>> =>
      c.generation.findMany({ where: { projectId: PROJETO, resultUrl: { not: null }, fieldValues: { path: ['pageId'], equals: pageId2 } }, select: { id: true, fieldValues: true }, orderBy: { createdAt: 'desc' } })
    const travaDe = (fv: unknown) => (fv && typeof fv === 'object' && !Array.isArray(fv) ? ((fv as Record<string, unknown>).somenteReRender ?? null) : null)
    const limparTrava = async () => {
      for (const g of await gensDaPagina2()) await db.$executeRaw`UPDATE "Generation" SET "fieldValues" = "fieldValues" - 'somenteReRender' WHERE "id" = ${g.id}`
    }
    // Precondição (REV-R02): os passos 6g–6n deixaram a segunda peça TRAVADA, e
    // com a trava `travarRecomposicaoDaArte` devolve cedo sem escrever nada —
    // a prova não estaria provando a criação da trava. A peça começa limpa.
    await limparTrava()
    const gens6oPre = await gensDaPagina2()
    conferir('precondição: a segunda peça começa SEM trava (a trava dos passos anteriores foi retirada da arte)', gens6oPre.length > 0 && gens6oPre.every((g) => !travaDe(g.fieldValues)), JSON.stringify(gens6oPre.map((g) => ({ id: g.id, trava: travaDe(g.fieldValues) }))))

    // 6o-a: falha controlada DEPOIS de a página ser escrita e ANTES da trava → a transação inteira volta
    const antes6oA = await db.page.findUnique({ where: { id: pageId2 }, select: { updatedAt: true } })
    const forcaAntes6oA = forcaDe(await camadasDaPagina(pageId2))
    const forcaDo6oA = Math.max(0.45, Math.round((forcaAntes6oA - 0.05) * 1000) / 1000)
    const rv6oA = await revisarArte({ projectId: PROJETO, pageId: pageId2, visao: false, previa: false })
    let dentro6oA: { updatedAt: Date } | null = null
    const e6oA = await erroDe(
      ajustarArte({
        projectId: PROJETO,
        pageId: pageId2,
        versaoEsperada: rv6oA.versao,
        ajustes: [{ ...ajuste2, forca: forcaDo6oA }],
        canal: 'claude-code',
        _prova: {
          entreGravarETravar: async () => {
            dentro6oA = await leitor6o.page.findUnique({ where: { id: pageId2 }, select: { updatedAt: true } })
            throw new Error('falha controlada da prova: a trava não pôde ser gravada')
          },
        },
      }),
    )
    const depois6oA = await db.page.findUnique({ where: { id: pageId2 }, select: { updatedAt: true } })
    const pagina6oA = await camadasDaPagina(pageId2)
    const travas6oA = (await gensDaPagina2()).map((g) => travaDe(g.fieldValues))
    conferir('falhou depois de escrever a página e antes da trava: o erro subiu e a PÁGINA voltou INTEIRA à versão anterior (mesma updatedAt, mesma força)', !!e6oA && e6oA.code !== 'VERSAO_DIVERGENTE' && depois6oA!.updatedAt.getTime() === antes6oA!.updatedAt.getTime() && forcaDe(pagina6oA) === forcaAntes6oA && forcaDo6oA !== forcaAntes6oA, `${String(e6oA?.message ?? '').slice(0, 70)}; força ${forcaDe(pagina6oA)} (antes ${forcaAntes6oA}, pedida ${forcaDo6oA})`)
    conferir('…e a arte continua SEM trava: nada da transação vazou', !!dentro6oA && travas6oA.every((t) => !t), JSON.stringify(travas6oA))

    // 6o-b: o caminho feliz: DENTRO da transação (página escrita, trava ainda não)
    // o leitor externo vê a página ANTERIOR e a arte SEM trava; depois do commit,
    // página e trava mudaram JUNTAS.
    const antes6o = await db.page.findUnique({ where: { id: pageId2 }, select: { updatedAt: true } })
    const camadas6o = await camadasDaPagina(pageId2)
    const forcaDo6o = Math.max(0.45, Math.round((forcaDe(camadas6o) - 0.05) * 1000) / 1000)
    const ajuste6o = { ...ajuste2, forca: forcaDo6o }
    let dentro6o: { pagina: { updatedAt: Date } | null; travas: unknown[] } | null = null
    const rv6o = await revisarArte({ projectId: PROJETO, pageId: pageId2, visao: false, previa: false })
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_INVALIDO_prova'
    const e6o = await erroDe(
      ajustarArte({
        projectId: PROJETO,
        pageId: pageId2,
        versaoEsperada: rv6o.versao,
        ajustes: [ajuste6o],
        canal: 'claude-code',
        _prova: {
          entreGravarETravar: async () => {
            const pagina = await leitor6o.page.findUnique({ where: { id: pageId2 }, select: { updatedAt: true } })
            const gens = await gensDaPagina2(leitor6o)
            dentro6o = { pagina, travas: gens.map((g) => travaDe(g.fieldValues)) }
          },
        },
      }),
    )
    process.env.BLOB_READ_WRITE_TOKEN = tokenDoBlob
    await leitor6o.$disconnect().catch(() => undefined)
    const depois6o = await db.page.findUnique({ where: { id: pageId2 }, select: { updatedAt: true } })
    const pagina6o = await camadasDaPagina(pageId2)
    const travas6o = (await gensDaPagina2()).map((g) => travaDe(g.fieldValues))
    const d6o = dentro6o as unknown as { pagina: { updatedAt: Date } | null; travas: unknown[] } | null
    conferir('o ajuste gravou a página (render falhou, como no passo 6)', !!e6o && e6o.code !== 'VERSAO_DIVERGENTE' && forcaDe(pagina6o) === forcaDo6o, `${e6o?.code} ${String(e6o?.message ?? '').slice(0, 120)}; força ${forcaDe(pagina6o)} (esperava ${forcaDo6o})`)
    conferir('DENTRO da transação (página escrita, trava ainda não) o leitor externo viu a página ANTERIOR e a arte SEM trava', !!d6o && !!d6o.pagina && d6o.pagina.updatedAt.getTime() === antes6o!.updatedAt.getTime() && d6o.travas.length > 0 && d6o.travas.every((t) => !t), JSON.stringify({ antes: antes6o?.updatedAt, dentro: d6o?.pagina?.updatedAt, travasDentro: d6o?.travas }))
    conferir('DEPOIS do commit a página mudou E a arte mais recente da página carrega a trava — as duas apareceram JUNTAS', depois6o!.updatedAt.getTime() !== antes6o!.updatedAt.getTime() && !!travas6o[0] && /ajuste do revisor/.test(String((travas6o[0] as Record<string, unknown> | null)?.motivo ?? '')), JSON.stringify({ depois: depois6o?.updatedAt, trava: travas6o[0] }).slice(0, 200))

    // ── 6p. a trava gravada ENQUANTO o worker refaz a arte sobrevive à escrita dele (REV-R01) ──
    await pausaParaOBlob(45_000, 'um render no Blob (6p)')
    console.log('6p) a trava nasce ENQUANTO o worker refaz a arte (depois de ele LER a arte, antes de ele GRAVÁ-LA): a escrita dele é MERGE no banco e a trava fica (REV-R01)')
    await limparTrava()
    conferir('precondição: a segunda peça está SEM trava quando o worker lê a arte', (await gensDaPagina2()).every((g) => !travaDe(g.fieldValues)))
    const pedido6p = await pedirRecomposicaoDaArteCongelada([pageId2], 'editor', { forcar: true })
    const jobId6p = pedido6p[0]?.jobId ?? null
    conferir('há job FORÇADO na fila para a segunda peça (6p)', !!jobId6p, String(jobId6p))
    if (jobId6p) {
      const reservado6p = await reservarJob(jobId6p)
      const rec6p = (reservado6p?.payload as Record<string, any>)?.recompor
      const genAntes6p = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { resultUrl: true } })
      let travaDurante6p: unknown = null
      let erroDoAjuste6p: { code?: string; message: string } | null = null
      let correu6p = false
      // O revisor entra DEPOIS de o worker ter lido a arte (ainda sem trava) e
      // ANTES de ele gravá-la — no ramo do re-render (`antesDeRenderizar`) ou
      // no da recomposição (`entreGravarPaginaEArte`): as duas escritas passam
      // pelo mesmo merge no banco.
      const revisorDurante = async () => {
        if (correu6p) return
        correu6p = true
        const c = await camadasDaPagina(pageId2)
        const forca = Math.min(0.9, Math.round((forcaDe(c) + 0.06) * 1000) / 1000)
        const rv = await revisarArte({ projectId: PROJETO, pageId: pageId2, visao: false, previa: false })
        process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_INVALIDO_prova'
        erroDoAjuste6p = await erroDe(ajustarArte({ projectId: PROJETO, pageId: pageId2, versaoEsperada: rv.versao, ajustes: [{ ...ajuste2, forca }], canal: 'claude-code' }))
        process.env.BLOB_READ_WRITE_TOKEN = tokenDoBlob
        travaDurante6p = travaDe((await gensDaPagina2())[0]?.fieldValues)
      }
      await processarRecomposicaoEmBackground({
        generationId: persistido2.generationId,
        projectId: PROJETO,
        recompor: rec6p,
        queueJobId: jobId6p,
        seams: { antesDeRenderizar: revisorDurante, entreGravarPaginaEArte: revisorDurante },
      })
      const gen6p = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { resultUrl: true, fieldValues: true } })
      if (gen6p?.resultUrl) blobs.add(gen6p.resultUrl)
      const fv6p = (gen6p?.fieldValues ?? {}) as Record<string, any>
      const job6p = await db.generationJob.findUnique({ where: { id: jobId6p }, select: { status: true, lastError: true } })
      const eAj6p = erroDoAjuste6p as unknown as { code?: string; message: string } | null
      conferir('o revisor gravou página + trava NO MEIO da execução do worker (o render dele falhou, como no passo 6)', correu6p && !!eAj6p && eAj6p.code !== 'VERSAO_DIVERGENTE' && !!travaDurante6p, `${eAj6p?.code} ${String(eAj6p?.message ?? '').slice(0, 60)}; trava durante: ${!!travaDurante6p}`)
      conferir('o worker gravou a arte DEPOIS (URL nova, registro da recomposição) e a trava do revisor SOBREVIVEU à escrita dele — merge no banco, não `{ ...fieldValues }` capturado', gen6p?.resultUrl !== genAntes6p?.resultUrl && ['feita', 're-renderizada'].includes(String(fv6p?.recomposicao?.estado)) && !!fv6p?.somenteReRender, JSON.stringify({ estado: fv6p?.recomposicao?.estado, trava: fv6p?.somenteReRender }).slice(0, 180))
      conferir('a página mudou durante: o runner devolveu o job à fila em vez de fechar DONE (como em 6m)', job6p?.status === 'PENDING' && /editada de novo/.test(String(job6p?.lastError)), `${job6p?.status}: ${String(job6p?.lastError).slice(0, 60)}`)
      const d6p = await fecharJob(jobId6p, persistido2.generationId)
      conferir('o fechamento devolve REENFILEIRADO', d6p === 'REENFILEIRADO', d6p)
      // O que faltava provar já foi provado; o job fecha à mão para não gastar outro render.
      {
        const j = await db.generationJob.findUnique({ where: { id: jobId6p }, select: { payload: true } })
        const rec = (j?.payload as Record<string, any>)?.recompor ?? {}
        await db.generationJob.update({ where: { id: jobId6p }, data: { status: 'DONE', finishedAt: new Date(), payload: { ...((j?.payload as object) ?? {}), recompor: { ...rec, forcaAtendida: rec.forcaPedidaEm ?? '' } } as never } })
      }
    }

    // ── 6q. a trava gravada ENQUANTO o worker RECOMPÕE (job NORMAL, não forçado) sobrevive à escrita dele (REV-S01) ──
    await pausaParaOBlob(45_000, 'um render no Blob (6q)')
    console.log('6q) job NORMAL — a execução RECOMPÕE pela spec, não re-renderiza: o revisor grava a trava entre o CAS da página e a escrita da arte; a arte termina `feita` COM a trava do revisor (a mesma, não uma recriada) e o job volta à fila (REV-S01)')
    await limparTrava()
    const genBase6q = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { resultUrl: true, fieldValues: true } })
    const fvBase6q = (genBase6q?.fieldValues ?? {}) as Record<string, any>
    const snapshot6q = lerCamadas(fvBase6q.layersSnapshot).camadas as Array<Record<string, any>>
    const headlineSnap6q = snapshot6q.find((c) => c.type === 'text' && c.metadata?.compositor?.papel === 'headline')
    const textoDo6q = 'Segunda peça\nrecomposta 6q'
    // A página volta ao que o compositor pousou (o snapshot da arte) com SÓ o
    // texto da manchete mudado: defasagem só de texto, sem ajuste manual —
    // é o que faz a execução RECOMPOR em vez de re-renderizar.
    await db.page.update({ where: { id: pageId2 }, data: { layers: snapshot6q.map((c) => (c.id === headlineSnap6q?.id ? { ...c, content: textoDo6q } : c)) as never } })
    const lev6q = await levantarPagina(pageId2)
    const temSpec6q = !!(lev6q as unknown as { arte?: { spec?: unknown } } | null)?.arte?.spec
    const travas6qPre = (await gensDaPagina2()).map((g) => travaDe(g.fieldValues))
    conferir('precondição 6q: peça SEM trava, com spec, e a defasagem é SÓ de texto (a execução vai RECOMPOR, não re-renderizar)', travas6qPre.every((t) => !t) && temSpec6q && lev6q?.defasagem.soTexto === true && !lev6q.defasagem.ilegivel && lev6q.defasagem.defasada === true, JSON.stringify({ travas: travas6qPre, spec: temSpec6q, soTexto: lev6q?.defasagem.soTexto, defasada: lev6q?.defasagem.defasada, mexido: lev6q?.defasagem.mexidoNaMao }))
    const pedido6q = await pedirRecomposicaoDaArteCongelada([pageId2], 'editor')
    const jobId6q = pedido6q[0]?.jobId ?? null
    conferir('há job NORMAL (não forçado) na fila para a segunda peça (6q)', !!jobId6q, String(jobId6q))
    if (jobId6q) {
      const reservado6q = await reservarJob(jobId6q)
      const rec6q = (reservado6q?.payload as Record<string, any>)?.recompor
      conferir('o payload do job 6q NÃO é forçado', !!rec6q && rec6q.forcar !== true, JSON.stringify(rec6q))
      let travaDurante6q: unknown = null
      let erroDoAjuste6q: { code?: string; message: string } | null = null
      let correu6q = 0
      const revisorDurante6q = async () => {
        correu6q++
        if (correu6q > 1) return
        const c = await camadasDaPagina(pageId2)
        // A recomposição acabou de reescrever as camadas: o gradiente é o da
        // página COMO ESTÁ agora (o id de antes pode ter mudado).
        const grad = c.find((l) => (l.type === 'gradient' || l.type === 'gradient2') && l.metadata?.tratamentoDeTexto)
        const forca = Math.min(0.9, Math.round((Number(grad?.metadata?.forca ?? 0.5) + 0.06) * 1000) / 1000)
        const ajuste = { tipo: 'gradiente' as const, borda: (grad?.metadata?.borda === 'topo' ? 'topo' : 'rodape') as 'topo' | 'rodape', forca, ...(grad ? { camadas: [String(grad.id)] } : {}) }
        const rv = await revisarArte({ projectId: PROJETO, pageId: pageId2, visao: false, previa: false })
        process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_INVALIDO_prova'
        erroDoAjuste6q = await erroDe(ajustarArte({ projectId: PROJETO, pageId: pageId2, versaoEsperada: rv.versao, ajustes: [ajuste], canal: 'claude-code' }))
        process.env.BLOB_READ_WRITE_TOKEN = tokenDoBlob
        travaDurante6q = travaDe((await gensDaPagina2())[0]?.fieldValues)
      }
      await processarRecomposicaoEmBackground({
        generationId: persistido2.generationId,
        projectId: PROJETO,
        recompor: rec6q,
        queueJobId: jobId6q,
        // SÓ a costura da RECOMPOSIÇÃO: se a execução caísse no re-render, o
        // revisor não rodaria e as conferências abaixo FALHAM — e é assim que
        // esta prova falha com a escrita antiga (`{ ...fieldValues }` capturado)
        // e passa com o merge no banco.
        seams: { entreGravarPaginaEArte: revisorDurante6q },
      })
      const gen6q = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { resultUrl: true, fieldValues: true } })
      if (gen6q?.resultUrl) blobs.add(gen6q.resultUrl)
      const fv6q = (gen6q?.fieldValues ?? {}) as Record<string, any>
      const job6q = await db.generationJob.findUnique({ where: { id: jobId6q }, select: { status: true, lastError: true } })
      const eAj6q = erroDoAjuste6q as unknown as { code?: string; message: string } | null
      conferir('a costura da RECOMPOSIÇÃO rodou UMA vez e o revisor gravou página + trava ali (o render dele falhou, como no passo 6)', correu6q === 1 && !!eAj6q && eAj6q.code !== 'VERSAO_DIVERGENTE' && !!travaDurante6q && /ajuste do revisor/.test(String((travaDurante6q as Record<string, unknown> | null)?.motivo ?? '')), `${correu6q}x; ${eAj6q?.code} ${String(eAj6q?.message ?? '').slice(0, 60)}; trava durante: ${JSON.stringify(travaDurante6q).slice(0, 120)}`)
      conferir('a arte foi RECOMPOSTA (URL nova e `recomposicao.estado === "feita"`), não re-renderizada', gen6q?.resultUrl !== genBase6q?.resultUrl && fv6q?.recomposicao?.estado === 'feita', JSON.stringify({ estado: fv6q?.recomposicao?.estado, mudouUrl: gen6q?.resultUrl !== genBase6q?.resultUrl }))
      conferir('a trava que sobreviveu é EXATAMENTE a do revisor (`desde` e motivo iguais aos capturados logo após o ajuste): o worker não a apagou nem a recriou', !!fv6q?.somenteReRender && JSON.stringify(fv6q.somenteReRender) === JSON.stringify(travaDurante6q), JSON.stringify({ final: fv6q?.somenteReRender, durante: travaDurante6q }).slice(0, 240))
      conferir('a página mudou durante (o ajuste do revisor): o runner devolveu o job à fila em vez de fechar DONE', job6q?.status === 'PENDING' && /editada de novo/.test(String(job6q?.lastError)), `${job6q?.status}: ${String(job6q?.lastError).slice(0, 60)}`)
      const d6q = await fecharJob(jobId6q, persistido2.generationId)
      conferir('o fechamento devolve REENFILEIRADO (6q)', d6q === 'REENFILEIRADO', d6q)
      // O que faltava provar já foi provado; o job fecha à mão para não gastar outro render.
      await db.generationJob.update({ where: { id: jobId6q }, data: { status: 'DONE', finishedAt: new Date() } })
    }

    // ── 6r. divergência SÓ DE GRADIENTE durante a recomposição: o retry re-renderiza a página COMO ESTÁ (REV-FINAL-01) ──
    await pausaParaOBlob(45_000, 'dois renders no Blob (6r)')
    console.log('6r) job NORMAL recompõe; ENTRE o CAS da página e a escrita da arte o editor salva SÓ o gradiente (paradas + força): o job volta à fila com "renderizar como está", e a execução seguinte RENDERIZA a página atual antes de fechar DONE (REV-FINAL-01)')
    await limparTrava()
    const genBase6r = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { resultUrl: true, fieldValues: true } })
    const snapshot6r = lerCamadas(((genBase6r?.fieldValues ?? {}) as Record<string, any>).layersSnapshot).camadas as Array<Record<string, any>>
    const headlineSnap6r = snapshot6r.find((c) => c.type === 'text' && c.metadata?.compositor?.papel === 'headline')
    await db.page.update({ where: { id: pageId2 }, data: { layers: snapshot6r.map((c) => (c.id === headlineSnap6r?.id ? { ...c, content: 'Segunda peça\nrecomposta 6r' } : c)) as never } })
    const lev6r = await levantarPagina(pageId2)
    conferir('precondição 6r: sem trava, defasagem só de texto', (await gensDaPagina2()).every((g) => !travaDe(g.fieldValues)) && lev6r?.defasagem.soTexto === true && lev6r.defasagem.defasada === true, JSON.stringify({ soTexto: lev6r?.defasagem.soTexto, mexido: lev6r?.defasagem.mexidoNaMao }))
    const pedido6r = await pedirRecomposicaoDaArteCongelada([pageId2], 'editor')
    const jobId6r = pedido6r[0]?.jobId ?? null
    conferir('há job NORMAL na fila (6r)', !!jobId6r, String(jobId6r))
    if (jobId6r) {
      const reservado6r = await reservarJob(jobId6r)
      const rec6r = (reservado6r?.payload as Record<string, any>)?.recompor
      let forcaDurante6r = NaN
      let paradasDurante6r: unknown = null
      const editorMexeNoGradiente = async () => {
        const c = await camadasDaPagina(pageId2)
        const grad = c.find((l) => (l.type === 'gradient' || l.type === 'gradient2') && l.metadata?.tratamentoDeTexto)
        if (!grad) return
        const stops = Array.isArray(grad.style?.gradientStops) ? (grad.style.gradientStops as Array<Record<string, any>>) : []
        // O editor salva OUTRA força E OUTRAS PARADAS (é o que muda os pixels — 6m/6n só mudavam `metadata.forca`).
        forcaDurante6r = Math.min(0.9, Math.round((Number(grad.metadata?.forca ?? 0.5) + 0.12) * 1000) / 1000)
        paradasDurante6r = stops.map((st) => ({ ...st, opacity: Math.min(1, Math.round(((typeof st.opacity === 'number' ? st.opacity : 1) * 1.2 + 0.05) * 1000) / 1000) }))
        await db.page.update({
          where: { id: pageId2 },
          data: { layers: c.map((l) => (l.id === grad.id ? { ...l, style: { ...(l.style ?? {}), gradientStops: paradasDurante6r }, metadata: { ...(l.metadata ?? {}), forca: forcaDurante6r } } : l)) as never },
        })
      }
      await processarRecomposicaoEmBackground({ generationId: persistido2.generationId, projectId: PROJETO, recompor: rec6r, queueJobId: jobId6r, seams: { entreGravarPaginaEArte: editorMexeNoGradiente } })
      const gen6rA = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { resultUrl: true, fieldValues: true } })
      if (gen6rA?.resultUrl) blobs.add(gen6rA.resultUrl)
      const job6rA = await db.generationJob.findUnique({ where: { id: jobId6r }, select: { status: true, lastError: true, payload: true } })
      const rec6rA = (job6rA?.payload as Record<string, any>)?.recompor ?? {}
      conferir('1ª execução: recompôs (URL nova, `feita`) e, como a página mudou durante (só gradiente), voltou à fila COM o marcador "renderizar como está" no payload — e SEM força', gen6rA?.resultUrl !== genBase6r?.resultUrl && ((gen6rA?.fieldValues ?? {}) as Record<string, any>).recomposicao?.estado === 'feita' && job6rA?.status === 'PENDING' && /editada de novo/.test(String(job6rA?.lastError)) && rec6rA.renderizarComoEsta === true && rec6rA.forcar !== true && Number.isFinite(forcaDurante6r), JSON.stringify({ status: job6rA?.status, payload: rec6rA }).slice(0, 200))
      const lev6rB = await levantarPagina(pageId2)
      conferir('ANTES do retry, a defasagem por conteúdo diz "em dia" (o diff não vê gradiente) e o slide já aponta para a arte atual — é o que fazia o retry sair sem renderizar', lev6rB?.defasagem.defasada === false && lev6rB.defasagem.mexidoNaMao.length === 0 && lev6rB.slides.every((sl) => sl.urlAntiga === gen6rA?.resultUrl), JSON.stringify({ defasada: lev6rB?.defasagem.defasada, mexido: lev6rB?.defasagem.mexidoNaMao, slides: lev6rB?.slides.length }))
      // 2ª execução (o retry): re-renderiza a página COMO ESTÁ
      // REV-C19-01: ANTES do retry o editor ainda muda o TEXTO. Agora a defasagem por conteúdo diz "defasada, só texto" — o caso em
      // que o retry, sem honrar o marcador, recomporia pela spec e apagaria o gradiente que o editor salvou.
      const paginaAntesDoRetry = await camadasDaPagina(pageId2)
      const headlineAntesDoRetry = paginaAntesDoRetry.find((c) => c.type === 'text' && c.metadata?.compositor?.papel === 'headline')
      const textoBis6r = 'Segunda peça\nrecomposta 6r-bis'
      await db.page.update({ where: { id: pageId2 }, data: { layers: paginaAntesDoRetry.map((l) => (l.id === headlineAntesDoRetry?.id ? { ...l, content: textoBis6r } : l)) as never } })
      const lev6rC = await levantarPagina(pageId2)
      conferir('o editor mudou o TEXTO antes do retry: a defasagem por conteúdo volta a dizer "defasada, só texto" — sem o marcador, este retry recomporia pela spec (REV-C19-01)', lev6rC?.defasagem.defasada === true && lev6rC.defasagem.soTexto === true && lev6rC.defasagem.mexidoNaMao.length === 0, JSON.stringify({ defasada: lev6rC?.defasagem.defasada, soTexto: lev6rC?.defasagem.soTexto }))
      const reservado6rB = await reservarJob(jobId6r)
      const rec6rB = (reservado6rB?.payload as Record<string, any>)?.recompor
      conferir('o payload do retry ainda carrega o marcador (o pedido normal da edição de texto não o apagou)', rec6rB?.renderizarComoEsta === true && rec6rB?.forcar !== true, JSON.stringify(rec6rB))
      await processarRecomposicaoEmBackground({ generationId: persistido2.generationId, projectId: PROJETO, recompor: rec6rB, queueJobId: jobId6r })
      const gen6rB = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { resultUrl: true, fieldValues: true } })
      if (gen6rB?.resultUrl) blobs.add(gen6rB.resultUrl)
      const fv6rB = (gen6rB?.fieldValues ?? {}) as Record<string, any>
      const pagina6rB = await camadasDaPagina(pageId2)
      const grad6rB = pagina6rB.find((l) => (l.type === 'gradient' || l.type === 'gradient2') && l.metadata?.tratamentoDeTexto)
      const headline6rB = pagina6rB.find((l) => l.id === headlineAntesDoRetry?.id)
      conferir('2ª execução: RENDERIZOU a página atual (URL nova de novo, `re-renderizada`, aviso "como está"), sem trava e sem reescrever as camadas — o gradiente do editor E o texto novo continuam na página (não recompôs pela spec, mesmo "defasada")', gen6rB?.resultUrl !== gen6rA?.resultUrl && fv6rB?.recomposicao?.estado === 're-renderizada' && (fv6rB?.recomposicao?.avisos ?? []).some((a: string) => /como está/.test(a)) && !fv6rB?.somenteReRender && Number(grad6rB?.metadata?.forca) === forcaDurante6r && JSON.stringify(grad6rB?.style?.gradientStops) === JSON.stringify(paradasDurante6r) && headline6rB?.content === textoBis6r, JSON.stringify({ estado: fv6rB?.recomposicao?.estado, avisos: fv6rB?.recomposicao?.avisos, forca: grad6rB?.metadata?.forca, headline: headline6rB?.content }).slice(0, 260))
      const d6r = await fecharJob(jobId6r, persistido2.generationId)
      const job6rB = await db.generationJob.findUnique({ where: { id: jobId6r }, select: { status: true, payload: true } })
      conferir('o job fecha DONE (a página não mudou durante o retry) e o marcador saiu do payload', d6r === 'DONE' && job6rB?.status === 'DONE' && ((job6rB?.payload as Record<string, any>)?.recompor ?? {}).renderizarComoEsta === undefined, `${d6r} ${job6rB?.status} ${JSON.stringify((job6rB?.payload as Record<string, any>)?.recompor)}`)
      const carrossel6r = await db.socialPost.findUnique({ where: { id: carrossel2.id }, select: { mediaUrls: true } })
      conferir('o slide do carrossel aponta para a arte re-renderizada e o carrossel não perdeu mídia', (carrossel6r?.mediaUrls ?? []).includes(String(gen6rB?.resultUrl)) && (carrossel6r?.mediaUrls.length ?? 0) === 2, JSON.stringify(carrossel6r?.mediaUrls?.map((u) => u.slice(-30))))
    }

    // ── 6s. a recuperação de job expirado não descarta força que chegou entre a leitura e a escrita (REV-127-01) ──
    console.log('6s) job RUNNING expirado com 3/3 tentativas: ENTRE a leitura dos vencidos e a escrita terminal, um ajuste promove o job (força nova, orçamento 4): a recuperação NÃO grava FAILED por cima — relê e devolve à fila com a força preservada (REV-127-01)')
    if (jobId6r) {
      const { recuperarJobsPerdidos } = await import('../src/lib/ai/generation-queue')
      const payloadNormal6s = { generationId: persistido2.generationId, projectId: PROJETO, recompor: { pageId: pageId2, origem: 'editor' } }
      await db.generationJob.update({ where: { id: jobId6r }, data: { status: 'RUNNING', attempts: 3, maxAttempts: 3, startedAt: new Date(Date.now() - 3_600_000), leaseExpiresAt: new Date(Date.now() - 600_000), finishedAt: null, payload: payloadNormal6s as never } })
      const genAntes6s = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { status: true } })
      // REV-4B-01: uma "órfã" de OUTRO projeto (PROCESSING há mais de 10 min, sem job) tem de ficar intacta na varredura restrita.
      const outroProjeto6s = await db.project.findFirst({ where: { id: { not: PROJETO } }, select: { id: true, userId: true, Template: { take: 1, select: { id: true } } } })
      const templateAlheio = outroProjeto6s?.Template[0]?.id ?? null
      const criarOrfaAlheia = async (rotulo: string) => {
        if (!templateAlheio || !outroProjeto6s) return null
        const criada = await db.generation.create({ data: { projectId: outroProjeto6s.id, templateId: templateAlheio, createdBy: outroProjeto6s.userId, status: 'PROCESSING', createdAt: new Date(Date.now() - 20 * 60_000), fieldValues: { prova: rotulo, marca: MARCA } as never }, select: { id: true, status: true, fieldValues: true } })
        // Registrada para o cleanup NO INSTANTE da criação: qualquer erro daqui em diante cai no `finally` externo, que a apaga (REV-052-01).
        generationsAlheias.push(criada.id)
        return criada
      }
      const orfa6s = await criarOrfaAlheia('6s')
      const r6s = await recuperarJobsPerdidos({
        apenas: [jobId6r],
        seams: {
          depoisDeLerOsVencidos: async () => {
            await enfileirarRecomposicao({ generationId: persistido2.generationId, projectId: PROJETO, recompor: { pageId: pageId2, origem: 'editor', forcar: true } })
          },
        },
      })
      const job6s = await db.generationJob.findUnique({ where: { id: jobId6r }, select: { status: true, attempts: true, maxAttempts: true, payload: true, lastError: true } })
      const rec6s = (job6s?.payload as Record<string, any>)?.recompor ?? {}
      const genDepois6s = await db.generation.findUnique({ where: { id: persistido2.generationId }, select: { status: true } })
      conferir('a recuperação NÃO marcou FAILED: relê depois de perder o CAS e devolve o job à fila (reenfileirados 1, falhados 0)', r6s.falhados === 0 && r6s.reenfileirados === 1 && job6s?.status === 'PENDING', JSON.stringify({ r: r6s, status: job6s?.status, lastError: job6s?.lastError }))
      conferir('a força promovida durante a corrida FICOU no payload, com o orçamento ampliado (3 → 4) e a Generation intacta', rec6s.forcar === true && typeof rec6s.forcaPedidaEm === 'string' && job6s?.maxAttempts === 4 && job6s.attempts === 3 && genDepois6s?.status === genAntes6s?.status, JSON.stringify({ recompor: rec6s, attempts: job6s?.attempts, maxAttempts: job6s?.maxAttempts, gen: genDepois6s?.status }))
      if (orfa6s) {
        const orfaDepois = await db.generation.findUnique({ where: { id: orfa6s.id }, select: { status: true, fieldValues: true } })
        conferir('a varredura RESTRITA (`apenas`) não tocou na órfã de outro projeto: continua PROCESSING, com o fieldValues intacto, e o resultado diz orfasSemJob 0 (REV-4B-01)', orfaDepois?.status === 'PROCESSING' && JSON.stringify(orfaDepois?.fieldValues) === JSON.stringify(orfa6s.fieldValues) && r6s.orfasSemJob === 0, JSON.stringify({ status: orfaDepois?.status, orfasSemJob: r6s.orfasSemJob }))
      } else {
        conferir('não há outro projeto com template no dev para exercitar a órfã alheia (REV-4B-01)', false)
      }
      // controle: sem corrida, 3/3 expirado vira FAILED terminal (o comportamento de sempre) — e a Generation COMPLETED não é tocada
      await db.generationJob.update({ where: { id: jobId6r }, data: { status: 'RUNNING', attempts: 3, maxAttempts: 3, leaseExpiresAt: new Date(Date.now() - 600_000), payload: payloadNormal6s as never } })
      const r6sB = await recuperarJobsPerdidos({ apenas: [jobId6r] })
      const job6sB = await db.generationJob.findUnique({ where: { id: jobId6r }, select: { status: true } })
      conferir('controle: sem promoção no meio, o job 3/3 expirado é FAILED terminal (falhados 1)', r6sB.falhados === 1 && job6sB?.status === 'FAILED')

      // REV-052-01: a órfã de prova é limpa MESMO quando o passo quebra depois de
      // criá-la — e a exclusão que não acontece é falha declarada, nunca silêncio.
      const orfa6sC = await criarOrfaAlheia('6s-c')
      if (orfa6sC) {
        await db.generationJob.update({ where: { id: jobId6r }, data: { status: 'RUNNING', attempts: 3, maxAttempts: 3, leaseExpiresAt: new Date(Date.now() - 600_000), finishedAt: null, payload: payloadNormal6s as never } })
        let erroDaCostura: unknown = null
        try {
          await recuperarJobsPerdidos({ apenas: [jobId6r], seams: { depoisDeLerOsVencidos: async () => { throw new Error('costura de prova quebrou de propósito (REV-052-01)') } } })
        } catch (e) {
          erroDaCostura = e
        }
        conferir('a costura que quebra DEPOIS de a órfã existir propaga o erro (o passo teria parado aqui) e a órfã já está registrada para o cleanup externo (REV-052-01)', erroDaCostura instanceof Error && /REV-052-01/.test(erroDaCostura.message) && generationsAlheias.includes(orfa6sC.id), erroDaCostura instanceof Error ? erroDaCostura.message : String(erroDaCostura))
        const aindaExiste = await db.generation.findUnique({ where: { id: orfa6sC.id }, select: { id: true } })
        conferir('a órfã continua no banco até o cleanup externo — é ele quem apaga, não o passo', Boolean(aindaExiste))
        const ensaio = await apagarGenerationsPorId(['inexistente-rev-052-01'])
        conferir('ensaio do cleanup: id que não existe volta em `faltaram` (falha explícita), nada é apagado', ensaio.apagadas.length === 0 && ensaio.faltaram.length === 1 && ensaio.faltaram[0].id === 'inexistente-rev-052-01', JSON.stringify(ensaio))
      }
      await db.generationJob.update({ where: { id: jobId6r }, data: { status: 'DONE', finishedAt: new Date(), lastError: null } })
    }

    // ── 6t. texto que o medidor não mede (curvo) deixa a cobertura PARCIAL, com o id (REV-127-03) ──
    console.log('6t) página com um texto CURVO ao lado dos textos normais: revisar-arte não finge que mediu — as regras de geometria saem "parcial" citando a camada (REV-127-03)')
    const camadasAntesDo6t = await camadasDaPagina(pageId2)
    const curvo6t = { id: 'curvo-prova-6t', name: 'curvo-prova-6t', type: 'text', visible: true, locked: false, order: 99, position: { x: 120, y: 900 }, size: { width: 600, height: 80 }, rotation: 0, content: 'Texto curvo de prova', style: { fontFamily: 'Arial', fontSize: 40, color: '#ffffff', lineHeight: 1.1 }, effects: { curved: { enabled: true, radius: 300 } } }
    await db.page.update({ where: { id: pageId2 }, data: { layers: [...camadasAntesDo6t, curvo6t] as never } })
    try {
      const r6t = await revisarArte({ projectId: PROJETO, pageId: pageId2, visao: false, previa: false })
      const cob6t = r6t.relatorio.cobertura
      conferir('com o texto curvo na página, colisão/corte/margem ficam "parcial" e o motivo cita a camada sem métrica', cob6t.colisao?.estado === 'parcial' && cob6t['texto-cortado']?.estado === 'parcial' && cob6t['fora-da-area-segura']?.estado === 'parcial' && /curvo-prova-6t/.test(cob6t.colisao?.motivo ?? ''), JSON.stringify({ colisao: cob6t.colisao, resumo: r6t.relatorio.resumo }).slice(0, 260))
      conferir('a régua e a fonte continuam avaliadas (não dependem da métrica de texto) e o resumo não diz "nada a corrigir"', cob6t['fonte-nao-carregada']?.estado === 'avaliada' && !/nada a corrigir/i.test(r6t.relatorio.resumo), r6t.relatorio.resumo.slice(0, 160))
    } finally {
      await db.page.update({ where: { id: pageId2 }, data: { layers: camadasAntesDo6t as never } })
    }
    const camadasDepoisDo6t = await camadasDaPagina(pageId2)
    conferir('a página voltou exatamente ao que era antes do 6t', JSON.stringify(camadasDepoisDo6t) === JSON.stringify(camadasAntesDo6t))

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

    // ── 9. REV-9E-01: esconder por ajuste MECÂNICO não é a pessoa apagando ──
    // A peça vem de uma leva com DICA de copy (os textos exatos da página). O
    // revisor esconde uma camada por ajuste de visibilidade; ao agendar, o
    // fechamento da dica tem de ler o texto como PRESENTE (aceita-como-veio,
    // sem remoção em nome da pessoa) — inclusive quando o render do ajuste
    // falhou (a marca nasce com a gravação da página). O CONTROLE: a mesma
    // camada escondida pela PESSOA (sem a marca) vira remoção, com `editada`.
    console.log('9) REV-9E-01: camada escondida por ajuste do revisor NÃO vira remoção humana ao agendar; escondida pela pessoa, vira')
    const { registrarDicasDeCopy, ancoraDaDica } = await import('../src/lib/aprendizado/sinal-de-copy-do-plano')
    const { marcaDoRevisor, ocultaPeloRevisor } = await import('../src/lib/creatives/revisao/oculta-pelo-revisor')
    const camadasDaPagina9 = async () => lerCamadas((await db.page.findUnique({ where: { id: pageId }, select: { layers: true } }))!.layers).camadas as Array<Record<string, any>>
    const camadasDo9 = await camadasDaPagina9()
    const visiveis9 = camadasDo9.filter((c) => (c.type === 'text' || c.type === 'rich-text') && c.visible !== false && typeof c.content === 'string' && c.content.trim())
    const textosDo9 = visiveis9.map((c) => String(c.content).trim())
    const escolher9 = (re: RegExp) => { const i = visiveis9.findIndex((c) => re.test(String(c.name ?? c.id))); const [c] = visiveis9.splice(i >= 0 ? i : visiveis9.length - 1, 1); return c }
    const ctaDo9 = escolher9(/cta/i)
    const preDo9 = escolher9(/^pre/i)
    const apoioDo9 = escolher9(/apoio/i)
    if (!ctaDo9 || !preDo9 || !apoioDo9) throw new Error('a peça do 9 precisa de três textos visíveis (cta, pre, apoio)')
    const quando9 = new Date(daqui7.getTime() + 5 * 3_600_000)
    const plano9 = await db.planoDeConteudo.create({ data: { projectId: PROJETO, titulo: `${MARCA} leva do passo 9`, inicio: daqui7, fim: new Date(daqui7.getTime() + 7 * 86_400_000), origem: 'chat', versao: 'prova-rev-9e-01', criadoPor: projeto.userId } })
    plano9Id = plano9.id
    const item9 = await db.itemDePlano.create({ data: { planoId: plano9.id, projectId: PROJETO, quando: quando9, formato: 'story', via: 'compor', pageId, copyProposta: textosDo9, status: 'pronto' } })
    const ancora9 = ancoraDaDica(item9)
    if (!ancora9) throw new Error('o item do 9 não tem âncora')
    const dicas9 = await registrarDicasDeCopy({ projectId: PROJETO, servico: 'prova', versao: 'prova-rev-9e-01', dicas: [{ ancora: ancora9, blocos: textosDo9, pageId }] })
    const sinal9 = dicas9.get(ancora9)
    if (!sinal9) throw new Error('a dica do 9 não foi registrada')
    sinaisDaProva.push(sinal9)
    const lerDica9 = async () => db.learningSignal.findUnique({ where: { id: sinal9 }, select: { desfecho: true, diff: true, decididoPor: true } })
    const removidosDe = (diff: unknown) => (Array.isArray((diff as Record<string, any> | null)?.removidos) ? ((diff as Record<string, any>).removidos as Array<{ texto?: string }>).map((r) => r.texto ?? '') : [])
    conferir('a leva e a dica existem, com os textos EXATOS da página, ainda pendente', (await lerDica9())?.desfecho == null, `sinal ${sinal9}`)

    // 9a. o revisor esconde o CTA por ajuste mecânico (render OK)
    const r9a = await revisarArte({ projectId: PROJETO, pageId, visao: false, previa: false })
    const a9a = await ajustarArte({ projectId: PROJETO, pageId, versaoEsperada: r9a.versao, ajustes: [{ tipo: 'visibilidade', camadas: [String(ctaDo9.id)], visivel: false }], canal: 'claude-code' })
    if (a9a.url) blobs.add(a9a.url)
    const ctaDepois9a = (await camadasDaPagina9()).find((c) => c.id === ctaDo9.id)
    conferir('a camada ficou escondida COM a marca do revisor (metadata.revisao.ocultaPeloRevisor, ajuste 0)', ctaDepois9a?.visible === false && ocultaPeloRevisor(ctaDepois9a) && marcaDoRevisor(ctaDepois9a)?.ajuste === 0, JSON.stringify(ctaDepois9a?.metadata?.revisao))
    // 9b. agendar pela página: a dica fecha como aceita, sem remoção; a cópia do post segue a arte (sem o CTA)
    const post9b = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${daqui7.toISOString().slice(0, 10)} 15:00`, pageId, situacao: 'rascunho', lembrete: true, caption: `${MARCA} rev-9e-01 b` })
    posts.push(post9b.postId)
    const dica9b = await lerDica9()
    conferir('ao agendar, a dica fechou como aceita-como-veio e o diff não tem remoção (esconder pelo revisor não é a pessoa apagando)', dica9b?.desfecho === 'aceita-como-veio' && removidosDe(dica9b?.diff).length === 0, JSON.stringify({ desfecho: dica9b?.desfecho, removidos: removidosDe(dica9b?.diff) }))
    const postDo9b = await db.socialPost.findUnique({ where: { id: post9b.postId }, select: { slotValues: true } })
    const valores9b = Object.entries((postDo9b?.slotValues ?? {}) as Record<string, unknown>).filter(([k]) => !k.startsWith('_')).map(([, v]) => v)
    conferir('a cópia que o post carrega segue a ARTE: sem o CTA escondido (a marca não muda o que a peça mostra)', !valores9b.includes(String(ctaDo9.content).trim()) && valores9b.includes(String(apoioDo9.content).trim()), JSON.stringify(valores9b).slice(0, 160))
    // 9c. o revisor esconde o PRÉ com o render FALHANDO: a marca nasce com a gravação da página, não com o render
    const r9c = await revisarArte({ projectId: PROJETO, pageId, visao: false, previa: false })
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_INVALIDO_prova'
    const e9c = await erroDe(ajustarArte({ projectId: PROJETO, pageId, versaoEsperada: r9c.versao, ajustes: [{ tipo: 'visibilidade', camadas: [String(preDo9.id)], visivel: false }], canal: 'claude-code' }))
    process.env.BLOB_READ_WRITE_TOKEN = tokenDoBlob
    const preDepois9c = (await camadasDaPagina9()).find((c) => c.id === preDo9.id)
    conferir('com o render falhando, a página ficou gravada com o pré escondido E marcado', !!e9c && e9c.code !== 'VERSAO_DIVERGENTE' && preDepois9c?.visible === false && ocultaPeloRevisor(preDepois9c), `${e9c?.code ?? 'sem erro'}; ${JSON.stringify(preDepois9c?.metadata?.revisao)}`)
    const post9c = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${daqui7.toISOString().slice(0, 10)} 15:30`, pageId, situacao: 'rascunho', lembrete: true, caption: `${MARCA} rev-9e-01 c` })
    posts.push(post9c.postId)
    const dica9c = await lerDica9()
    conferir('agendar de novo mantém aceita-como-veio, sem remoção (duas camadas escondidas pelo revisor)', dica9c?.desfecho === 'aceita-como-veio' && removidosDe(dica9c?.diff).length === 0, JSON.stringify({ desfecho: dica9c?.desfecho, removidos: removidosDe(dica9c?.diff) }))
    // 9d. CONTROLE: a PESSOA esconde o apoio (escrita sem a marca, como o editor faz) e agenda: remoção dela, `editada`
    await db.page.update({ where: { id: pageId }, data: { layers: (await camadasDaPagina9()).map((c) => (c.id === apoioDo9.id ? { ...c, visible: false } : c)) as never } })
    const post9d = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${daqui7.toISOString().slice(0, 10)} 16:00`, pageId, situacao: 'rascunho', lembrete: true, caption: `${MARCA} rev-9e-01 d` })
    posts.push(post9d.postId)
    const dica9d = await lerDica9()
    conferir('controle: escondida pela pessoa, a dica vira editada com a REMOÇÃO do apoio (e só dele)', dica9d?.desfecho === 'editada' && removidosDe(dica9d?.diff).length === 1 && removidosDe(dica9d?.diff)[0] === String(apoioDo9.content).trim(), JSON.stringify({ desfecho: dica9d?.desfecho, removidos: removidosDe(dica9d?.diff) }))

    // ── 9e. REV-8AD-01: SEM leva/dica, o esconder mecânico não vira ADIÇÃO humana ──
    // Sem plano, a proposta do diff é a copy da Generation do ajuste. Os `slotValues` dela são a copy VISÍVEL (sem
    // o texto escondido); comparados com a página lida por `copyParaDecisao` acusavam o texto como ADICIONADO. A
    // Generation passou a gravar `copyDeAprendizado` (com as ocultações mecânicas), e é ela que `lerProcedencia` lê.
    console.log('9e) REV-8AD-01: na 2ª peça, SEM leva nem dica — esconder pelo revisor e agendar: nenhuma adição nem remoção no sinal de copy')
    const { lerProcedencia } = await import('../src/lib/creatives/procedencia-da-copy')
    const camadas9e = await camadasDaPagina(pageId2)
    const visiveis9e = camadas9e.filter((c) => (c.type === 'text' || c.type === 'rich-text') && c.visible !== false && typeof c.content === 'string' && c.content.trim())
    const alvo9e = visiveis9e.find((c) => /cta|apoio/i.test(String(c.name ?? c.id))) ?? visiveis9e[visiveis9e.length - 1]
    if (!alvo9e) throw new Error('a 2ª peça não tem texto visível para o 9e')
    const texto9e = String(alvo9e.content).trim()
    const r9e = await revisarArte({ projectId: PROJETO, pageId: pageId2, visao: false, previa: false })
    const a9e = await ajustarArte({ projectId: PROJETO, pageId: pageId2, versaoEsperada: r9e.versao, ajustes: [{ tipo: 'visibilidade', camadas: [String(alvo9e.id)], visivel: false }], canal: 'claude-code' })
    if (a9e.url) blobs.add(a9e.url)
    const gen9e = await db.generation.findUnique({ where: { id: a9e.generationId }, select: { fieldValues: true, sourcePageId: true } })
    const fv9e = (gen9e?.fieldValues ?? {}) as Record<string, any>
    const proposta9e = lerProcedencia(gen9e?.fieldValues, gen9e?.sourcePageId ?? null).copyProposta ?? {}
    conferir('a Generation do ajuste grava `copyDeAprendizado` COM o texto escondido e `slotValues` SEM ele; a procedência lê a de aprendizado', Object.values(fv9e.copyDeAprendizado ?? {}).includes(texto9e) && !Object.values(fv9e.slotValues ?? {}).includes(texto9e) && Object.values(proposta9e).includes(texto9e), JSON.stringify({ aprendizado: Object.keys(fv9e.copyDeAprendizado ?? {}), slot: Object.keys(fv9e.slotValues ?? {}) }))
    const post9e = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${daqui7.toISOString().slice(0, 10)} 16:30`, pageId: pageId2, generationId: a9e.generationId, situacao: 'rascunho', lembrete: true, caption: `${MARCA} rev-8ad-01` })
    posts.push(post9e.postId)
    const sinal9e = await db.learningSignal.findFirst({ where: { projectId: PROJETO, chave: `copy:post:${post9e.postId}` }, select: { desfecho: true, diff: true, escolhido: true } })
    const diff9e = (sinal9e?.diff ?? {}) as Record<string, any>
    const versus9e = (sinal9e?.escolhido as Record<string, any> | null)?.versusProposta
    conferir('o sinal de copy do post (escolha própria, sem plano) não acusa ADIÇÃO nem remoção, e versusProposta é aceita-como-veio', !!sinal9e && (diff9e.adicionados ?? []).length === 0 && (diff9e.removidos ?? []).length === 0 && versus9e === 'aceita-como-veio', JSON.stringify({ adicionados: diff9e.adicionados, removidos: diff9e.removidos, versus: versus9e }))
    const postDo9e = await db.socialPost.findUnique({ where: { id: post9e.postId }, select: { slotValues: true } })
    conferir('a cópia visual que o post carrega segue SEM o texto escondido', !Object.entries((postDo9e?.slotValues ?? {}) as Record<string, unknown>).some(([k, v]) => !k.startsWith('_') && v === texto9e))

    // ── 9g. REV-2CEB-01: agendar SÓ pela Generation (sem página) — a cópia do post é a copy VISUAL, não a de aprendizado ──
    console.log('9g) REV-2CEB-01: agendar só por generationId (e por mediaUrls casada pela URL): a cópia textual do post NÃO afirma o texto que o revisor escondeu')
    const post9g = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${daqui7.toISOString().slice(0, 10)} 18:00`, generationId: a9e.generationId, situacao: 'rascunho', lembrete: true, caption: `${MARCA} rev-2ceb-01 só generation` })
    posts.push(post9g.postId)
    const postDo9g = await db.socialPost.findUnique({ where: { id: post9g.postId }, select: { slotValues: true, pageId: true, mediaUrls: true } })
    const valores9g = Object.entries((postDo9g?.slotValues ?? {}) as Record<string, unknown>).filter(([k]) => !k.startsWith('_')).map(([, v]) => v)
    conferir('só generationId: o post nasce sem página, com a mídia da Generation, e a cópia textual NÃO carrega o texto escondido pelo revisor (só a copy visual)', postDo9g?.pageId === null && postDo9g.mediaUrls[0] === a9e.url && valores9g.length > 0 && !valores9g.includes(texto9e), JSON.stringify({ pageId: postDo9g?.pageId, valores: valores9g }).slice(0, 200))
    const sinal9g = await db.learningSignal.findFirst({ where: { projectId: PROJETO, chave: `copy:post:${post9g.postId}` }, select: { desfecho: true, diff: true, escolhido: true } })
    conferir('e o APRENDIZADO segue lendo a copy de aprendizado como proposta: sem página não há diff (lado final desconhecido), e o sinal não acusa adição', !!sinal9g && (((sinal9g.diff ?? {}) as Record<string, any>).adicionados ?? []).length === 0, JSON.stringify(sinal9g?.diff).slice(0, 160))
    if (a9e.url) {
      const post9gB = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${daqui7.toISOString().slice(0, 10)} 18:30`, mediaUrls: [a9e.url], situacao: 'rascunho', lembrete: true, caption: `${MARCA} rev-2ceb-01 por mediaUrls` })
      posts.push(post9gB.postId)
      const postDo9gB = await db.socialPost.findUnique({ where: { id: post9gB.postId }, select: { slotValues: true, generationId: true } })
      const valores9gB = Object.entries((postDo9gB?.slotValues ?? {}) as Record<string, unknown>).filter(([k]) => !k.startsWith('_')).map(([, v]) => v)
      conferir('por mediaUrls casada pela URL: a Generation é vinculada e a cópia textual também é a copy visual, sem o texto escondido', postDo9gB?.generationId === a9e.generationId && valores9gB.length > 0 && !valores9gB.includes(texto9e), JSON.stringify({ gen: postDo9gB?.generationId === a9e.generationId, valores: valores9gB }).slice(0, 200))
    }

    // ── 9f. REV-8AD-02: a marca não encobre um esconder HUMANO por outro caminho ──
    console.log('9f) REV-8AD-02: a pessoa MOSTRA a camada pelo editor (a marca sai) e depois manda escondê-la pelo chat (hidden: true, sem revisão): a remoção é dela')
    const { reconciliarMarcasDoRevisor, marcaDoRevisor: marcaDe } = await import('../src/lib/creatives/revisao/oculta-pelo-revisor')
    const antesDo9f = await camadasDaPagina(pageId2)
    // o que o PATCH do editor faz ao receber a camada de volta visível
    const mostradas9f = reconciliarMarcasDoRevisor(antesDo9f as Array<{ id: string; visible?: unknown }>, antesDo9f.map((c) => (c.id === alvo9e.id ? { ...c, visible: true } : c)) as Array<{ id: string; [k: string]: unknown }>)
    const mostrada9f = mostradas9f.find((c) => c.id === alvo9e.id) as Record<string, any>
    conferir('mostrada pela pessoa: a camada volta visível e SEM a marca do revisor', mostrada9f?.visible === true && marcaDe(mostrada9f) === null, JSON.stringify(mostrada9f?.metadata?.revisao))
    await db.page.update({ where: { id: pageId2 }, data: { layers: mostradas9f as never } })
    // caminho do chat: ajustar-arte com `hidden: true` (sem ajustes de revisão) — e com uma marca ANTIGA plantada para provar que ela não encobre
    await db.page.update({ where: { id: pageId2 }, data: { layers: mostradas9f.map((c) => (c.id === alvo9e.id ? { ...c, metadata: { ...((c as Record<string, any>).metadata ?? {}), revisao: { ocultaPeloRevisor: { em: '2026-09-01T00:00:00.000Z', ajuste: 0 } } } } : c)) as never } })
    const a9f = await ajustarArte({ projectId: PROJETO, pageId: pageId2, slotValues: { [String(alvo9e.id)]: { hidden: true } }, canal: 'claude-code' })
    if (a9f.url) blobs.add(a9f.url)
    const depoisDo9f = (await camadasDaPagina(pageId2)).find((c) => c.id === alvo9e.id)
    conferir('escondida pelo chat (hidden: true): a camada fica oculta e a marca antiga SAI (não é "oculta pelo revisor")', depoisDo9f?.visible === false && marcaDe(depoisDo9f) === null, JSON.stringify(depoisDo9f?.metadata?.revisao))
    // agendar com a Generation do 9e como procedência (a copy de aprendizado de ANTES, com o texto): agora a remoção é humana
    const post9f = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${daqui7.toISOString().slice(0, 10)} 17:00`, pageId: pageId2, generationId: a9e.generationId, situacao: 'rascunho', lembrete: true, caption: `${MARCA} rev-8ad-02` })
    posts.push(post9f.postId)
    const sinal9f = await db.learningSignal.findFirst({ where: { projectId: PROJETO, chave: `copy:post:${post9f.postId}` }, select: { diff: true, escolhido: true } })
    const diff9f = (sinal9f?.diff ?? {}) as Record<string, any>
    const removidos9f = ((diff9f.removidos ?? []) as Array<{ texto?: string }>).map((r) => r.texto)
    conferir('contra a proposta de antes, o texto escondido pela pessoa aparece como REMOVIDO e versusProposta é editada', removidos9f.includes(texto9e) && (sinal9f?.escolhido as Record<string, any> | null)?.versusProposta === 'editada' && !Object.values(((await db.socialPost.findUnique({ where: { id: post9f.postId }, select: { slotValues: true } }))?.slotValues ?? {}) as Record<string, unknown>).includes(texto9e), JSON.stringify({ removidos: removidos9f, versus: (sinal9f?.escolhido as Record<string, any> | null)?.versusProposta }))

    // ── 9h. REV-127-F01: peça SEM post + ajuste cujo render FALHA → agendar pela página nasce PENDING ──
    console.log('9h) REV-127-F01: peça sem post, ajuste do revisor com o render FALHANDO: a miniatura antiga é invalidada e agendar pela página nasce PENDING')
    const quando9h = `${daqui7.toISOString().slice(0, 10)} 19:00`
    const composta9h = await comporPeca(
      {
        projectId: PROJETO,
        formato: 'story',
        foto: { url: fotoUrl },
        blocos: [
          { papel: 'pre', linhas: ['Pré-título do 9h'] },
          { papel: 'headline', linhas: ['Título do 9h', 'segunda linha'] },
          { papel: 'apoio', linhas: ['Apoio do 9h, para esconder depois.'] },
          { papel: 'cta', linhas: ['Chame agora'] },
        ],
        nome: `${MARCA} peça 9h`,
        quando: quando9h,
        tema: `${MARCA} teste`,
      },
      { canal: 'claude-code' },
    )
    const persistido9h = composta9h.persistido
    if (!persistido9h) throw new Error(`a peça do 9h não foi persistida: ${JSON.stringify(composta9h).slice(0, 200)}`)
    const pageId9h = persistido9h.pageId
    paginasCriadas.push(pageId9h)
    blobs.add(persistido9h.url)
    const thumbAntes9h = (await db.page.findUnique({ where: { id: pageId9h }, select: { thumbnail: true } }))?.thumbnail ?? null
    conferir('a peça composta nasce com miniatura do render (URL do Blob) e SEM post', !!thumbAntes9h && !thumbAntes9h.startsWith('data:') && (await db.socialPost.count({ where: { pageId: pageId9h } })) === 0, String(thumbAntes9h).slice(0, 60))
    const camadas9h = await camadasDaPagina(pageId9h)
    const textoDe9h = (c: Record<string, any>) => (c.type === 'text' || c.type === 'rich-text') && c.visible !== false && typeof c.content === 'string' && c.content.trim()
    const porPapel9h = (papel: RegExp) => camadas9h.find((c) => textoDe9h(c) && papel.test(String(c.name ?? c.id)))
    const cta9h = porPapel9h(/^cta$/i) ?? camadas9h.filter(textoDe9h).at(-1)
    const apoio9i = porPapel9h(/^apoio$/i)
    const pre9i = porPapel9h(/^pre$/i)
    if (!cta9h || !apoio9i || !pre9i) throw new Error(`a peça do 9h não tem cta/apoio/pre com texto: ${camadas9h.filter(textoDe9h).map((c) => c.name ?? c.id).join(', ')}`)
    const r9h = await revisarArte({ projectId: PROJETO, pageId: pageId9h, visao: false, previa: false })
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_INVALIDO_prova'
    const e9h = await erroDe(ajustarArte({ projectId: PROJETO, pageId: pageId9h, versaoEsperada: r9h.versao, ajustes: [{ tipo: 'visibilidade', camadas: [String(cta9h.id)], visivel: false }], canal: 'claude-code' }))
    process.env.BLOB_READ_WRITE_TOKEN = tokenDoBlob
    const pagina9h = await db.page.findUnique({ where: { id: pageId9h }, select: { thumbnail: true } })
    const camadasDepois9h = await camadasDaPagina(pageId9h)
    conferir('o ajuste gravou a página (CTA oculto) e o render falhou', !!e9h && e9h.code !== 'VERSAO_DIVERGENTE' && camadasDepois9h.find((c) => c.id === cta9h.id)?.visible === false, e9h?.message.slice(0, 60))
    conferir('a miniatura antiga foi INVALIDADA junto da gravação das camadas (thumbnail null)', pagina9h?.thumbnail === null, String(pagina9h?.thumbnail).slice(0, 60))
    const post9h = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: quando9h, pageId: pageId9h, situacao: 'rascunho', lembrete: true, caption: `${MARCA} rev-127-f01` })
    posts.push(post9h.postId)
    const postDo9h = await db.socialPost.findUnique({ where: { id: post9h.postId }, select: { renderStatus: true, mediaUrls: true, nextRenderAt: true } })
    conferir('agendar pela página nasce PENDING, sem mídia e na fila de render (nextRenderAt) — nunca RENDERED com a miniatura da versão anterior', postDo9h?.renderStatus === 'PENDING' && postDo9h.mediaUrls.length === 0 && !!postDo9h.nextRenderAt && !postDo9h.mediaUrls.includes(thumbAntes9h!), JSON.stringify({ renderStatus: postDo9h?.renderStatus, mediaUrls: postDo9h?.mediaUrls }))

    // ── 9i. REV-127-F02: a recuperação forçada re-renderiza o PNG E a copy visual da Generation ──
    console.log('9i) REV-127-F02: ajuste que ESCONDE um texto com o render falhando → a recuperação forçada reusa a Generation do ajuste anterior: o PNG novo E a copy visual saem sem o texto; a copy de aprendizado fica')
    // (a) um ajuste com o render OK: G1 nasce com a copy visual (slotValues) que ainda mostra o pré-título
    const r9iA = await revisarArte({ projectId: PROJETO, pageId: pageId9h, visao: false, previa: false })
    const textoPre9i = String(pre9i.content).trim()
    const g1 = await ajustarArte({ projectId: PROJETO, pageId: pageId9h, versaoEsperada: r9iA.versao, ajustes: [{ tipo: 'visibilidade', camadas: [String(apoio9i.id)], visivel: false }], canal: 'claude-code' })
    if (g1.url) blobs.add(g1.url)
    const fvG1 = ((await db.generation.findUnique({ where: { id: g1.generationId }, select: { fieldValues: true } }))?.fieldValues ?? {}) as Record<string, any>
    conferir('G1 (ajuste com render OK) guarda a copy visual COM o pré-título e a de aprendizado com o apoio escondido', Object.values(fvG1.slotValues ?? {}).includes(textoPre9i) && Object.values(fvG1.copyDeAprendizado ?? {}).includes(String(apoio9i.content).trim()), JSON.stringify(Object.values(fvG1.slotValues ?? {})).slice(0, 160))
    // um post SÓ pela Generation (sem página, NOT_NEEDED): a mídia congelada que a recuperação vai trocar
    const post9iG = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${daqui7.toISOString().slice(0, 10)} 19:30`, generationId: g1.generationId, situacao: 'rascunho', lembrete: true, caption: `${MARCA} rev-127-f02 antes` })
    posts.push(post9iG.postId)
    // (b) esconder o pré-título com o render FALHANDO: a página muda, G1 segue sendo a arte mais recente, e a recuperação é FORÇADA
    const r9iB = await revisarArte({ projectId: PROJETO, pageId: pageId9h, visao: false, previa: false })
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_INVALIDO_prova'
    const e9i = await erroDe(ajustarArte({ projectId: PROJETO, pageId: pageId9h, versaoEsperada: r9iB.versao, ajustes: [{ tipo: 'visibilidade', camadas: [String(pre9i.id)], visivel: false }], canal: 'claude-code' }))
    process.env.BLOB_READ_WRITE_TOKEN = tokenDoBlob
    conferir('o segundo ajuste gravou a página (pré-título oculto) e o render falhou', !!e9i && e9i.code !== 'VERSAO_DIVERGENTE' && (await camadasDaPagina(pageId9h)).find((c) => c.id === pre9i.id)?.visible === false, e9i?.message.slice(0, 60))
    const job9i = await db.generationJob.findFirst({ where: { generationId: g1.generationId, kind: 'COMPOR' }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, payload: true } })
    conferir('a recuperação FORÇADA foi enfileirada para G1 (a arte congelada do post sem página)', !!job9i && (job9i.payload as Record<string, any>).recompor?.forcar === true, JSON.stringify(job9i?.payload).slice(0, 140))
    if (job9i) {
      await db.generationJob.update({ where: { id: job9i.id }, data: { status: 'RUNNING', attempts: { increment: 1 }, startedAt: new Date() } })
      await processarRecomposicaoEmBackground({ generationId: g1.generationId, projectId: PROJETO, recompor: (job9i.payload as Record<string, any>).recompor, queueJobId: job9i.id })
      await fecharJob(job9i.id, g1.generationId)
    }
    const g1Depois = await db.generation.findUnique({ where: { id: g1.generationId }, select: { resultUrl: true, fieldValues: true, sourcePageId: true } })
    if (g1Depois?.resultUrl) blobs.add(g1Depois.resultUrl)
    const fvDepois = (g1Depois?.fieldValues ?? {}) as Record<string, any>
    const proc9i = lerProcedencia(g1Depois?.fieldValues, g1Depois?.sourcePageId ?? null)
    conferir('a recuperação trocou o PNG de G1 (re-renderizada) e a copy VISUAL acompanhou: sem o pré-título; a copy de APRENDIZADO segue com o apoio (merge preservado) e a trava está lá', g1Depois?.resultUrl !== g1.url && fvDepois.recomposicao?.estado === 're-renderizada' && !Object.values(proc9i.copyVisual ?? {}).includes(textoPre9i) && Object.values(fvDepois.copyDeAprendizado ?? {}).includes(String(apoio9i.content).trim()) && !!fvDepois.somenteReRender, JSON.stringify({ url: g1Depois?.resultUrl === g1.url ? 'igual' : 'nova', estado: fvDepois.recomposicao?.estado, visual: Object.values(proc9i.copyVisual ?? {}).slice(0, 4) }).slice(0, 220))
    const postDo9iG = await db.socialPost.findUnique({ where: { id: post9iG.postId }, select: { mediaUrls: true } })
    conferir('o post sem página que carregava G1 recebeu a URL nova', !!g1Depois?.resultUrl && postDo9iG?.mediaUrls[0] === g1Depois.resultUrl)
    // agendar SÓ pela Generation e pela URL nova: a cópia textual do post não afirma o pré-título que o PNG não mostra
    const post9iB = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${daqui7.toISOString().slice(0, 10)} 20:00`, generationId: g1.generationId, situacao: 'rascunho', lembrete: true, caption: `${MARCA} rev-127-f02 gen` })
    posts.push(post9iB.postId)
    const valores9iB = Object.entries(((await db.socialPost.findUnique({ where: { id: post9iB.postId }, select: { slotValues: true } }))?.slotValues ?? {}) as Record<string, unknown>).filter(([k]) => !k.startsWith('_')).map(([, v]) => v)
    conferir('agendar por generationId depois da recuperação: a cópia textual tem texto e NÃO carrega o pré-título escondido', valores9iB.length > 0 && !valores9iB.includes(textoPre9i), JSON.stringify(valores9iB).slice(0, 160))
    if (g1Depois?.resultUrl) {
      const post9iC = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${daqui7.toISOString().slice(0, 10)} 20:30`, mediaUrls: [g1Depois.resultUrl], situacao: 'rascunho', lembrete: true, caption: `${MARCA} rev-127-f02 url` })
      posts.push(post9iC.postId)
      const valores9iC = Object.entries(((await db.socialPost.findUnique({ where: { id: post9iC.postId }, select: { slotValues: true } }))?.slotValues ?? {}) as Record<string, unknown>).filter(([k]) => !k.startsWith('_')).map(([, v]) => v)
      conferir('agendar por mediaUrls casada pela URL nova: idem, sem o pré-título', !valores9iC.includes(textoPre9i), JSON.stringify(valores9iC).slice(0, 160))
    }

    // ── 9j. REV-93D-01 / REV-93D-02: a recuperação com `Page.layers` em STRING e sem `copyDeAprendizado` ──
    // A rota de edição de camada grava a lista como STRING JSON (há página duplamente codificada), e a arte
    // rápida grava só `slotValues` (a proposta de aprendizado cai neles). Em cada formato: a Generation do
    // ajuste perde `copyDeAprendizado` (como a da arte rápida), o revisor esconde o pré-título com o render
    // FALHANDO, a página é regravada no formato em teste, e a recuperação forçada reusa a Generation. Esperado:
    // PNG novo, copy visual COM texto e SEM o pré-título (nunca `{}`), a proposta de aprendizado PRESERVADA (a
    // copy visual anterior), e o agendamento com página + Generation sem adição nem remoção humana.
    console.log('9j) REV-93D-01/02: camadas em string JSON (simples e dupla) e Generation sem copyDeAprendizado → recuperação forçada mantém texto na copy visual, preserva a proposta e o sinal sai limpo')
    for (const formato of ['json', 'json2'] as const) {
      const quando9j = `${daqui7.toISOString().slice(0, 10)} ${formato === 'json' ? '21:00' : '22:00'}`
      const composta9j = await comporPeca(
        {
          projectId: PROJETO,
          formato: 'story',
          foto: { url: fotoUrl },
          blocos: [
            { papel: 'pre', linhas: [`Pré-título do 9j ${formato}`] },
            { papel: 'headline', linhas: [`Título do 9j ${formato}`, 'segunda linha'] },
            { papel: 'apoio', linhas: [`Apoio do 9j ${formato}, com acento e ç.`] },
            { papel: 'cta', linhas: ['Chame agora'] },
          ],
          nome: `${MARCA} peça 9j ${formato}`,
          quando: quando9j,
          tema: `${MARCA} teste`,
        },
        { canal: 'claude-code' },
      )
      const persistido9j = composta9j.persistido
      if (!persistido9j) throw new Error(`a peça do 9j (${formato}) não foi persistida: ${JSON.stringify(composta9j).slice(0, 200)}`)
      const pageId9j = persistido9j.pageId
      paginasCriadas.push(pageId9j)
      blobs.add(persistido9j.url)
      const camadas9j = await camadasDaPagina(pageId9j)
      const textoDe9j = (c: Record<string, any>) => (c.type === 'text' || c.type === 'rich-text') && c.visible !== false && typeof c.content === 'string' && c.content.trim()
      const pre9j = camadas9j.find((c) => textoDe9j(c) && /^pre$/i.test(String(c.name ?? c.id)))
      const apoio9j = camadas9j.find((c) => textoDe9j(c) && /^apoio$/i.test(String(c.name ?? c.id)))
      if (!pre9j || !apoio9j) throw new Error(`a peça do 9j (${formato}) não tem pre/apoio com texto`)
      const textoPre9j = String(pre9j.content).trim()
      const textoApoio9j = String(apoio9j.content).trim()
      // (a) um ajuste que NÃO esconde nada, com o render OK: G nasce com copy visual = proposta (as duas iguais)
      const r9jA = await revisarArte({ projectId: PROJETO, pageId: pageId9j, visao: false, previa: false })
      const g9j = await ajustarArte({ projectId: PROJETO, pageId: pageId9j, versaoEsperada: r9jA.versao, ajustes: [{ tipo: 'mover', camadas: [String(pre9j.id)], dy: -8 }], canal: 'claude-code' })
      if (g9j.url) blobs.add(g9j.url)
      // como a arte rápida: SÓ `slotValues` — a proposta de aprendizado cai neles (`lerProcedencia`)
      await db.$executeRaw`UPDATE "Generation" SET "fieldValues" = "fieldValues" - 'copyDeAprendizado' WHERE "id" = ${g9j.generationId}`
      const gAntes9j = await db.generation.findUnique({ where: { id: g9j.generationId }, select: { fieldValues: true, sourcePageId: true } })
      const procAntes9j = lerProcedencia(gAntes9j?.fieldValues, gAntes9j?.sourcePageId ?? null)
      conferir(`[${formato}] sem copyDeAprendizado a proposta É a copy visual, e ela carrega o pré-título e o apoio (com acento)`, !!procAntes9j.copyVisual && procAntes9j.copyProposta === procAntes9j.copyVisual && Object.values(procAntes9j.copyVisual).includes(textoPre9j) && Object.values(procAntes9j.copyVisual).includes(textoApoio9j), JSON.stringify(Object.values(procAntes9j.copyVisual ?? {})).slice(0, 160))
      const postG9j = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: quando9j, generationId: g9j.generationId, situacao: 'rascunho', lembrete: true, caption: `${MARCA} rev-93d ${formato} antes` })
      posts.push(postG9j.postId)
      // (b) o revisor esconde o pré-título com o render FALHANDO → recuperação FORÇADA enfileirada para G
      const r9jB = await revisarArte({ projectId: PROJETO, pageId: pageId9j, visao: false, previa: false })
      process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_INVALIDO_prova'
      const e9j = await erroDe(ajustarArte({ projectId: PROJETO, pageId: pageId9j, versaoEsperada: r9jB.versao, ajustes: [{ tipo: 'visibilidade', camadas: [String(pre9j.id)], visivel: false }], canal: 'claude-code' }))
      process.env.BLOB_READ_WRITE_TOKEN = tokenDoBlob
      const camadasOcultas9j = await camadasDaPagina(pageId9j)
      conferir(`[${formato}] o ajuste gravou a página (pré-título oculto pelo revisor) e o render falhou`, !!e9j && e9j.code !== 'VERSAO_DIVERGENTE' && camadasOcultas9j.find((c) => c.id === pre9j.id)?.visible === false, e9j?.message.slice(0, 60))
      // (c) a página é regravada COMO A ROTA DE CAMADA grava: string JSON (e, no 2º formato, duplamente codificada)
      const serializadas = formato === 'json' ? JSON.stringify(camadasOcultas9j) : JSON.stringify(JSON.stringify(camadasOcultas9j))
      await db.page.update({ where: { id: pageId9j }, data: { layers: serializadas } })
      const brutas9j = (await db.page.findUnique({ where: { id: pageId9j }, select: { layers: true } }))?.layers
      conferir(`[${formato}] Page.layers está em STRING no banco e continua legível por lerCamadas`, typeof brutas9j === 'string' && lerCamadas(brutas9j).legivel && lerCamadas(brutas9j).camadas.length === camadasOcultas9j.length, typeof brutas9j)
      const job9j = await db.generationJob.findFirst({ where: { generationId: g9j.generationId, kind: 'COMPOR' }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, payload: true } })
      conferir(`[${formato}] a recuperação FORÇADA foi enfileirada para G`, !!job9j && (job9j.payload as Record<string, any>).recompor?.forcar === true, JSON.stringify(job9j?.payload).slice(0, 140))
      if (job9j) {
        await db.generationJob.update({ where: { id: job9j.id }, data: { status: 'RUNNING', attempts: { increment: 1 }, startedAt: new Date() } })
        await processarRecomposicaoEmBackground({ generationId: g9j.generationId, projectId: PROJETO, recompor: (job9j.payload as Record<string, any>).recompor, queueJobId: job9j.id })
        await fecharJob(job9j.id, g9j.generationId)
      }
      const gDepois9j = await db.generation.findUnique({ where: { id: g9j.generationId }, select: { resultUrl: true, fieldValues: true, sourcePageId: true } })
      if (gDepois9j?.resultUrl) blobs.add(gDepois9j.resultUrl)
      const fvDepois9j = (gDepois9j?.fieldValues ?? {}) as Record<string, any>
      const procDepois9j = lerProcedencia(gDepois9j?.fieldValues, gDepois9j?.sourcePageId ?? null)
      const visualDepois9j = Object.values(procDepois9j.copyVisual ?? {})
      conferir(`[${formato}] REV-93D-01: o PNG foi refeito e a copy VISUAL tem texto (nunca {}), com o apoio acentuado e SEM o pré-título`, gDepois9j?.resultUrl !== g9j.url && fvDepois9j.recomposicao?.estado === 're-renderizada' && visualDepois9j.length >= 2 && visualDepois9j.includes(textoApoio9j) && !visualDepois9j.includes(textoPre9j), JSON.stringify({ estado: fvDepois9j.recomposicao?.estado, visual: visualDepois9j.slice(0, 4) }).slice(0, 220))
      const propostaDepois9j = Object.values((fvDepois9j.copyDeAprendizado ?? {}) as Record<string, unknown>)
      conferir(`[${formato}] REV-93D-02: a proposta de aprendizado foi PRESERVADA (a copy visual anterior, com o pré-título) e é a que a procedência lê`, propostaDepois9j.includes(textoPre9j) && propostaDepois9j.includes(textoApoio9j) && Object.values(procDepois9j.copyProposta ?? {}).includes(textoPre9j), JSON.stringify(propostaDepois9j).slice(0, 160))
      const postDoG9j = await db.socialPost.findUnique({ where: { id: postG9j.postId }, select: { mediaUrls: true } })
      conferir(`[${formato}] o post sem página que carregava G recebeu a URL nova`, !!gDepois9j?.resultUrl && postDoG9j?.mediaUrls[0] === gDepois9j.resultUrl)
      // (d) agendar com página + Generation: a proposta preservada casa com a página lida para decisão → sem adição nem remoção humana
      const postPG9j = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${daqui7.toISOString().slice(0, 10)} ${formato === 'json' ? '21:30' : '22:30'}`, pageId: pageId9j, generationId: g9j.generationId, situacao: 'rascunho', lembrete: true, caption: `${MARCA} rev-93d ${formato} pagina` })
      posts.push(postPG9j.postId)
      const sinal9j = await db.learningSignal.findFirst({ where: { projectId: PROJETO, chave: `copy:post:${postPG9j.postId}` }, select: { desfecho: true, diff: true, escolhido: true } })
      const diff9j = (sinal9j?.diff ?? {}) as Record<string, any>
      const versus9j = (sinal9j?.escolhido as Record<string, any> | null)?.versusProposta
      conferir(`[${formato}] o sinal de copy (página + Generation) NÃO acusa adição nem remoção humana; versusProposta é aceita-como-veio`, !!sinal9j && (diff9j.adicionados ?? []).length === 0 && (diff9j.removidos ?? []).length === 0 && versus9j === 'aceita-como-veio', JSON.stringify({ adicionados: diff9j.adicionados, removidos: diff9j.removidos, versus: versus9j }))
      // (e) agendar SÓ pela Generation e pela URL nova: cópia textual com texto, acento e quebra preservados, sem o pré-título
      const postGen9j = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${daqui7.toISOString().slice(0, 10)} ${formato === 'json' ? '21:40' : '22:40'}`, generationId: g9j.generationId, situacao: 'rascunho', lembrete: true, caption: `${MARCA} rev-93d ${formato} gen` })
      posts.push(postGen9j.postId)
      const valoresGen9j = Object.entries(((await db.socialPost.findUnique({ where: { id: postGen9j.postId }, select: { slotValues: true } }))?.slotValues ?? {}) as Record<string, unknown>).filter(([k]) => !k.startsWith('_')).map(([, v]) => v)
      conferir(`[${formato}] agendar por generationId: a cópia textual tem o apoio acentuado e a manchete com a quebra, e NÃO o pré-título`, valoresGen9j.includes(textoApoio9j) && valoresGen9j.some((v) => typeof v === 'string' && v.includes('\n')) && !valoresGen9j.includes(textoPre9j), JSON.stringify(valoresGen9j).slice(0, 160))
      if (gDepois9j?.resultUrl) {
        const postUrl9j = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: `${daqui7.toISOString().slice(0, 10)} ${formato === 'json' ? '21:50' : '22:50'}`, mediaUrls: [gDepois9j.resultUrl], situacao: 'rascunho', lembrete: true, caption: `${MARCA} rev-93d ${formato} url` })
        posts.push(postUrl9j.postId)
        const valoresUrl9j = Object.entries(((await db.socialPost.findUnique({ where: { id: postUrl9j.postId }, select: { slotValues: true } }))?.slotValues ?? {}) as Record<string, unknown>).filter(([k]) => !k.startsWith('_')).map(([, v]) => v)
        conferir(`[${formato}] agendar por mediaUrls casada pela URL nova: idem`, valoresUrl9j.includes(textoApoio9j) && !valoresUrl9j.includes(textoPre9j), JSON.stringify(valoresUrl9j).slice(0, 160))
      }
    }

    // ── 9k. REV-FINAL-01 (revisão FINAL do Codex sobre 618e45f7): o render ATRASADO de um ajuste não publica ──
    // Peça SEM post. O ajuste A grava V1 e para DEPOIS de subir o PNG, antes da publicação (costura
    // `_prova.antesDePublicar`); dentro da parada o ajuste B revisa (lê V1), grava V2, renderiza e publica. A é
    // liberado por último. Esperado: A recusa com PAGINA_MUDOU_DURANTE (ajuste gravado, arte descartada), a página em
    // V2, miniatura e Generation mais recente de B, nenhuma Generation de A, e o 1º agendamento pela página com a arte
    // de B. (O PNG de A é apagado pelo próprio persist; a URL dele não chega à prova.)
    console.log('9k) REV-FINAL-01: dois ajustes intercalados numa peça sem post — o render de A que termina por último é descartado; miniatura, Generation e agendamento ficam com B')
    {
      const { versaoDaPagina: versaoDaPagina9k } = await import('../src/lib/creatives/revisao/versao')
      const quando9k = `${daqui7.toISOString().slice(0, 10)} 23:00`
      const composta9k = await comporPeca(
        {
          projectId: PROJETO,
          formato: 'story',
          foto: { url: fotoUrl },
          blocos: [
            { papel: 'headline', linhas: ['Título do 9k', 'segunda linha'] },
            { papel: 'apoio', linhas: ['Apoio do 9k.'] },
          ],
          nome: `${MARCA} peça 9k`,
          quando: quando9k,
          tema: `${MARCA} teste`,
        },
        { canal: 'claude-code' },
      )
      const persistido9k = composta9k.persistido
      if (!persistido9k) throw new Error(`a peça do 9k não foi persistida: ${JSON.stringify(composta9k).slice(0, 200)}`)
      const pageId9k = persistido9k.pageId
      paginasCriadas.push(pageId9k)
      blobs.add(persistido9k.url)
      conferir('a peça do 9k nasce SEM post', (await db.socialPost.count({ where: { pageId: pageId9k } })) === 0)
      const manchete9k = (await camadasDaPagina(pageId9k)).find((c) => (c.type === 'text' || c.type === 'rich-text') && c.visible !== false && typeof c.content === 'string' && c.content.trim())
      if (!manchete9k) throw new Error('a peça do 9k não tem texto visível')
      const yAntes9k = Number(manchete9k.position?.y)
      const onde9k = { projectId: PROJETO, fieldValues: { path: ['pageId'], equals: pageId9k } }
      const gensAntes9k = await db.generation.count({ where: onde9k })
      const estado9k: { b: Awaited<ReturnType<typeof ajustarArte>> | null } = { b: null }
      const r9kA = await revisarArte({ projectId: PROJETO, pageId: pageId9k, visao: false, previa: false })
      const e9kA = await erroDe(
        ajustarArte({
          projectId: PROJETO,
          pageId: pageId9k,
          versaoEsperada: r9kA.versao,
          ajustes: [{ tipo: 'mover', camadas: [String(manchete9k.id)], dy: -8 }],
          canal: 'claude-code',
          _prova: {
            antesDePublicar: async () => {
              const r9kB = await revisarArte({ projectId: PROJETO, pageId: pageId9k, visao: false, previa: false })
              estado9k.b = await ajustarArte({ projectId: PROJETO, pageId: pageId9k, versaoEsperada: r9kB.versao, ajustes: [{ tipo: 'mover', camadas: [String(manchete9k.id)], dy: -6 }], canal: 'claude-code' })
              if (estado9k.b.url) blobs.add(estado9k.b.url)
            },
          },
        }),
      )
      const b9k = estado9k.b
      conferir('A recusa com PAGINA_MUDOU_DURANTE (409) e diz que o ajuste foi gravado; B terminou', e9kA?.code === 'PAGINA_MUDOU_DURANTE' && e9kA.status === 409 && !!b9k, e9kA?.message.slice(0, 80))
      if (!b9k) throw new Error('o ajuste B do 9k não terminou')
      const pagina9k = await db.page.findUnique({ where: { id: pageId9k }, select: { thumbnail: true, width: true, height: true, background: true, layers: true } })
      const yDepois9k = Number((lerCamadas(pagina9k!.layers).camadas.find((c) => c.id === manchete9k.id) as Record<string, any> | undefined)?.position?.y)
      conferir('a página está em V2: os dois deslocamentos (−8 e −6) e a versão que B devolveu', yDepois9k === yAntes9k - 14 && versaoDaPagina9k(pagina9k!) === b9k.versao, JSON.stringify({ yAntes9k, yDepois9k }))
      conferir('a miniatura da página é a de B, nunca a de A', pagina9k?.thumbnail === b9k.url, String(pagina9k?.thumbnail).slice(-48))
      const maisRecente9k = await db.generation.findFirst({ where: onde9k, orderBy: { createdAt: 'desc' }, select: { id: true, resultUrl: true } })
      const gensDepois9k = await db.generation.count({ where: onde9k })
      conferir('a Generation mais recente da página é a de B, e A não registrou nenhuma (uma a mais, só)', maisRecente9k?.id === b9k.generationId && maisRecente9k.resultUrl === b9k.url && gensDepois9k === gensAntes9k + 1, JSON.stringify({ gensAntes9k, gensDepois9k }))
      const post9k = await agendarPost({ projectId: PROJETO, postType: 'STORY', scheduledDatetime: quando9k, pageId: pageId9k, situacao: 'rascunho', lembrete: true, caption: `${MARCA} rev-final-01` })
      posts.push(post9k.postId)
      const postDo9k = await db.socialPost.findUnique({ where: { id: post9k.postId }, select: { renderStatus: true, mediaUrls: true, generationId: true } })
      conferir('o 1º agendamento pela página nasce com a arte de B (RENDERED com a miniatura de B, vinculado à Generation de B)', postDo9k?.renderStatus === 'RENDERED' && postDo9k.mediaUrls[0] === b9k.url && postDo9k.generationId === b9k.generationId, JSON.stringify(postDo9k).slice(0, 200))
    }
  } catch (erro) {
    // O erro da prova é impresso ANTES do cleanup: sem isto uma falha no
    // cleanup engoliria a causa (aconteceu na primeira rodada).
    console.error('\n✗ a prova parou:', erro instanceof Error ? erro.stack ?? erro.message : erro)
    mau++
  } finally {
    process.env.BLOB_READ_WRITE_TOKEN = tokenDoBlob
    console.log('\ncleanup (só os ids criados por esta prova)')
    const criados = { posts: posts.length, generations: 0, generationsAlheias: 0, jobs: 0, sinais: 0, pages: pageId ? 1 : 0, templates: 0, blobs: blobs.size }
    // As Generations de prova criadas em OUTRO projeto (6s): pelo id exato,
    // independentemente do projeto, e a que não sumir CONTA como falha (REV-052-01).
    if (generationsAlheias.length) {
      const r = await apagarGenerationsPorId(generationsAlheias)
      criados.generationsAlheias = r.apagadas.length
      conferir(`cleanup: as ${generationsAlheias.length} Generation(s) de prova criadas em outro projeto foram apagadas pelo id (nenhuma faltou)`, r.faltaram.length === 0, JSON.stringify(r.faltaram))
    }
    // Falha no meio da composição deixa Page (e às vezes Generation) sem que
    // `pageId` tenha sido preenchido: o que foi criado com a MARCA desta rodada
    // entra no cleanup do mesmo jeito (achado R2 da revisão do Codex).
    // TODAS as páginas da rodada: as que a prova registrou (1ª e 2ª peça) e o
    // que nasceu com a MARCA sem chegar a um id (falha no meio da composição —
    // achado R2 e, na 2ª peça, REV-08 da revisão do Codex).
    const idsDePagina = new Set<string>(paginasCriadas)
    if (pageId) idsDePagina.add(pageId)
    for (const p of await db.page.findMany({ where: { name: { contains: MARCA }, Template: { projectId: PROJETO } }, select: { id: true } })) idsDePagina.add(p.id)
    // Toda URL que a arte já teve: `resultUrl` e o rastro `recomposicao.urlsAnteriores` (o re-render sobrescreve
    // a URL, e um PNG que saiu da coluna sem entrar no conjunto ficaria no Blob de produção — REV-9E-02).
    const urlsDaGeneration = (g: { resultUrl: string | null; fieldValues: unknown }): string[] => {
      const fv = (g.fieldValues ?? {}) as Record<string, any>
      const anteriores = Array.isArray(fv.recomposicao?.urlsAnteriores) ? (fv.recomposicao.urlsAnteriores as unknown[]).filter((u): u is string => typeof u === 'string') : []
      return [...(g.resultUrl ? [g.resultUrl] : []), ...anteriores]
    }
    const gensSemPagina = await db.generation.findMany({ where: { projectId: PROJETO, createdAt: { gte: inicio }, fieldValues: { path: ['spec', 'nome'], string_contains: MARCA } }, select: { id: true, resultUrl: true, fieldValues: true } })
    for (const g of gensSemPagina) for (const u of urlsDaGeneration(g)) blobs.add(u)
    if (gensSemPagina.length) {
      await db.generationJob.deleteMany({ where: { generationId: { in: gensSemPagina.map((g) => g.id) } } })
      criados.generations += (await db.generation.deleteMany({ where: { id: { in: gensSemPagina.map((g) => g.id) } } })).count
    }
    const postsOrfaos = await db.socialPost.findMany({ where: { projectId: PROJETO, caption: { contains: MARCA } }, select: { id: true } })
    for (const p of postsOrfaos) if (!posts.includes(p.id)) posts.push(p.id)
    criados.pages = 0
    for (const id of idsDePagina) {
      const gens = await db.generation.findMany({ where: { projectId: PROJETO, fieldValues: { path: ['pageId'], equals: id } }, select: { id: true, resultUrl: true, fieldValues: true } })
      for (const g of gens) for (const u of urlsDaGeneration(g)) blobs.add(u)
      criados.jobs += (await db.generationJob.deleteMany({ where: { generationId: { in: gens.map((g) => g.id) } } })).count
      criados.sinais += (await db.learningSignal.deleteMany({ where: { projectId: PROJETO, pageId: id, createdAt: { gte: inicio } } })).count
      criados.generations += (await db.generation.deleteMany({ where: { id: { in: gens.map((g) => g.id) } } })).count
      const pagina = await db.page.findUnique({ where: { id }, select: { templateId: true } })
      if (!pagina) continue
      await db.page.delete({ where: { id } })
      criados.pages++
      // A pasta da semana só sai se nasceu nesta prova e ficou vazia.
      if (!templatesAntes.has(pagina.templateId)) {
        const restam = await db.page.count({ where: { templateId: pagina.templateId } })
        const gensNoTemplate = await db.generation.count({ where: { templateId: pagina.templateId } })
        if (restam === 0 && gensNoTemplate === 0) {
          await db.template.delete({ where: { id: pagina.templateId } })
          criados.templates++
        }
      }
    }
    if (plano9Id) {
      await db.itemDePlano.deleteMany({ where: { planoId: plano9Id } })
      await db.planoDeConteudo.deleteMany({ where: { id: plano9Id } })
    }
    if (sinaisDaProva.length) criados.sinais += (await db.learningSignal.deleteMany({ where: { id: { in: sinaisDaProva } } })).count
    if (posts.length) {
      criados.posts = posts.length
      criados.sinais += (await db.learningSignal.deleteMany({ where: { projectId: PROJETO, postId: { in: posts }, createdAt: { gte: inicio } } })).count
      await db.socialPost.deleteMany({ where: { id: { in: posts } } })
    }
    const urls = [...blobs].filter((u): u is string => typeof u === 'string' && u.includes('blob.vercel-storage.com'))
    // Falha ao apagar o Blob é FALHA da prova (REV-9E-03): resíduo no Blob de produção não pode passar no gate.
    // "encontrados" e "apagados" são contados em separado.
    let blobsApagados = 0
    try {
      if (urls.length) await del(urls)
      blobsApagados = urls.length
    } catch (e) {
      console.error('  ✗ blob NÃO apagado (conta como falha da prova):', e instanceof Error ? e.message : e)
      mau++
    }
    console.log(`  apagados: ${JSON.stringify({ ...criados, blobs: `${blobsApagados} de ${urls.length} encontrados` })}`)
    if (blobsApagados !== urls.length) console.error(`  ✗ ${urls.length - blobsApagados} blob(s) ficaram no Blob: ${urls.join(' ')}`)
    await db.$disconnect()
  }

  console.log(`\n${ok} ok, ${mau} falha(s). Saída em ${SAIDA}`)
  if (mau > 0) process.exitCode = 1
}

main().then(
  // Sai explicitamente: as provas 32 e 33 imprimiram o resumo e o cleanup e o
  // processo ficou pendurado por uma hora com conexões de banco abertas.
  () => process.exit(process.exitCode ?? 0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
