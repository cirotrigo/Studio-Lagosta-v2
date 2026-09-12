/**
 * Prova de integração do PR 10 de "Marca simples, copy melhor" (F3, o CICLO da
 * camada extra), no BRANCH DE DEV do Neon.
 *
 * Critério de pronto do plano: "uma peça que precisa de horário funciona numa
 * variante sem esse campo, e o texto extra continua editável depois de trocar
 * a foto". O que ela prova, com dados criados e apagados por ela:
 *
 *  0. uma variante de story SEM `servico` (a do projeto, ou uma cópia temporária
 *     da página de assinatura sem as camadas de serviço, apagada no cleanup);
 *  1. compor DUAS peças com contrato — manchete, apoio, uma nota LIVRE que
 *     herda do apoio e a linha de HORÁRIO (função `servico`) que herda do apoio
 *     —, uma de imagem única e um slide de carrossel: as camadas extras nascem
 *     na página com o id do autor, `metadata.compositor.extra`, editáveis, e o
 *     texto de cada uma está no bloco do mesmo id da copy efetiva;
 *
 *  IMAGEM ÚNICA (post agendado por página, `agendarPost`):
 *  2. o agendamento grava a cópia da página MARCADA (`_copiaDaPagina`) com o
 *     texto dos extras;
 *  3. editar a página (texto do extra e da manchete) pela função do PATCH do
 *     editor vira revisão da EQUIPE só nesses blocos; a invalidação devolve o
 *     post à fila e o re-render (`renderPostArt`) entrega arte nova ao post;
 *  4. trocar a foto por `ajustarArte` preserva as camadas extras (id, metadados,
 *     texto) sem revisão nenhuma, e o re-render entrega a arte nova;
 *  5. editar a copy do extra por `ajustarArte` vira revisão do CLAUDE só no
 *     bloco do extra, e o post recebe a arte nova;
 *
 *  SLIDE DE CARROSSEL (post com várias mídias, `NOT_NEEDED`):
 *  6. editar o texto do extra livre e do horário e RECOMPOR: a spec gravada leva
 *     os extras com o texto novo, a página continua com as camadas extras e o
 *     slide (só ele) recebe a arte nova;
 *  7. trocar a foto no editor e recompor: a defasagem acusa a foto trocada, a
 *     peça é RECOMPOSTA com a foto da página, os extras continuam na página;
 *  8. editar a copy de novo e recompor: idem.
 *
 * ⚠️ O passo 6 depende do R15 do PR 9 (`specDaRecomposicao`: a recomposição com
 * contrato NÃO carrega `camadasExtras` da spec antiga). Sem ele o `validarSpec`
 * recusa a spec e o slide fica com a arte velha — é exatamente o que a prova
 * deve acusar.
 *
 * Só roda contra o branch de dev (guard por compute, falha fechada). Sobe PNG
 * ao Blob de produção e apaga no cleanup (declarado). NÃO apaga as fotos usadas
 * (são artes existentes do projeto), nem a pasta da semana que a composição
 * cria (mesma escolha de `validar-copy-autoral.ts`).
 *
 * Cleanup: SÓ o que esta rodada criou (ids + a MARCA desta rodada, no projeto
 * da prova). `--varrer-antigas` apaga também o que rodadas anteriores
 * interrompidas deixaram com o prefixo da marca, SÓ neste projeto. Falha de
 * cleanup conta como falha da prova (saída ≠ 0).
 *
 * USO: npx tsx scripts/validar-camadas-extras.ts [--saida <pasta>] [--varrer-antigas]
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
  if (!existsSync(resolve(ROOT, '.env'))) abortar('não há .env aqui para dizer qual compute é PRODUÇÃO.')
  if (!dev.DATABASE_URL) abortar('.env.development.local não define DATABASE_URL.', ['Rode  npm run db:dev:setup  antes.'])
  for (const [k, v] of Object.entries(prod)) if (!(k in process.env)) process.env[k] = v
  for (const k of DB_KEYS) if (dev[k]) process.env[k] = dev[k]
  const alvo = endpointDe(process.env.DATABASE_URL)
  const producao = new Set(DB_KEYS.map((k) => endpointDe(prod[k])).filter((e): e is string => e !== null))
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
const SAIDA = argumento('--saida') ?? '.tmp-validar-camadas-extras'
const VARRER_ANTIGAS = process.argv.includes('--varrer-antigas')
const PREFIXO_DA_MARCA = '[PR10-EXTRAS '
const MARCA = `${PREFIXO_DA_MARCA}${new Date().toISOString()}]`

let ok = 0
let mau = 0
function conferir(titulo: string, condicao: boolean, detalhe = '') {
  console.log(`  ${condicao ? '✓' : '✗'} ${titulo}${detalhe ? ` — ${detalhe}` : ''}`)
  if (condicao) ok++
  else mau++
}

type Camada = Record<string, any>

async function main() {
  const { execSync } = await import('node:child_process')
  const sha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim()
  const branch = execSync('git branch --show-current', { cwd: ROOT }).toString().trim()
  const pendentes = execSync('git status --porcelain', { cwd: ROOT }).toString().trim().split('\n').filter(Boolean).length
  console.log(`código: ${sha} (${branch}) em ${ROOT}; pendente: ${pendentes} arquivo(s) | banco: ${ENDPOINT} | node ${process.version}`)
  mkdirSync(SAIDA, { recursive: true })

  const { db } = await import('../src/lib/db')
  const { comporPeca, carregarAssinatura } = await import('../src/lib/compositor/compor')
  const { NOME_DO_TEMPLATE_DE_ASSINATURA, formatoDaPagina } = await import('../src/lib/compositor/assinatura')
  const { papelDoNome } = await import('../src/lib/compositor/papel-do-nome')
  const { fotoDaPagina } = await import('../src/lib/compositor/defasagem')
  const { recomporPaginaDefasada, levantarPagina, pedirRecomposicaoDaArteCongelada } = await import('../src/lib/compositor/recompor')
  const { lerCamadas } = await import('../src/lib/posts/page-layers')
  const { ajustarArte } = await import('../src/lib/creatives/arte-rapida')
  const { agendarPost } = await import('../src/lib/creatives/agendar')
  const { renderPostArt } = await import('../src/lib/posts/render-post-art')
  const { invalidateScheduledRenders } = await import('../src/lib/posts/invalidate-renders')
  const { ehCopiaDaPagina } = await import('../src/lib/posts/copy-segue-a-pagina')
  const { registrarRevisaoDaPagina } = await import('../src/lib/copy-autoral/persistir')
  const { lerCopyAutoral, VERSAO_DO_CONTRATO } = await import('../src/lib/copy-autoral')
  const { del } = await import('@vercel/blob')
  type CopyAutoral = import('../src/lib/copy-autoral').CopyAutoral

  const blobs = new Set<string>()
  /** As fotos de entrada são artes existentes do projeto: nunca entram no cleanup. */
  const fotosDeEntrada = new Set<string>()
  const pages: string[] = []
  const posts: string[] = []

  const projeto = await db.project.findUnique({ where: { id: PROJETO }, select: { id: true, userId: true, name: true } })
  if (!projeto) abortar(`projeto ${PROJETO} não existe no banco de dev`)

  /** A página como está no banco: camadas e contrato. */
  const estadoDaPagina = async (pageId: string) => {
    const p = await db.page.findUnique({ where: { id: pageId }, select: { layers: true, copyAutoral: true } })
    return { camadas: lerCamadas(p?.layers).camadas as Camada[], copy: lerCopyAutoral(p?.copyAutoral).copy as CopyAutoral | null }
  }
  const semPrefixo = (c: Camada | undefined) => {
    const conteudo = String(c?.content ?? '').replace(/\[|\]/g, '')
    const prefixo = c?.metadata?.compositor?.prefixo
    return typeof prefixo === 'string' && prefixo && conteudo.startsWith(prefixo) ? conteudo.slice(prefixo.length) : conteudo
  }
  const editavel = (c: Camada | undefined) => !!c && (c.type === 'text' || c.type === 'rich-text') && c.visible !== false && c.locked !== true
  /** O coração da prova: o extra na página, com o mesmo id, editável, e o texto certo na copy efetiva — sem bloco `extra-…`. */
  const conferirExtras = (rotulo: string, estado: { camadas: Camada[]; copy: CopyAutoral | null }, esperado: { hora: string; nota: string }) => {
    const hora = estado.camadas.find((c) => c.id === 'hora')
    const nota = estado.camadas.find((c) => c.id === 'nota')
    conferir(
      `${rotulo}: as duas camadas extras estão na página, editáveis, com o id do autor e a identidade declarada (horário = função servico, nota = livre; as duas herdam do apoio)`,
      editavel(hora) && editavel(nota) &&
        hora!.metadata?.compositor?.extra?.id === 'hora' && hora!.metadata?.compositor?.extra?.funcao === 'servico' && hora!.metadata?.compositor?.extra?.herdaDe === 'apoio' && hora!.metadata?.compositor?.papel === 'servico' &&
        nota!.metadata?.compositor?.extra?.id === 'nota' && nota!.metadata?.compositor?.extra?.funcao === 'livre' && nota!.metadata?.compositor?.extra?.herdaDe === 'apoio' && !nota!.metadata?.compositor?.papel,
      JSON.stringify({ hora: hora?.metadata?.compositor ?? null, nota: nota?.metadata?.compositor ?? null }).slice(0, 240),
    )
    conferir(`${rotulo}: o texto DESENHADO de cada extra é o esperado`, semPrefixo(hora) === esperado.hora && semPrefixo(nota) === esperado.nota, JSON.stringify([semPrefixo(hora), semPrefixo(nota)]))
    const porId = Object.fromEntries((estado.copy?.blocos ?? []).map((b) => [b.id, b.linhas.join('\n')]))
    conferir(
      `${rotulo}: a copy efetiva da página tem o texto de cada extra no bloco do MESMO id, sem bloco "extra-…" e sem lacuna sobre eles`,
      porId.hora === esperado.hora && porId.nota === esperado.nota && !(estado.copy?.blocos ?? []).some((b) => b.id.startsWith('extra-')) && !(estado.copy?.lacunas ?? []).some((l) => /"(hora|nota)"/.test(l)),
      JSON.stringify(porId).slice(0, 240),
    )
  }
  /** As revisões que apareceram desde a leitura anterior. */
  const novas = (antes: CopyAutoral | null, depois: CopyAutoral | null) => (depois?.revisoes ?? []).slice(antes?.revisoes.length ?? 0)
  const tocaExtra = (r: { blocos: string[] }) => r.blocos.includes('hora') || r.blocos.includes('nota')
  const editar = (camadas: Camada[], mudancas: Record<string, Partial<Camada>>) => camadas.map((c) => (mudancas[c.id] ? { ...c, ...mudancas[c.id] } : c))
  const gravarComoOEditor = async (pageId: string, camadas: Camada[]) => {
    await db.page.update({ where: { id: pageId }, data: { layers: camadas as never } })
    return registrarRevisaoDaPagina({ pageId, camadas, quem: { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' } })
  }
  const postDeRender = async (postId: string) => db.socialPost.findUnique({ where: { id: postId }, select: { id: true, pageId: true, slotValues: true, renderAttempts: true, renderStatus: true, mediaUrls: true } })

  try {
    // ── 0. a variante sem serviço ────────────────────────────────────────────
    console.log('0) uma variante de story SEM serviço (a peça que precisa de horário vai nela)')
    const template = await db.template.findFirst({ where: { projectId: PROJETO, name: NOME_DO_TEMPLATE_DE_ASSINATURA }, select: { id: true } })
    if (!template) throw new Error(`o projeto ${PROJETO} não tem template "${NOME_DO_TEMPLATE_DE_ASSINATURA}" no banco de dev`)
    const paginasDeAssinatura = await db.page.findMany({ where: { templateId: template.id }, select: { id: true, name: true, width: true, height: true, layers: true, background: true, tags: true }, orderBy: { order: 'asc' } })
    let varianteId: string | null = null
    let base: (typeof paginasDeAssinatura)[number] | null = null
    for (const p of paginasDeAssinatura) {
      if (formatoDaPagina(p) !== 'story') continue
      const a = await carregarAssinatura(PROJETO, 'story', { variante: p.id })
      if (a.origem.pageId !== p.id || !a.papeis.headline || !a.papeis.apoio) continue
      if (!a.papeis.servico) {
        varianteId = p.id
        break
      }
      base ??= p
    }
    if (!varianteId) {
      if (!base) throw new Error('nenhuma página de assinatura de story com headline e apoio para servir de base')
      const ehServico = (c: Camada) => (c.type === 'text' || c.type === 'rich-text') && (papelDoNome(c.name) === 'servico' || papelDoNome(c.id) === 'servico' || /servi[cç]o|endere[cç]o|hor[aá]rio/i.test(`${c.id} ${c.name ?? ''}`))
      const camadas = (lerCamadas(base.layers).camadas as Camada[]).filter((c) => !ehServico(c))
      const criada = await db.page.create({
        data: { name: `${MARCA} variante sem serviço`, width: base.width, height: base.height, layers: camadas as never, background: base.background, tags: base.tags, templateId: template.id, order: 999 },
        select: { id: true },
      })
      pages.push(criada.id)
      varianteId = criada.id
    }
    const variante = await carregarAssinatura(PROJETO, 'story', { variante: varianteId })
    conferir('a variante escolhida tem manchete e apoio e NÃO tem serviço', variante.origem.pageId === varianteId && !!variante.papeis.headline && !!variante.papeis.apoio && !variante.papeis.servico, `${varianteId} (${variante.origem.variante}); papéis: ${Object.keys(variante.papeis).join(', ')}`)
    if (variante.papeis.servico) throw new Error('a variante ainda tem serviço — a prova não provaria o critério')

    const fotos = await db.generation.findMany({
      where: { projectId: PROJETO, status: 'COMPLETED', resultUrl: { contains: 'blob.vercel-storage.com' }, fieldValues: { path: ['track'], equals: 'imagem' } },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: { resultUrl: true },
    })
    const FOTO_1 = fotos[0]?.resultUrl ?? 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1600'
    const FOTO_2 = fotos[1]?.resultUrl && fotos[1].resultUrl !== FOTO_1 ? fotos[1].resultUrl : 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600'
    fotosDeEntrada.add(FOTO_1)
    fotosDeEntrada.add(FOTO_2)

    // ── 1. compor com os extras ──────────────────────────────────────────────
    console.log('1) compor imagem única e slide de carrossel com a nota livre e o horário herdando do apoio, numa variante sem serviço')
    const contrato: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO,
      origem: { autor: 'claude', em: new Date().toISOString(), superficie: 'chat' },
      blocos: [
        { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Almoço de prova'] },
        { id: 'apoio', funcao: 'apoio', ordem: 1, linhas: ['Peça da prova do PR 10.', 'Pode apagar.'] },
        { id: 'nota', funcao: 'livre', ordem: 2, linhas: ['vale só no almoço'], estilo: { herdaDe: 'apoio', grupoVisual: 'principal' } },
        { id: 'hora', funcao: 'servico', ordem: 3, linhas: ['Seg a sex, 11h às 15h'], estilo: { herdaDe: 'apoio', grupoVisual: 'rodape' } },
      ],
      revisoes: [],
    }
    const daqui7 = new Date(Date.now() + 7 * 86_400_000)
    const dia = daqui7.toISOString().slice(0, 10)
    const compor = async (nome: string, extra: Record<string, unknown>) => {
      const r = await comporPeca(
        { projectId: PROJETO, formato: 'story', foto: { url: FOTO_1 }, copyAutoral: contrato, nome: `${MARCA} ${nome}`, quando: `${dia} 10:00`, tema: `${MARCA} teste`, preferencias: { variante: varianteId }, ...extra } as never,
        { canal: 'claude-code' },
      )
      if (!r.persistido) throw new Error(`a composição de "${nome}" não persistiu nada`)
      pages.push(r.persistido.pageId)
      blobs.add(r.persistido.url)
      return { ...r.persistido, diagnostico: r.diagnostico }
    }
    const unica = await compor('imagem única', {})
    const slide = await compor('slide', { carrossel: { slide: 2, de: 2 } })
    for (const [rotulo, peca] of [['imagem única', unica], ['slide', slide]] as const) {
      conferir(`${rotulo}: composta na variante sem serviço`, peca.diagnostico.assinatura.pageId === varianteId, String(peca.diagnostico.assinatura.pageId))
      const estado = await estadoDaPagina(peca.pageId)
      conferirExtras(`${rotulo} (composta)`, estado, { hora: 'Seg a sex, 11h às 15h', nota: 'vale só no almoço' })
      conferir(`${rotulo}: nenhuma revisão toca os extras (o compositor desenhou o que o autor escreveu)`, !!estado.copy && !estado.copy.revisoes.some(tocaExtra), JSON.stringify(estado.copy?.revisoes.map((r) => [r.autor, r.blocos])))
      const gen = await db.generation.findUnique({ where: { id: peca.generationId }, select: { fieldValues: true } })
      const fv = (gen?.fieldValues ?? {}) as Record<string, any>
      const original = lerCopyAutoral(fv.copyAutoral?.original).copy
      conferir(`${rotulo}: o ORIGINAL da arte é o contrato do autor, extras inclusive`, !!original && JSON.stringify(original.blocos) === JSON.stringify(contrato.blocos))
    }

    // ── IMAGEM ÚNICA ─────────────────────────────────────────────────────────
    console.log('2) imagem única agendada por página: a cópia da página vai MARCADA e leva o texto dos extras')
    const agendado = await agendarPost({ projectId: PROJETO, pageId: unica.pageId, generationId: unica.generationId, scheduledDatetime: `${dia} 10:00`, postType: 'STORY', situacao: 'rascunho', lembrete: true, caption: `${MARCA} imagem única — pode apagar` })
    posts.push(agendado.postId)
    let post = await postDeRender(agendado.postId)
    const slot = (post?.slotValues ?? {}) as Record<string, unknown>
    conferir('o post aponta para a página e a cópia da copy está marcada, com o texto dos extras pelo id da camada', post?.pageId === unica.pageId && ehCopiaDaPagina(post?.slotValues) && slot.hora === 'Seg a sex, 11h às 15h' && slot.nota === 'vale só no almoço', JSON.stringify(slot).slice(0, 200))

    console.log('3) editar a página (texto do horário e da manchete) → revisão da equipe só nesses blocos; invalidação + re-render entregam arte nova')
    let antes = (await estadoDaPagina(unica.pageId)).copy
    let camadas = (await estadoDaPagina(unica.pageId)).camadas
    const rev3 = await gravarComoOEditor(unica.pageId, editar(camadas, { hora: { content: 'Ter a dom, 18h às 23h' }, headline: { content: 'Almoço editado' } }))
    let estado = await estadoDaPagina(unica.pageId)
    conferir('revisão registrada só nos blocos editados, autoria da equipe — nada fictício', rev3.estado === 'registrada' && JSON.stringify([...rev3.blocos].sort()) === JSON.stringify(['headline', 'hora']) && novas(antes, estado.copy).every((r) => r.autor === 'equipe'), `${rev3.estado} ${JSON.stringify(rev3.blocos)} | ${JSON.stringify(novas(antes, estado.copy).map((r) => [r.autor, r.blocos]))}`)
    conferirExtras('imagem única (editada)', estado, { hora: 'Ter a dom, 18h às 23h', nota: 'vale só no almoço' })
    const inv3 = await invalidateScheduledRenders(db, { pageIds: [unica.pageId] })
    const pedidos3 = await pedirRecomposicaoDaArteCongelada([unica.pageId])
    conferir('as duas metades da regra: a invalidação alcança o post de imagem única, e a recomposição não tem arte congelada a refazer', inv3.invalidados >= 1 && pedidos3.length === 0, JSON.stringify({ invalidados: inv3.invalidados, pedidos: pedidos3.length }))
    const urlAntes3 = post?.mediaUrls?.[0]
    post = await postDeRender(agendado.postId)
    const render3 = await renderPostArt(post as never)
    if (render3.url) blobs.add(render3.url)
    post = await postDeRender(agendado.postId)
    conferir('re-render: o post recebeu a arte nova e a cópia marcada acompanha o texto desenhado do extra', render3.ok && post?.mediaUrls?.[0] === render3.url && post?.mediaUrls?.[0] !== urlAntes3 && ehCopiaDaPagina(post?.slotValues) && (post?.slotValues as Record<string, unknown>)?.hora === 'Ter a dom, 18h às 23h', JSON.stringify({ ok: render3.ok, motivo: render3.motivo, erro: render3.erro?.slice(0, 80) }))

    console.log('4) trocar a foto por ajustarArte: os extras continuam na página (mesmo id, metadados, texto), sem revisão; o post recebe a arte nova')
    antes = estado.copy
    const fotoAntes4 = fotoDaPagina(estado.camadas)
    const ajuste4 = await ajustarArte({ projectId: PROJETO, pageId: unica.pageId, imageUrl: FOTO_2, canal: 'claude-code' })
    if (ajuste4.url) blobs.add(ajuste4.url)
    estado = await estadoDaPagina(unica.pageId)
    conferir('a foto da página mudou', !!fotoDaPagina(estado.camadas) && fotoDaPagina(estado.camadas) !== fotoAntes4, `${fotoAntes4?.slice(-40)} → ${fotoDaPagina(estado.camadas)?.slice(-40)}`)
    conferirExtras('imagem única (foto trocada)', estado, { hora: 'Ter a dom, 18h às 23h', nota: 'vale só no almoço' })
    conferir('trocar a foto não gera revisão na copy', novas(antes, estado.copy).length === 0, JSON.stringify(novas(antes, estado.copy).map((r) => [r.autor, r.blocos])))
    const urlAntes4 = (await postDeRender(agendado.postId))?.mediaUrls?.[0]
    const render4 = await renderPostArt((await postDeRender(agendado.postId)) as never)
    if (render4.url) blobs.add(render4.url)
    post = await postDeRender(agendado.postId)
    conferir('re-render depois da foto: arte nova no post', render4.ok && post?.mediaUrls?.[0] === render4.url && post?.mediaUrls?.[0] !== urlAntes4, JSON.stringify({ ok: render4.ok, motivo: render4.motivo }))

    console.log('5) editar a copy do extra por ajustarArte: revisão do claude só no bloco do horário; o post recebe a arte nova')
    antes = estado.copy
    const ajuste5 = await ajustarArte({ projectId: PROJETO, pageId: unica.pageId, slotValues: { hora: 'Ter a dom, 12h às 23h' }, canal: 'claude-code' })
    if (ajuste5.url) blobs.add(ajuste5.url)
    estado = await estadoDaPagina(unica.pageId)
    const novas5 = novas(antes, estado.copy)
    conferir('uma revisão, do claude, só no bloco "hora"', novas5.length === 1 && novas5[0].autor === 'claude' && JSON.stringify(novas5[0].blocos) === JSON.stringify(['hora']), JSON.stringify(novas5.map((r) => [r.autor, r.blocos])))
    conferirExtras('imagem única (copy ajustada)', estado, { hora: 'Ter a dom, 12h às 23h', nota: 'vale só no almoço' })
    const urlAntes5 = (await postDeRender(agendado.postId))?.mediaUrls?.[0]
    const render5 = await renderPostArt((await postDeRender(agendado.postId)) as never)
    if (render5.url) blobs.add(render5.url)
    post = await postDeRender(agendado.postId)
    conferir('re-render depois do ajuste: arte nova no post e a cópia marcada com o horário novo', render5.ok && post?.mediaUrls?.[0] === render5.url && post?.mediaUrls?.[0] !== urlAntes5 && (post?.slotValues as Record<string, unknown>)?.hora === 'Ter a dom, 12h às 23h')

    // ── SLIDE DE CARROSSEL ───────────────────────────────────────────────────
    const carrossel = await db.socialPost.create({
      data: { projectId: PROJETO, userId: projeto.userId, postType: 'CAROUSEL', caption: `${MARCA} carrossel — pode apagar`, mediaUrls: [FOTO_1, slide.url], scheduleType: 'SCHEDULED', scheduledDatetime: daqui7, status: 'DRAFT', publishType: 'REMINDER', renderStatus: 'NOT_NEEDED' },
      select: { id: true },
    })
    posts.push(carrossel.id)
    const conferirSlide = async (rotulo: string, url: string | null) => {
      const c = await db.socialPost.findUnique({ where: { id: carrossel.id }, select: { mediaUrls: true } })
      conferir(`${rotulo}: só o slide da arte trocou; a capa ficou e a contagem não diminuiu`, !!url && c?.mediaUrls.length === 2 && c.mediaUrls[0] === FOTO_1 && c.mediaUrls[1] === url, JSON.stringify(c?.mediaUrls.map((u) => u.slice(-30))))
    }
    const conferirSpecGravada = async (rotulo: string, esperado: { hora: string; nota: string }) => {
      const gen = await db.generation.findUnique({ where: { id: slide.generationId }, select: { fieldValues: true } })
      const fv = (gen?.fieldValues ?? {}) as Record<string, any>
      const extras = (fv.spec?.camadasExtras ?? []) as Array<Record<string, any>>
      const hora = ((fv.spec?.blocos ?? []) as Array<Record<string, any>>).find((b) => b.id === 'hora')
      conferir(
        `${rotulo}: a spec gravada leva o horário (herdaDe apoio, rodapé) e a nota (camada extra) com o texto novo, na mesma variante`,
        hora?.papel === 'servico' && hora?.herdaDe === 'apoio' && hora?.grupoVisual === 'rodape' && hora?.linhas?.join('\n') === esperado.hora && extras.length === 1 && extras[0].id === 'nota' && extras[0].herdaDe === 'apoio' && extras[0].linhas.join('\n') === esperado.nota && fv.spec?.preferencias?.variante === varianteId,
        JSON.stringify({ hora, extras }).slice(0, 240),
      )
      return fv
    }

    console.log('6) slide: editar o texto da nota e do horário e RECOMPOR — extras preservados, spec com o texto novo, slide com a arte nova')
    antes = (await estadoDaPagina(slide.pageId)).copy
    camadas = (await estadoDaPagina(slide.pageId)).camadas
    const rev6 = await gravarComoOEditor(slide.pageId, editar(camadas, { nota: { content: 'vale só no jantar' }, hora: { content: 'Ter a dom, 18h às 23h' } }))
    conferir('revisão da equipe só nos blocos dos extras', rev6.estado === 'registrada' && JSON.stringify([...rev6.blocos].sort()) === JSON.stringify(['hora', 'nota']), `${rev6.estado} ${JSON.stringify(rev6.blocos)}`)
    const lev6 = await levantarPagina(slide.pageId)
    conferir('a defasagem é só de texto (recompõe, não re-renderiza), e o slide congelado é achado', !!lev6 && lev6.defasagem.defasada && lev6.defasagem.soTexto && lev6.slides.length === 1, JSON.stringify(lev6?.defasagem))
    const r6 = await recomporPaginaDefasada({ pageId: slide.pageId, origem: 'editor' })
    if (r6.url) blobs.add(r6.url)
    conferir('RECOMPOSTA (não recusou a spec) e trocou o slide', r6.recomposta && r6.trocados.length === 1, JSON.stringify({ recomposta: r6.recomposta, trocados: r6.trocados.length, avisos: r6.avisos.slice(0, 3) }))
    await conferirSlide('recomposição do texto', r6.url)
    estado = await estadoDaPagina(slide.pageId)
    conferirExtras('slide (recomposto)', estado, { hora: 'Ter a dom, 18h às 23h', nota: 'vale só no jantar' })
    conferir('nenhuma revisão fictícia: os extras só foram tocados pela equipe', novas(antes, estado.copy).filter(tocaExtra).every((r) => r.autor === 'equipe'), JSON.stringify(novas(antes, estado.copy).map((r) => [r.autor, r.superficie, r.blocos])))
    await conferirSpecGravada('recomposição do texto', { hora: 'Ter a dom, 18h às 23h', nota: 'vale só no jantar' })

    console.log('7) slide: trocar a foto no editor e recompor — a defasagem acusa a foto, a peça é recomposta com a foto da página, os extras ficam')
    antes = estado.copy
    const fotoAntes7 = fotoDaPagina(estado.camadas)
    const idDaFoto = estado.camadas.find((c) => c.id === 'bg-foto') ? 'bg-foto' : estado.camadas.find((c) => c.type === 'image')?.id
    const rev7 = await gravarComoOEditor(slide.pageId, editar(estado.camadas, { [String(idDaFoto)]: { fileUrl: FOTO_2 } }))
    conferir('trocar a foto não revisa a copy', rev7.estado === 'sem-mudanca', rev7.estado)
    const lev7 = await levantarPagina(slide.pageId)
    conferir('a defasagem acusa a FOTO trocada e libera a recomposição', !!lev7 && lev7.defasagem.fotoTrocada === true && lev7.defasagem.defasada && lev7.defasagem.soTexto, JSON.stringify(lev7?.defasagem))
    const r7 = await recomporPaginaDefasada({ pageId: slide.pageId, origem: 'editor' })
    if (r7.url) blobs.add(r7.url)
    conferir('RECOMPOSTA com a foto nova e trocou o slide', r7.recomposta && r7.trocados.length === 1, JSON.stringify({ recomposta: r7.recomposta, trocados: r7.trocados.length, avisos: r7.avisos.slice(0, 3) }))
    await conferirSlide('recomposição da foto', r7.url)
    estado = await estadoDaPagina(slide.pageId)
    conferir('a página recomposta está com a foto nova', !!fotoDaPagina(estado.camadas) && fotoDaPagina(estado.camadas) !== fotoAntes7, fotoDaPagina(estado.camadas)?.slice(-40) ?? '')
    conferirExtras('slide (foto trocada e recomposto)', estado, { hora: 'Ter a dom, 18h às 23h', nota: 'vale só no jantar' })
    conferir('nenhuma revisão toca os extras na troca da foto', !novas(antes, estado.copy).some(tocaExtra), JSON.stringify(novas(antes, estado.copy).map((r) => [r.autor, r.blocos])))
    const fv7 = await conferirSpecGravada('recomposição da foto', { hora: 'Ter a dom, 18h às 23h', nota: 'vale só no jantar' })
    conferir('a spec gravada usa a foto da página', fv7.spec?.foto?.url === FOTO_2, String(fv7.spec?.foto?.url).slice(-40))

    console.log('8) slide: editar a copy de novo e recompor — o extra continua editável depois de trocar a foto')
    antes = estado.copy
    const rev8 = await gravarComoOEditor(slide.pageId, editar(estado.camadas, { hora: { content: 'Ter a dom, 19h às 23h' } }))
    conferir('revisão da equipe só no horário', rev8.estado === 'registrada' && JSON.stringify(rev8.blocos) === JSON.stringify(['hora']), `${rev8.estado} ${JSON.stringify(rev8.blocos)}`)
    const r8 = await recomporPaginaDefasada({ pageId: slide.pageId, origem: 'editor' })
    if (r8.url) blobs.add(r8.url)
    conferir('RECOMPOSTA e trocou o slide', r8.recomposta && r8.trocados.length === 1, JSON.stringify({ recomposta: r8.recomposta, trocados: r8.trocados.length, avisos: r8.avisos.slice(0, 3) }))
    await conferirSlide('recomposição da copy', r8.url)
    estado = await estadoDaPagina(slide.pageId)
    conferirExtras('slide (copy editada depois da foto)', estado, { hora: 'Ter a dom, 19h às 23h', nota: 'vale só no jantar' })
    conferir('nenhuma revisão fictícia no último passo', novas(antes, estado.copy).filter(tocaExtra).every((r) => r.autor === 'equipe'), JSON.stringify(novas(antes, estado.copy).map((r) => [r.autor, r.blocos])))
    await conferirSpecGravada('recomposição da copy', { hora: 'Ter a dom, 19h às 23h', nota: 'vale só no jantar' })
  } catch (erro) {
    console.error('\n✗ a prova parou:', erro)
    mau++
  } finally {
    console.log('\ncleanup (só o que ESTA rodada criou, no projeto da prova)')
    const apagados = { posts: 0, generations: 0, jobs: 0, pages: 0, blobs: 0 }
    const falhasDoCleanup: string[] = []
    const passo = async (nome: string, fn: () => Promise<void>) => {
      try {
        await fn()
      } catch (e) {
        falhasDoCleanup.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    // A marca desta rodada (com o carimbo) — nunca o prefixo, que alcançaria uma
    // rodada concorrente. `--varrer-antigas` é o caminho explícito, só neste projeto.
    const marcas = VARRER_ANTIGAS ? [PREFIXO_DA_MARCA] : [MARCA]
    const idsDePagina = new Set<string>(pages)
    await passo('páginas da rodada', async () => {
      const achadas = await db.page.findMany({ where: { OR: [{ id: { in: pages } }, ...marcas.map((m) => ({ name: { contains: m }, Template: { projectId: PROJETO } }))] }, select: { id: true } })
      for (const p of achadas) idsDePagina.add(p.id)
    })
    let idsDeGeracao: string[] = []
    await passo('generations', async () => {
      const gens = await db.generation.findMany({
        where: { projectId: PROJETO, OR: [...[...idsDePagina].map((id) => ({ fieldValues: { path: ['pageId'], equals: id } })), ...marcas.map((m) => ({ fieldValues: { path: ['spec', 'nome'], string_contains: m } }))] },
        select: { id: true, resultUrl: true, fieldValues: true },
      })
      for (const g of gens) {
        if (g.resultUrl) blobs.add(g.resultUrl)
        const rastro = ((g.fieldValues as Record<string, any> | null)?.recomposicao?.urlsAnteriores ?? []) as unknown[]
        for (const u of rastro) if (typeof u === 'string') blobs.add(u)
      }
      idsDeGeracao = gens.map((g) => g.id)
    })
    const idsDePost = new Set<string>(posts)
    await passo('posts da rodada', async () => {
      const achados = await db.socialPost.findMany({ where: { projectId: PROJETO, OR: [{ id: { in: posts } }, ...marcas.map((m) => ({ caption: { contains: m } }))] }, select: { id: true, mediaUrls: true } })
      for (const p of achados) idsDePost.add(p.id)
    })
    await passo('jobs', async () => { apagados.jobs = (await db.generationJob.deleteMany({ where: { generationId: { in: idsDeGeracao } } })).count })
    await passo('sinais', async () => { await db.learningSignal.deleteMany({ where: { projectId: PROJETO, OR: [{ pageId: { in: [...idsDePagina] } }, { generationId: { in: idsDeGeracao } }, { postId: { in: [...idsDePost] } }] } }) })
    await passo('posts', async () => { apagados.posts = (await db.socialPost.deleteMany({ where: { projectId: PROJETO, id: { in: [...idsDePost] } } })).count })
    await passo('generations', async () => { apagados.generations = (await db.generation.deleteMany({ where: { id: { in: idsDeGeracao } } })).count })
    await passo('páginas', async () => { apagados.pages = (await db.page.deleteMany({ where: { id: { in: [...idsDePagina] } } })).count })
    for (const url of blobs) {
      // Só o que a rodada gerou no Blob (artes renderizadas) — nunca as fotos de entrada.
      if (fotosDeEntrada.has(url)) continue
      await passo(`blob ${url.slice(-40)}`, async () => {
        await del(url)
        apagados.blobs++
      })
    }
    if (falhasDoCleanup.length) {
      console.error('  ✗ cleanup incompleto:', falhasDoCleanup.join(' | '))
      mau += falhasDoCleanup.length
    }
    console.log('  apagados:', JSON.stringify(apagados))
    writeFileSync(resolve(SAIDA, 'resultado.json'), JSON.stringify({ sha, branch, pendentes, banco: ENDPOINT, ok, falhas: mau, apagados, falhasDoCleanup }, null, 2))
    console.log(`\n${ok} ok, ${mau} falha(s). Saída em ${resolve(SAIDA)}`)
    await db.$disconnect()
    process.exit(mau > 0 ? 1 : 0)
  }
}

main()
