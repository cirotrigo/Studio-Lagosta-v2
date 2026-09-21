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
 *  CONCORRÊNCIA, FALHA PARCIAL E O PR9-F01 (exigidos pela revisão FINAL do
 *  Codex sobre o PR 9, 21/09/2026: a prova sobre a árvore combinada cobre as
 *  DUAS formas de extra — livre → `camadasExtras`, e o extra COM FUNÇÃO, bloco
 *  em `spec.blocos` com `herdaDe` —, imagem única, carrossel, concorrência e
 *  falha parcial):
 *  9. a equipe edita a página ENTRE o levantamento e a composição: a
 *     recomposição para antes de compor (PAGINA_MUDOU_DURANTE), nada é gravado
 *     por cima, e a execução seguinte recompõe com as duas edições;
 * 10. pelo EXECUTOR (job real): a equipe edita a página DEPOIS de a recomposição
 *     gravá-la e antes de gravar a arte — o job volta à fila marcado para
 *     desenhar a página como está, e a execução seguinte entrega a última edição;
 * 11. pelo executor: a página recomposta é gravada e a escrita da ARTE falha
 *     (falha parcial) — o job volta à fila, nada se perde, e a execução
 *     seguinte converge;
 * 12. PR9-F01 SEM bloco comum da função, nos dois gatilhos: leitura inválida
 *     (linha que o contrato não comporta no livre) e histórico da copy CHEIO
 *     (nota livre e horário com função editados) — a arte segue a página, as
 *     identidades ficam, o contrato fica intocado;
 * 13. uma variante COM serviço: o serviço COMUM ao lado de um segundo serviço
 *     que herda do apoio (extra com função, sem livre), num slide de carrossel,
 *     com um post já entregue ao publicador carregando a mesma arte;
 * 14. PR9-F01, leitura inválida no extra COM FUNÇÃO: a arte segue a página como
 *     está — sem recusa, sem virar serviço comum, post congelado intocado;
 * 15. PR9-F01, histórico cheio COM bloco comum: o serviço comum continua comum,
 *     o extra continua extra, o contrato fica intocado;
 * 16. PR10-04 pelo EXECUTOR (job real), nas duas formas de extra: histórico
 *     cheio + uma linha que o contrato não comporta. A edição do editor
 *     devolve `historico-cheio` (a recusa do histórico mascara o conteúdo), e o
 *     job fecha DONE com a página RE-RENDERIZADA como está — nunca
 *     SPEC_INVALIDA —, página e contrato intocados, post congelado intocado.
 *
 * Os passos 12, 14 e 15 conferem o DESFECHO que a pessoa vê, válido para as
 * duas saídas corretas do fallback sem contrato legível — recompor (com o
 * histórico cheio, pelo contrato COMO A PÁGINA O MOSTRA, PR10-04/05; sem
 * contrato, lendo cada extra pela identidade da camada) ou re-renderizar a
 * página como está — e reprovam as incorretas (recusa, slide velho, extra
 * fundido no comum, contrato reescrito). No 16 o texto não cabe nem na spec, e
 * re-renderizar é a ÚNICA saída correta.
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

/**
 * Espaça as idas ao Blob: o domínio público levanta o "Vercel Security
 * Checkpoint" (403 para toda URL, por minutos) quando a máquina faz muitas
 * leituras em pouco tempo — mesmo molde de `validar-revisor-da-arte.ts`.
 */
async function pausaParaOBlob(ms: number, porque: string) {
  console.log(`   (pausa de ${Math.round(ms / 1000)}s: ${porque})`)
  await new Promise((r) => setTimeout(r, ms))
}
type ErroDaTentativa = { code?: string; status?: number; message: string }
/** Roda e devolve o resultado OU o erro, sem lançar — a prova confere os dois lados. */
async function tentar<T>(fn: () => Promise<T>): Promise<{ r: T | null; erro: ErroDaTentativa | null }> {
  try {
    return { r: await fn(), erro: null }
  } catch (e) {
    const x = e as { code?: string; status?: number; message?: string }
    return { r: null, erro: { code: x.code, status: x.status, message: x.message ?? String(e) } }
  }
}

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
  const { recomporPaginaDefasada, levantarPagina, pedirRecomposicaoDaArteCongelada, processarRecomposicaoEmBackground } = await import('../src/lib/compositor/recompor')
  const { lerCamadas } = await import('../src/lib/posts/page-layers')
  const { ajustarArte } = await import('../src/lib/creatives/arte-rapida')
  const { agendarPost } = await import('../src/lib/creatives/agendar')
  const { renderPostArt } = await import('../src/lib/posts/render-post-art')
  const { invalidateScheduledRenders } = await import('../src/lib/posts/invalidate-renders')
  const { ehCopiaDaPagina } = await import('../src/lib/posts/copy-segue-a-pagina')
  const { registrarRevisaoDaPagina } = await import('../src/lib/copy-autoral/persistir')
  const { lerCopyAutoral, VERSAO_DO_CONTRATO, MAX_REVISOES_DA_COPY } = await import('../src/lib/copy-autoral')
  const { reservarJob, fecharJob, falharJob } = await import('../src/lib/ai/generation-queue')
  const { del } = await import('@vercel/blob')
  type CopyAutoral = import('../src/lib/copy-autoral').CopyAutoral
  type Recomposicao = Awaited<ReturnType<typeof recomporPaginaDefasada>>
  type Costuras = NonNullable<Parameters<typeof processarRecomposicaoEmBackground>[0]['seams']>

  // Com os passos de concorrência, falha parcial e F01 a prova passa de vinte
  // renders, e cada um busca a foto e a logo no domínio público do Blob, que
  // devolve 403 (o desafio anti-bot) quando a máquina faz muitas idas em pouco
  // tempo. O que se prova aqui é o ciclo da camada extra, não a disponibilidade
  // do Blob: neste processo, cada imagem do Blob é baixada UMA vez por URL (a
  // URL do Blob leva sufixo aleatório, o conteúdo dela não muda), com nova
  // tentativa espaçada em 403/429/5xx — o molde de `validar-revisor-da-arte.ts`.
  const { CanvasRenderer } = await import('../src/lib/canvas-renderer')
  const { loadImage } = await import('@napi-rs/canvas')
  const HOST_DO_BLOB = /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//
  const bytesDoBlob = new Map<string, Promise<Buffer>>()
  const esperasDoBlob = [20_000, 45_000, 90_000, 120_000]
  const baixarDoBlob = async (url: string): Promise<Buffer> => {
    for (let tentativa = 0; ; tentativa++) {
      const r = await fetch(url, { headers: { 'user-agent': 'studio-lagosta-prova/1.0 (validar-camadas-extras)' } })
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

    // ── CONCORRÊNCIA, FALHA PARCIAL E O PR9-F01 ──────────────────────────────
    await pausaParaOBlob(30_000, 'os passos 1 a 8 fizeram dez renders; espaça as idas ao Blob')
    const midiasDo = async (postId: string) => (await db.socialPost.findUnique({ where: { id: postId }, select: { mediaUrls: true } }))?.mediaUrls ?? []
    const arteDa = async (generationId: string) => {
      const g = await db.generation.findUnique({ where: { id: generationId }, select: { resultUrl: true, fieldValues: true } })
      return { url: g?.resultUrl ?? null, fv: (g?.fieldValues ?? {}) as Record<string, any> }
    }
    /** Como o executor (`executarJob`): reserva (PENDING → RUNNING, +1 tentativa, payload fresco), roda o runner e fecha pelo desfecho; o que o runner LANÇA vira `falharJob`. */
    const executarComoOExecutor = async (jobId: string, generationId: string, seams?: Costuras) => {
      const job = await reservarJob(jobId)
      if (!job) return { desfecho: 'nao-reservado', erro: 'o job não estava na fila (PENDING)' as string | null }
      const recompor = (job.payload as Record<string, any>)?.recompor
      try {
        await processarRecomposicaoEmBackground({ generationId, projectId: PROJETO, recompor, queueJobId: jobId, ...(seams ? { seams } : {}) })
        return { desfecho: String(await fecharJob(jobId, generationId)), erro: null as string | null }
      } catch (e) {
        const motivo = e instanceof Error ? e.message : String(e)
        return { desfecho: String(await falharJob(jobId, motivo)), erro: motivo as string | null }
      }
    }
    /** Uma linha maior que o teto do contrato (300 caracteres): é a "leitura inválida" do PR9-F01. */
    const linhaLonga = (inicio: string) => `${inicio} · ${'reserve pelo WhatsApp da casa · '.repeat(10)}`.trim()
    /** O histórico da copy no TETO: a leitura da copy efetiva passa a recusar com `HistoricoDaCopyCheio`. Revisões do sistema, válidas no leitor, citando um bloco que existe. */
    const encherHistorico = async (pageId: string) => {
      const atual = (await estadoDaPagina(pageId)).copy
      if (!atual) throw new Error(`a página ${pageId} não tem contrato da copy para encher o histórico`)
      const citado = atual.blocos[0]?.id
      if (!citado) throw new Error('o contrato não tem bloco para as revisões citarem')
      const faltam = Math.max(0, MAX_REVISOES_DA_COPY - atual.revisoes.length)
      const desde = Date.now() - faltam * 1000
      const cheio = {
        ...atual,
        revisoes: [
          ...atual.revisoes,
          ...Array.from({ length: faltam }, (_, i) => ({ em: new Date(desde + i * 1000).toISOString(), autor: 'sistema' as const, motivo: `${MARCA} histórico cheio de propósito`, blocos: [citado], superficie: 'prova' })),
        ],
      }
      const lido = lerCopyAutoral(cheio).copy
      if (!lido || lido.revisoes.length !== MAX_REVISOES_DA_COPY) throw new Error('o contrato com o histórico cheio não passou no leitor')
      await db.page.update({ where: { id: pageId }, data: { copyAutoral: lido as never } })
      return lido
    }
    /**
     * O desfecho que o PR9-F01 exige do fallback SEM contrato legível, dito pelo
     * que a pessoa vê. Vale para as duas saídas corretas — recompor lendo cada
     * extra pela IDENTIDADE da camada, ou re-renderizar a página como está — e
     * reprova as incorretas: recusa (SPEC_INVALIDA, papel repetido), slide velho,
     * extra que perde id ou herança, serviço extra fundido no comum, contrato
     * reescrito, post entregue tocado.
     */
    const conferirDesfechoSemContrato = async (a: {
      rotulo: string
      pageId: string
      generationId: string
      postId: string
      capa: string
      slideAntes: string | undefined
      tentativa: { r: Recomposicao | null; erro: ErroDaTentativa | null }
      contratoAntes: CopyAutoral
      extras: Array<{ id: string; funcao: string; texto: string }>
      comuns: Record<string, string>
      congelado?: { id: string; midias: string[] }
    }) => {
      const { r, erro } = a.tentativa
      if (r?.url) blobs.add(r.url)
      conferir(`${a.rotulo}: a arte foi refeita SEM recusa (nem SPEC_INVALIDA, nem papel repetido) e o slide trocou`, !erro && !!r && r.trocados.length === 1, erro ? `${erro.code ?? 'ERRO'}: ${erro.message.slice(0, 160)}` : JSON.stringify({ recomposta: r?.recomposta, trocados: r?.trocados.length, avisos: r?.avisos.slice(0, 2) }).slice(0, 260))
      const midias = await midiasDo(a.postId)
      conferir(`${a.rotulo}: só o slide da arte trocou; a capa ficou e a contagem não diminuiu`, !!r?.url && midias.length === 2 && midias[0] === a.capa && midias[1] === r.url && midias[1] !== a.slideAntes, JSON.stringify(midias.map((u) => u.slice(-30))))
      const arte = await arteDa(a.generationId)
      const estadoDaArte = arte.fv.recomposicao?.estado
      conferir(`${a.rotulo}: o registro é de arte refeita (recomposta pela identidade ou re-renderizada como está), sem recusa gravada`, (estadoDaArte === 'feita' || estadoDaArte === 're-renderizada') && !arte.fv.recusaDaRecomposicao && !!r?.url && arte.url === r.url, JSON.stringify({ estado: estadoDaArte ?? null, recusa: arte.fv.recusaDaRecomposicao ?? null }).slice(0, 240))
      const e = await estadoDaPagina(a.pageId)
      const textos = e.camadas.filter((c) => c.type === 'text' || c.type === 'rich-text')
      for (const x of a.extras) {
        const c = textos.find((t) => t.metadata?.compositor?.extra?.id === x.id)
        const ex = c?.metadata?.compositor?.extra
        const papelOk = x.funcao === 'livre' ? !c?.metadata?.compositor?.papel : c?.metadata?.compositor?.papel === x.funcao
        conferir(`${a.rotulo}: o extra "${x.id}" continua na página com id, função (${x.funcao}) e herança do apoio, editável, com o texto da equipe`, editavel(c) && ex?.funcao === x.funcao && ex?.herdaDe === 'apoio' && papelOk && semPrefixo(c) === x.texto, JSON.stringify({ extra: ex ?? null, papel: c?.metadata?.compositor?.papel ?? null, texto: semPrefixo(c).slice(0, 60) }))
      }
      for (const [papel, texto] of Object.entries(a.comuns)) {
        const cs = textos.filter((t) => t.metadata?.compositor?.papel === papel && !t.metadata?.compositor?.extra && t.visible !== false)
        conferir(`${a.rotulo}: o ${papel} COMUM continua comum (uma camada, sem identidade de extra) e com o texto dele`, cs.length === 1 && semPrefixo(cs[0]) === texto, JSON.stringify(cs.map((c) => [c.id, semPrefixo(c).slice(0, 40)])))
      }
      conferir(`${a.rotulo}: o contrato da página ficou INTOCADO (sem contrato legível, ninguém o reescreve)`, JSON.stringify(e.copy) === JSON.stringify(a.contratoAntes), `${e.copy?.revisoes.length ?? 'sem contrato'} revisões`)
      if (estadoDaArte === 'feita') {
        const spec = (arte.fv.spec ?? {}) as Record<string, any>
        const blocos = (spec.blocos ?? []) as Array<Record<string, any>>
        const extrasDaSpec = (spec.camadasExtras ?? []) as Array<Record<string, any>>
        for (const x of a.extras) {
          const b = x.funcao === 'livre' ? extrasDaSpec.find((y) => y.id === x.id) : blocos.find((y) => y.id === x.id)
          conferir(`${a.rotulo}: recomposta — a spec gravada preserva o extra "${x.id}" (${x.funcao === 'livre' ? 'camadasExtras' : 'bloco com herdaDe'}) com o texto novo`, !!b && b.herdaDe === 'apoio' && (x.funcao === 'livre' || b.papel === x.funcao) && (b.linhas ?? []).join('\n') === x.texto, JSON.stringify(b ?? null).slice(0, 200))
        }
        for (const [papel, texto] of Object.entries(a.comuns)) {
          const bs = blocos.filter((y) => y.papel === papel && !y.herdaDe)
          conferir(`${a.rotulo}: recomposta — a spec gravada tem UM ${papel} comum, sem herança, com o texto dele`, bs.length === 1 && (bs[0].linhas ?? []).join('\n') === texto, JSON.stringify(bs).slice(0, 200))
        }
      }
      if (a.congelado) {
        const m = await midiasDo(a.congelado.id)
        conferir(`${a.rotulo}: o post já entregue ao publicador (congelado) ficou intocado`, JSON.stringify(m) === JSON.stringify(a.congelado.midias) && !!r && r.congelados.includes(a.congelado.id), JSON.stringify({ midias: m.map((u) => u.slice(-30)), congelados: r?.congelados ?? null }))
      }
    }

    console.log('9) concorrência antes de compor: a equipe edita a nota; a recomposição começa e, entre o levantamento e a composição, a equipe edita o horário — nada se perde')
    antes = estado.copy
    const slideAntes9 = (await midiasDo(carrossel.id))[1]
    await gravarComoOEditor(slide.pageId, editar(estado.camadas, { nota: { content: 'vale no almoço e no jantar' } }))
    const t9 = await tentar(() =>
      recomporPaginaDefasada({
        pageId: slide.pageId,
        origem: 'editor',
        depoisDoLevantamento: async () => {
          const agora = await estadoDaPagina(slide.pageId)
          await gravarComoOEditor(slide.pageId, editar(agora.camadas, { hora: { content: 'Ter a dom, 18h às 22h' } }))
        },
      }),
    )
    if (t9.r?.url) blobs.add(t9.r.url)
    conferir('a recomposição parou ANTES de compor (PAGINA_MUDOU_DURANTE 409): a decisão do levantamento não vale para a página nova', t9.erro?.code === 'PAGINA_MUDOU_DURANTE' && t9.erro.status === 409, t9.erro ? `${t9.erro.code} ${t9.erro.message.slice(0, 80)}` : 'não lançou')
    conferir('nada foi gravado por cima: o slide é o anterior', (await midiasDo(carrossel.id))[1] === slideAntes9)
    estado = await estadoDaPagina(slide.pageId)
    conferirExtras('slide (edição concorrente)', estado, { hora: 'Ter a dom, 18h às 22h', nota: 'vale no almoço e no jantar' })
    const novas9 = novas(antes, estado.copy)
    conferir('as duas edições estão no contrato como revisões da equipe', novas9.filter(tocaExtra).every((r) => r.autor === 'equipe') && novas9.some((r) => r.blocos.includes('nota')) && novas9.some((r) => r.blocos.includes('hora')), JSON.stringify(novas9.map((r) => [r.autor, r.blocos])))
    const r9 = await recomporPaginaDefasada({ pageId: slide.pageId, origem: 'editor' })
    if (r9.url) blobs.add(r9.url)
    conferir('a execução seguinte RECOMPÕE com a página nova e troca o slide', r9.recomposta && r9.trocados.length === 1, JSON.stringify({ recomposta: r9.recomposta, trocados: r9.trocados.length, avisos: r9.avisos.slice(0, 3) }))
    await conferirSlide('recomposição depois da concorrência', r9.url)
    estado = await estadoDaPagina(slide.pageId)
    conferirExtras('slide (recomposto depois da concorrência)', estado, { hora: 'Ter a dom, 18h às 22h', nota: 'vale no almoço e no jantar' })
    await conferirSpecGravada('recomposição depois da concorrência', { hora: 'Ter a dom, 18h às 22h', nota: 'vale no almoço e no jantar' })

    console.log('10) concorrência pelo executor: a recomposição grava a página e, antes de gravar a arte, a equipe edita a nota de novo — o job volta à fila e a execução seguinte desenha a página como está')
    await gravarComoOEditor(slide.pageId, editar(estado.camadas, { hora: { content: 'Qua a dom, 18h às 22h' } }))
    const pedido10 = await pedirRecomposicaoDaArteCongelada([slide.pageId])
    const job10 = pedido10[0]?.jobId ?? null
    conferir('a edição põe a arte do slide na fila (job de recomposição da arte do slide)', !!job10 && pedido10[0].generationId === slide.generationId, JSON.stringify(pedido10))
    if (job10) {
      const a10 = await executarComoOExecutor(job10, slide.generationId, {
        entreGravarPaginaEArte: async () => {
          const agora = await estadoDaPagina(slide.pageId)
          await gravarComoOEditor(slide.pageId, editar(agora.camadas, { nota: { content: 'vale todo dia' } }))
        },
      })
      const arte10a = await arteDa(slide.generationId)
      if (arte10a.url) blobs.add(arte10a.url)
      const job10a = await db.generationJob.findUnique({ where: { id: job10 }, select: { status: true, payload: true, lastError: true } })
      conferir('1ª execução: recompôs, viu a página mudar DEPOIS de gravá-la e devolveu o job à fila, marcado para desenhar a página COMO ESTÁ', a10.desfecho === 'REENFILEIRADO' && job10a?.status === 'PENDING' && (job10a.payload as Record<string, any>)?.recompor?.renderizarComoEsta === true, JSON.stringify({ desfecho: a10.desfecho, erro: a10.erro, status: job10a?.status, lastError: job10a?.lastError }).slice(0, 260))
      const b10 = await executarComoOExecutor(job10, slide.generationId)
      const arte10b = await arteDa(slide.generationId)
      if (arte10b.url) blobs.add(arte10b.url)
      conferir('2ª execução: re-renderizou a página como está e fechou DONE, com arte nova', b10.desfecho === 'DONE' && arte10b.fv.recomposicao?.estado === 're-renderizada' && !!arte10b.url && arte10b.url !== arte10a.url, JSON.stringify({ desfecho: b10.desfecho, erro: b10.erro, estado: arte10b.fv.recomposicao?.estado }))
      await conferirSlide('execução depois da concorrência', arte10b.url)
      estado = await estadoDaPagina(slide.pageId)
      conferirExtras('slide (a última edição chegou à arte)', estado, { hora: 'Qua a dom, 18h às 22h', nota: 'vale todo dia' })
    }

    console.log('11) falha parcial pelo executor: a página recomposta é gravada e a escrita da ARTE falha — o job volta à fila, nada se perde, e a execução seguinte entrega o slide')
    await gravarComoOEditor(slide.pageId, editar(estado.camadas, { nota: { content: 'vale só hoje' } }))
    const pedido11 = await pedirRecomposicaoDaArteCongelada([slide.pageId])
    const job11 = pedido11[0]?.jobId ?? null
    conferir('a edição reabre o job da arte (terminado) com orçamento novo', !!job11 && job11 === job10, JSON.stringify(pedido11))
    if (job11) {
      const slideAntes11 = (await midiasDo(carrossel.id))[1]
      const arteAntes11 = await arteDa(slide.generationId)
      const a11 = await executarComoOExecutor(job11, slide.generationId, {
        entreGravarPaginaEArte: async () => {
          throw new Error('falha simulada pela prova: o banco caiu entre gravar a página e gravar a arte')
        },
      })
      // O PNG da tentativa que falhou só a página referencia (miniatura): entra no cleanup.
      const pagina11 = await db.page.findUnique({ where: { id: slide.pageId }, select: { thumbnail: true } })
      if (pagina11?.thumbnail && pagina11.thumbnail.includes('blob.vercel-storage.com')) blobs.add(pagina11.thumbnail)
      const job11a = await db.generationJob.findUnique({ where: { id: job11 }, select: { status: true, lastError: true } })
      conferir('a falha de infraestrutura devolveu o job à fila com o motivo — nova tentativa, não FAILED', a11.desfecho === 'REENFILEIRADO' && job11a?.status === 'PENDING' && /falha simulada/.test(String(job11a.lastError)), JSON.stringify({ desfecho: a11.desfecho, erro: a11.erro, status: job11a?.status, lastError: String(job11a?.lastError ?? '').slice(0, 80) }))
      const arteMeio11 = await arteDa(slide.generationId)
      conferir('no meio do caminho a arte e o slide ainda são os anteriores (a arte não foi gravada) e não há recusa', arteMeio11.url === arteAntes11.url && (await midiasDo(carrossel.id))[1] === slideAntes11 && !arteMeio11.fv.recusaDaRecomposicao, JSON.stringify({ arte: arteMeio11.url?.slice(-30), recusa: arteMeio11.fv.recusaDaRecomposicao ?? null }))
      estado = await estadoDaPagina(slide.pageId)
      conferirExtras('slide (página gravada, arte não)', estado, { hora: 'Qua a dom, 18h às 22h', nota: 'vale só hoje' })
      const b11 = await executarComoOExecutor(job11, slide.generationId)
      const arte11 = await arteDa(slide.generationId)
      if (arte11.url) blobs.add(arte11.url)
      conferir('a execução seguinte CONVERGE: DONE, arte nova, sem recusa', b11.desfecho === 'DONE' && !!arte11.url && arte11.url !== arteAntes11.url && ['feita', 're-renderizada'].includes(String(arte11.fv.recomposicao?.estado)) && !arte11.fv.recusaDaRecomposicao, JSON.stringify({ desfecho: b11.desfecho, erro: b11.erro, estado: arte11.fv.recomposicao?.estado ?? null }))
      await conferirSlide('execução depois da falha parcial', arte11.url)
      estado = await estadoDaPagina(slide.pageId)
      conferirExtras('slide (convergido depois da falha parcial)', estado, { hora: 'Qua a dom, 18h às 22h', nota: 'vale só hoje' })
    }

    await pausaParaOBlob(30_000, 'mais duas composições e quatro refeituras no Blob')
    console.log('12) PR9-F01 SEM bloco comum da função, num slide novo (variante sem serviço): nota livre e horário com função, os dois herdando do apoio')
    const contratoC: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO,
      origem: { autor: 'claude', em: new Date().toISOString(), superficie: 'chat' },
      blocos: [
        { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Costela de prova'] },
        { id: 'apoio', funcao: 'apoio', ordem: 1, linhas: ['Peça do F01 do PR 10.'] },
        { id: 'nota', funcao: 'livre', ordem: 2, linhas: ['vale só no almoço'], estilo: { herdaDe: 'apoio', grupoVisual: 'principal' } },
        { id: 'hora', funcao: 'servico', ordem: 3, linhas: ['Seg a sex, 11h às 15h'], estilo: { herdaDe: 'apoio', grupoVisual: 'rodape' } },
      ],
      revisoes: [],
    }
    const slideC = await compor('slide F01 sem comum', { carrossel: { slide: 2, de: 2 }, copyAutoral: contratoC })
    const carrosselC = await db.socialPost.create({
      data: { projectId: PROJETO, userId: projeto.userId, postType: 'CAROUSEL', caption: `${MARCA} carrossel F01 sem comum — pode apagar`, mediaUrls: [FOTO_1, slideC.url], scheduleType: 'SCHEDULED', scheduledDatetime: daqui7, status: 'DRAFT', publishType: 'REMINDER', renderStatus: 'NOT_NEEDED' },
      select: { id: true },
    })
    posts.push(carrosselC.id)
    let estadoC = await estadoDaPagina(slideC.pageId)
    conferirExtras('slide F01 sem comum (composto)', estadoC, { hora: 'Seg a sex, 11h às 15h', nota: 'vale só no almoço' })

    console.log('12a) leitura inválida no extra LIVRE: a equipe escreve na nota uma linha que o contrato não comporta')
    const notaLonga = linhaLonga('vale só hoje')
    const contratoAntes12a = estadoC.copy
    if (!contratoAntes12a) throw new Error('o slide F01 sem comum nasceu sem contrato da copy')
    const rev12a = await gravarComoOEditor(slideC.pageId, editar(estadoC.camadas, { nota: { content: notaLonga } }))
    conferir('a linha longa grava as camadas e NÃO revisa o contrato (copy-invalida)', rev12a.estado === 'copy-invalida' && notaLonga.length > 300, `${rev12a.estado}; ${notaLonga.length} caracteres`)
    await conferirDesfechoSemContrato({
      rotulo: 'F01 leitura inválida (livre)',
      pageId: slideC.pageId,
      generationId: slideC.generationId,
      postId: carrosselC.id,
      capa: FOTO_1,
      slideAntes: (await midiasDo(carrosselC.id))[1],
      tentativa: await tentar(() => recomporPaginaDefasada({ pageId: slideC.pageId, origem: 'editor' })),
      contratoAntes: contratoAntes12a,
      extras: [{ id: 'nota', funcao: 'livre', texto: notaLonga }, { id: 'hora', funcao: 'servico', texto: 'Seg a sex, 11h às 15h' }],
      comuns: {},
    })

    console.log('12b) histórico da copy CHEIO: a equipe corrige a nota (livre) e o horário (extra com função) — a arte segue a página, as duas identidades ficam')
    const contratoCheioC = await encherHistorico(slideC.pageId)
    estadoC = await estadoDaPagina(slideC.pageId)
    const rev12b = await gravarComoOEditor(slideC.pageId, editar(estadoC.camadas, { nota: { content: 'vale só no domingo' }, hora: { content: 'Sáb e dom, 12h às 23h' } }))
    conferir('com o histórico cheio a edição grava as camadas e NÃO revisa o contrato (historico-cheio)', rev12b.estado === 'historico-cheio', rev12b.estado)
    await conferirDesfechoSemContrato({
      rotulo: 'F01 histórico cheio (sem bloco comum)',
      pageId: slideC.pageId,
      generationId: slideC.generationId,
      postId: carrosselC.id,
      capa: FOTO_1,
      slideAntes: (await midiasDo(carrosselC.id))[1],
      tentativa: await tentar(() => recomporPaginaDefasada({ pageId: slideC.pageId, origem: 'editor' })),
      contratoAntes: contratoCheioC,
      extras: [{ id: 'nota', funcao: 'livre', texto: 'vale só no domingo' }, { id: 'hora', funcao: 'servico', texto: 'Sáb e dom, 12h às 23h' }],
      comuns: {},
    })

    console.log('13) PR9-F01 COM bloco comum da função: variante COM serviço; o serviço comum ao lado de um segundo serviço que herda do apoio (extra com função, sem livre)')
    let varianteComServico: string | null = null
    for (const p of paginasDeAssinatura) {
      if (formatoDaPagina(p) !== 'story') continue
      const a = await carregarAssinatura(PROJETO, 'story', { variante: p.id })
      if (a.origem.pageId === p.id && a.papeis.headline && a.papeis.apoio && a.papeis.servico) {
        varianteComServico = p.id
        break
      }
    }
    if (!varianteComServico) throw new Error(`o projeto ${PROJETO} não tem variante de story com manchete, apoio e serviço — o F01 com bloco comum precisa de uma`)
    const contratoB: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO,
      origem: { autor: 'claude', em: new Date().toISOString(), superficie: 'chat' },
      blocos: [
        { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Costela no bafo'] },
        { id: 'apoio', funcao: 'apoio', ordem: 1, linhas: ['Peça do F01 do PR 10.'] },
        { id: 'servico', funcao: 'servico', ordem: 2, linhas: ['Seg a sex, 11h às 15h'] },
        { id: 'hora-fds', funcao: 'servico', ordem: 3, linhas: ['Sáb e dom, 12h às 16h'], estilo: { herdaDe: 'apoio', grupoVisual: 'principal' } },
      ],
      revisoes: [],
    }
    const slideB = await compor('slide F01 com comum', { carrossel: { slide: 2, de: 2 }, copyAutoral: contratoB, preferencias: { variante: varianteComServico } })
    conferir('F01: composta na variante COM serviço', slideB.diagnostico.assinatura.pageId === varianteComServico, String(slideB.diagnostico.assinatura.pageId))
    let estadoB = await estadoDaPagina(slideB.pageId)
    const extraB = estadoB.camadas.find((c) => c.metadata?.compositor?.extra?.id === 'hora-fds')
    const comunsB = estadoB.camadas.filter((c) => (c.type === 'text' || c.type === 'rich-text') && c.metadata?.compositor?.papel === 'servico' && !c.metadata?.compositor?.extra && c.visible !== false)
    const porIdB = Object.fromEntries((estadoB.copy?.blocos ?? []).map((b) => [b.id, b.linhas.join('\n')]))
    conferir(
      'F01: a página tem o serviço COMUM (sem identidade de extra) e o extra "hora-fds" (função serviço, herança do apoio), e a copy efetiva põe cada texto no bloco do seu id, sem bloco "extra-…"',
      editavel(extraB) && extraB!.metadata.compositor.extra.funcao === 'servico' && extraB!.metadata.compositor.extra.herdaDe === 'apoio' && extraB!.metadata.compositor.papel === 'servico' &&
        comunsB.length === 1 && semPrefixo(comunsB[0]) === 'Seg a sex, 11h às 15h' && semPrefixo(extraB) === 'Sáb e dom, 12h às 16h' &&
        porIdB.servico === 'Seg a sex, 11h às 15h' && porIdB['hora-fds'] === 'Sáb e dom, 12h às 16h' && !(estadoB.copy?.blocos ?? []).some((b) => b.id.startsWith('extra-')),
      JSON.stringify({ extra: extraB?.metadata?.compositor ?? null, comuns: comunsB.map((c) => c.id), porId: porIdB }).slice(0, 280),
    )
    if (!extraB) throw new Error('a camada extra "hora-fds" não nasceu na página — os passos 14 e 15 não teriam o que editar')
    const carrosselB = await db.socialPost.create({
      data: { projectId: PROJETO, userId: projeto.userId, postType: 'CAROUSEL', caption: `${MARCA} carrossel F01 com comum — pode apagar`, mediaUrls: [FOTO_1, slideB.url], scheduleType: 'SCHEDULED', scheduledDatetime: daqui7, status: 'DRAFT', publishType: 'REMINDER', renderStatus: 'NOT_NEEDED' },
      select: { id: true },
    })
    posts.push(carrosselB.id)
    // O post já ENTREGUE ao publicador carrega a mesma arte: nenhuma refeitura pode tocá-lo.
    const midiasCongeladas = [FOTO_2, slideB.url]
    const congelado = await db.socialPost.create({
      data: { projectId: PROJETO, userId: projeto.userId, postType: 'CAROUSEL', caption: `${MARCA} carrossel entregue — pode apagar`, mediaUrls: midiasCongeladas, scheduleType: 'SCHEDULED', scheduledDatetime: daqui7, status: 'SCHEDULED', publishType: 'DIRECT', renderStatus: 'NOT_NEEDED', laterPostId: `prova-pr10-congelado-${Date.now()}` },
      select: { id: true },
    })
    posts.push(congelado.id)

    console.log('14) PR9-F01, leitura inválida no extra COM FUNÇÃO: a equipe escreve no serviço extra uma linha que o contrato não comporta')
    const horaLonga = linhaLonga('Sáb e dom, 12h às 16h')
    const contratoAntes14 = estadoB.copy
    if (!contratoAntes14) throw new Error('o slide F01 com comum nasceu sem contrato da copy')
    const rev14 = await gravarComoOEditor(slideB.pageId, editar(estadoB.camadas, { [String(extraB.id)]: { content: horaLonga } }))
    conferir('a linha longa grava as camadas e NÃO revisa o contrato (copy-invalida)', rev14.estado === 'copy-invalida' && horaLonga.length > 300, `${rev14.estado}; ${horaLonga.length} caracteres`)
    await conferirDesfechoSemContrato({
      rotulo: 'F01 leitura inválida (extra com função)',
      pageId: slideB.pageId,
      generationId: slideB.generationId,
      postId: carrosselB.id,
      capa: FOTO_1,
      slideAntes: (await midiasDo(carrosselB.id))[1],
      tentativa: await tentar(() => recomporPaginaDefasada({ pageId: slideB.pageId, origem: 'editor' })),
      contratoAntes: contratoAntes14,
      extras: [{ id: 'hora-fds', funcao: 'servico', texto: horaLonga }],
      comuns: { servico: 'Seg a sex, 11h às 15h' },
      congelado: { id: congelado.id, midias: midiasCongeladas },
    })

    console.log('15) PR9-F01, histórico CHEIO com bloco comum: a equipe corrige o horário do fim de semana com o contrato no teto')
    const contratoCheioB = await encherHistorico(slideB.pageId)
    estadoB = await estadoDaPagina(slideB.pageId)
    const idDoExtraB = String(estadoB.camadas.find((c) => c.metadata?.compositor?.extra?.id === 'hora-fds')?.id ?? extraB.id)
    const rev15 = await gravarComoOEditor(slideB.pageId, editar(estadoB.camadas, { [idDoExtraB]: { content: 'Sáb e dom, 12h às 17h' } }))
    conferir('com o histórico cheio a edição grava as camadas e NÃO revisa o contrato (historico-cheio)', rev15.estado === 'historico-cheio', rev15.estado)
    await conferirDesfechoSemContrato({
      rotulo: 'F01 histórico cheio (com bloco comum)',
      pageId: slideB.pageId,
      generationId: slideB.generationId,
      postId: carrosselB.id,
      capa: FOTO_1,
      slideAntes: (await midiasDo(carrosselB.id))[1],
      tentativa: await tentar(() => recomporPaginaDefasada({ pageId: slideB.pageId, origem: 'editor' })),
      contratoAntes: contratoCheioB,
      extras: [{ id: 'hora-fds', funcao: 'servico', texto: 'Sáb e dom, 12h às 17h' }],
      comuns: { servico: 'Seg a sex, 11h às 15h' },
      congelado: { id: congelado.id, midias: midiasCongeladas },
    })

    await pausaParaOBlob(30_000, 'mais duas refeituras no Blob')
    console.log('16) PR10-04 pelo EXECUTOR: histórico CHEIO + uma linha que o contrato não comporta num extra — re-render como a página está, nunca SPEC_INVALIDA')
    const casos16 = [
      { rotulo: 'livre (nota), sem bloco comum', slide: slideC, postId: carrosselC.id, extraId: 'nota', funcao: 'livre', inicio: 'vale só amanhã', comuns: {} as Record<string, string>, congelado: null as { id: string; midias: string[] } | null },
      { rotulo: 'com função (hora-fds), com bloco comum', slide: slideB, postId: carrosselB.id, extraId: 'hora-fds', funcao: 'servico', inicio: 'Sáb e dom, 12h às 18h', comuns: { servico: 'Seg a sex, 11h às 15h' }, congelado: { id: congelado.id, midias: midiasCongeladas } },
    ]
    for (const c of casos16) {
      const rotulo = `16 ${c.rotulo}`
      const contratoAntes16 = await encherHistorico(c.slide.pageId)
      const antes16 = await estadoDaPagina(c.slide.pageId)
      const camada16 = antes16.camadas.find((x) => x.metadata?.compositor?.extra?.id === c.extraId)
      if (!camada16) throw new Error(`${rotulo}: a camada extra "${c.extraId}" não está na página`)
      const texto16 = linhaLonga(c.inicio)
      const rev16 = await gravarComoOEditor(c.slide.pageId, editar(antes16.camadas, { [String(camada16.id)]: { content: texto16 } }))
      conferir(`${rotulo}: a linha de ${texto16.length} caracteres passa pelo histórico CHEIO — a recusa é do histórico, não do conteúdo (historico-cheio)`, rev16.estado === 'historico-cheio' && texto16.length > 300, `${rev16.estado}; ${texto16.length} caracteres`)
      // A página como o editor a deixou, lida do banco (a mesma normalização da leitura depois do job).
      const gravadas16 = (await estadoDaPagina(c.slide.pageId)).camadas
      const slideAntes16 = (await midiasDo(c.postId))[1]
      const pedido16 = await pedirRecomposicaoDaArteCongelada([c.slide.pageId])
      const job16 = pedido16[0]?.jobId ?? null
      conferir(`${rotulo}: a edição põe a arte do slide na fila`, !!job16 && pedido16[0].generationId === c.slide.generationId, JSON.stringify(pedido16))
      if (!job16) continue
      const x16 = await executarComoOExecutor(job16, c.slide.generationId)
      const arte16 = await arteDa(c.slide.generationId)
      if (arte16.url) blobs.add(arte16.url)
      const jobDepois16 = await db.generationJob.findUnique({ where: { id: job16 }, select: { status: true, lastError: true } })
      conferir(
        `${rotulo}: o job fecha DONE, sem falha determinística (nada de SPEC_INVALIDA) e sem recusa gravada`,
        x16.desfecho === 'DONE' && !x16.erro && jobDepois16?.status === 'DONE' && !arte16.fv.recusaDaRecomposicao,
        JSON.stringify({ desfecho: x16.desfecho, erro: x16.erro?.slice(0, 160) ?? null, status: jobDepois16?.status ?? null, lastError: String(jobDepois16?.lastError ?? '').slice(0, 80), recusa: arte16.fv.recusaDaRecomposicao ?? null }),
      )
      conferir(`${rotulo}: RE-RENDERIZADA como a página está (o texto não cabe na spec: é a única saída correta)`, arte16.fv.recomposicao?.estado === 're-renderizada', String(arte16.fv.recomposicao?.estado ?? null))
      const midias16 = await midiasDo(c.postId)
      conferir(`${rotulo}: só o slide da arte trocou, pela mídia nova; a capa ficou e a contagem não diminuiu`, midias16.length === 2 && midias16[0] === FOTO_1 && !!arte16.url && midias16[1] === arte16.url && midias16[1] !== slideAntes16, JSON.stringify(midias16.map((u) => u.slice(-30))))
      const depois16 = await estadoDaPagina(c.slide.pageId)
      conferir(`${rotulo}: a página não foi regravada — camadas exatamente como o editor as deixou (os blocos comuns intactos)`, JSON.stringify(depois16.camadas) === JSON.stringify(gravadas16))
      const extra16 = depois16.camadas.find((t) => t.metadata?.compositor?.extra?.id === c.extraId)
      const ex16 = extra16?.metadata?.compositor?.extra
      const papelOk16 = c.funcao === 'livre' ? !extra16?.metadata?.compositor?.papel : extra16?.metadata?.compositor?.papel === c.funcao
      conferir(`${rotulo}: o extra "${c.extraId}" continua na página com id, função (${c.funcao}) e herança do apoio, editável, com o texto longo da equipe`, editavel(extra16) && ex16?.funcao === c.funcao && ex16?.herdaDe === 'apoio' && papelOk16 && semPrefixo(extra16) === texto16, JSON.stringify({ extra: ex16 ?? null, texto: semPrefixo(extra16).slice(0, 40) }))
      for (const [papel, texto] of Object.entries(c.comuns)) {
        const cs = depois16.camadas.filter((t) => (t.type === 'text' || t.type === 'rich-text') && t.metadata?.compositor?.papel === papel && !t.metadata?.compositor?.extra && t.visible !== false)
        conferir(`${rotulo}: o ${papel} COMUM continua comum (uma camada, sem identidade de extra) e com o texto dele`, cs.length === 1 && semPrefixo(cs[0]) === texto, JSON.stringify(cs.map((x) => [x.id, semPrefixo(x).slice(0, 40)])))
      }
      conferir(`${rotulo}: o contrato da página ficou INTOCADO`, JSON.stringify(depois16.copy) === JSON.stringify(contratoAntes16), `${depois16.copy?.revisoes.length ?? 'sem contrato'} revisões`)
      if (c.congelado) {
        const m16 = await midiasDo(c.congelado.id)
        conferir(`${rotulo}: o post já entregue ao publicador (congelado) ficou intocado`, JSON.stringify(m16) === JSON.stringify(c.congelado.midias), JSON.stringify(m16.map((u) => u.slice(-30))))
      }
    }
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
