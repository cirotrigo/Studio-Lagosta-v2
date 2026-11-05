/**
 * CP-V2d — o painel "Elementos" no Chromium, com o `TemplateEditorShell` REAL (H1), no computador (1280×800) e no
 * celular (375×812). Rede falsa (`servidor.ts`), sem banco, Clerk, Blob, Vercel ou produção.
 *
 *   npx playwright test -c tests/harness/cp-v2d/playwright.config.ts
 *   V2D_VARIANTE=base|sem-bloqueio|d5-solto npx playwright test -c tests/harness/cp-v2d/playwright.config.ts
 *
 * Desfazer: só o `undo()`/`redo()` do CONTEXTO real, pela sonda (`window.__v2d`). O atalho Ctrl/⌘+Z mora no stage,
 * que é falso aqui: ele NÃO é provado por este harness. Camadas e desfazer se medem no contexto; o HTTP prova só a
 * persistência (PATCH classificados `camadas`/`miniatura`/`outra`, sem contagem fixa).
 *
 * Asserções nomeadas (`V2D-…`): é por elas que um controle negativo prova sensibilidade. Antes de cada uma, o ponto de
 * controle (`pontoDeControle`): página montada, sem `pageerror`, sonda viva, painel visível, nenhuma URL externa.
 */
import { test, expect, type Page as Aba } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import type { TemplateDto } from '@/hooks/use-template'
import type { Layer } from '@/types/template'
import { MASCARAS_DE_IMAGEM, SHAPES_LIBRARY } from '@/lib/assets/shapes-library'
import { empacotar, type Variante } from './bundle'
import { ORIGEM, ServidorFalso, type PaginaGravada, type Projeto, type Resposta } from './servidor'

const VARIANTE = (process.env.V2D_VARIANTE ?? 'v2d') as Variante
const CAPTURAS = process.env.V2D_CAPTURAS
let pasta = ''
let pastaOutros = ''
let SELO: Buffer
let FOGO: Buffer

test.beforeAll(async () => {
  pasta = mkdtempSync(path.join(tmpdir(), 'cp-v2d-'))
  await empacotar(pasta, VARIANTE)
  if (VARIANTE === 'v2d') {
    pastaOutros = path.join(pasta, 'outros')
    await empacotar(pastaOutros, 'v2d', { outros: true })
  }
  SELO = await sharp({ create: { width: 400, height: 200, channels: 4, background: '#e4572e' } }).png().toBuffer()
  FOGO = await sharp({ create: { width: 100, height: 100, channels: 4, background: '#0b1f3a' } }).png().toBuffer()
})
/** Falhou: guarda o texto da página e os erros, para diagnóstico sem nova rodada. */
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return
  const texto = await page.locator('body').innerText().catch(() => '(sem body)')
  await info.attach('texto-da-pagina', { body: texto, contentType: 'text/plain' })
})
test.afterAll(() => {
  if (pasta) rmSync(pasta, { recursive: true, force: true })
})

// ── dados falsos ─────────────────────────────────────────────────────────────

const json = (corpo: unknown): Resposta => ({ tipo: 'json', corpo })
const PALETA_8 = [
  { id: 1, name: 'Azul noite', hexCode: '#0B1F3A', projectId: 8 },
  { id: 2, name: 'Laranja', hexCode: '#E4572E', projectId: 8 },
  { id: 3, name: 'Creme', hexCode: '#F7F1E3', projectId: 8 },
]
const projeto = (id: number, assinatura: unknown) => ({ id, name: `Projeto ${id}`, description: null, status: 'ACTIVE', logoUrl: null, assinatura })
const ELEMENTOS_8 = [
  { id: 11, name: 'Selo Lagosta', fileUrl: `${ORIGEM}/imagens/selo.png`, category: null, projectId: 8 },
  { id: 12, name: 'Ícone Fogo', fileUrl: `${ORIGEM}/imagens/fogo.png`, category: 'icone', projectId: 8 },
]
const marca8 = (extra: Partial<Projeto> = {}): Projeto => ({
  cores: json(PALETA_8),
  projeto: json(projeto(8, { fundo: '#0B1F3A', destaque: { fill: '#E4572E', alternativa: '#F3A712' } })),
  elementos: json(ELEMENTOS_8),
  ...extra,
})
const marca9 = (): Projeto => ({
  cores: json([{ id: 9, name: 'Verde', hexCode: '#2A9D8F', projectId: 9 }]),
  projeto: json(projeto(9, { fundo: '#1D3557', destaque: { fill: '#264653' } })),
  elementos: json([]),
})
/** Cores por papel, escritas à mão (não calculadas pelo resolvedor): é contra elas que a camada é conferida. */
const COR = { texto8: '#0b1f3a', destaque8: '#e4572e', destaque9: '#264653', padrao: '#111111' }

const TEXTO: Layer = { id: 'texto-1', type: 'text', name: 'Título', visible: true, locked: false, order: 0, position: { x: 100, y: 300 }, size: { width: 880, height: 120 }, content: 'Sexta', style: { fontSize: 64, color: '#111111' } } as unknown as Layer
const pagina = (templateId: number): PaginaGravada => ({
  id: `p${templateId}`, name: 'Página 1', width: 1080, height: 1920, layers: [TEXTO], background: '#ffffff', order: 0,
  // com miniatura: a carga não gera uma (a miniatura de carga fica fora da linha de base de qualquer forma)
  thumbnail: 'data:image/png;base64,iVBORw0KGgo=', templateId, isTemplate: false, templateName: null,
})
const template = (id: number, projectId: number): TemplateDto => ({
  id, name: `Modelo ${id}`, type: 'STORY', dimensions: '1080x1920', projectId, dynamicFields: [],
  designData: { canvas: { width: 1080, height: 1920, backgroundColor: '#ffffff' }, layers: [] },
  createdAt: '2026-10-23T00:00:00Z', updatedAt: '2026-10-23T00:00:00Z', createdBy: 'harness',
} as unknown as TemplateDto)
const T8 = template(101, 8)
const T9 = template(102, 9)

/** Os 10 itens, com canal e papel ESCRITOS À MÃO (preflight §5). */
const DEZ: Array<{ id: string; canal: 'fill' | 'strokeColor'; papel: 'texto' | 'destaque'; travado?: true; fino?: true }> = [
  { id: 'fio-fino', canal: 'fill', papel: 'texto', fino: true },
  { id: 'moldura-fina', canal: 'strokeColor', papel: 'texto' },
  { id: 'pilula-contorno', canal: 'strokeColor', papel: 'texto' },
  { id: 'spark-4', canal: 'fill', papel: 'destaque', travado: true },
  { id: 'onda-suave', canal: 'strokeColor', papel: 'destaque', fino: true },
  { id: 'sublinhado-suave', canal: 'strokeColor', papel: 'destaque', fino: true },
  { id: 'pontos', canal: 'fill', papel: 'texto', travado: true },
  { id: 'moldura-aberta', canal: 'strokeColor', papel: 'texto', fino: true },
  { id: 'cantoneiras', canal: 'strokeColor', papel: 'destaque', fino: true },
  { id: 'colchete', canal: 'strokeColor', papel: 'texto', fino: true },
]

// ── montagem, ponto de controle e quiescência ───────────────────────────────

interface Contexto {
  aba: Aba
  srv: ServidorFalso
  erros: string[]
  celular: boolean
}

async function montar(aba: Aba, projetos: Record<number, Projeto>, pastaDoBundle = pasta): Promise<Contexto> {
  const srv = new ServidorFalso()
  for (const [id, p] of Object.entries(projetos)) srv.projetos.set(Number(id), p)
  srv.paginas.set(101, [pagina(101)])
  srv.paginas.set(102, [pagina(102)])
  srv.servirArquivo('/', 'text/html', Buffer.from('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/v2d.css"><body><div id="app"></div><script src="/v2d.js"></script>'))
  srv.servirArquivo('/v2d.js', 'application/javascript', path.join(pastaDoBundle, 'v2d.js'))
  srv.servirArquivo('/v2d.css', 'text/css', path.join(pastaDoBundle, 'v2d.css'))
  srv.servirArquivo('/imagens/selo.png', 'image/png', SELO)
  srv.servirArquivo('/imagens/fogo.png', 'image/png', FOGO)
  const erros: string[] = []
  aba.on('pageerror', (e) => erros.push(String(e)))
  await srv.ligar(aba)
  await aba.goto(`${ORIGEM}/`)
  await aba.waitForFunction(() => typeof window.__v2dAbrir === 'function')
  const celular = (aba.viewportSize()?.width ?? 1280) < 768
  return { aba, srv, erros, celular }
}

async function abrirTemplate(c: Contexto, t: TemplateDto) {
  await c.aba.evaluate((tt) => window.__v2dAbrir(tt), t as unknown as TemplateDto)
  await c.aba.waitForFunction((pid) => window.__v2d?.projectId() === pid, t.projectId)
  await assentar(c)
}

const doisQuadros = (aba: Aba) => aba.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))

/** Carga assentada: páginas lidas, dois quadros, e uma janela de 800 ms + 2 quadros sem PATCH novo (com teto). */
async function assentar(c: Contexto) {
  await c.aba.waitForFunction(() => !!window.__v2d)
  for (let tentativa = 0; tentativa < 15; tentativa++) {
    const n = c.srv.patches.length
    await doisQuadros(c.aba)
    await c.aba.waitForTimeout(850)
    await doisQuadros(c.aba)
    if (c.srv.patches.length === n) return
  }
  throw new Error('a página não assentou (PATCH contínuo)')
}

interface Linha {
  layers: Layer[]
  canUndo: boolean
  patches: number
}
async function linhaDeBase(c: Contexto): Promise<Linha> {
  await assentar(c)
  return {
    layers: (await c.aba.evaluate(() => window.__v2d!.design().layers)) as Layer[],
    canUndo: await c.aba.evaluate(() => window.__v2d!.canUndo()),
    patches: c.srv.patches.length,
  }
}

const painel = (aba: Aba) => aba.getByPlaceholder(/^Buscar /).locator('xpath=ancestor::div[contains(@class,"min-h-[400px]")][1]')

async function pontoDeControle(c: Contexto) {
  expect(c.erros, 'PONTO-DE-CONTROLE: pageerror').toEqual([])
  expect(await c.aba.evaluate(() => !!window.__v2d), 'PONTO-DE-CONTROLE: sonda').toBe(true)
  await expect(painel(c.aba), 'PONTO-DE-CONTROLE: painel visível').toBeVisible()
  expect(c.srv.externas, 'PONTO-DE-CONTROLE: URL externa').toEqual([])
}

/** Abre o painel de formas. Na variante `base` (antes do V2d) ele ainda se chama "Formas"; as asserções não mudam. */
async function abrirPainel(c: Contexto) {
  const nome = VARIANTE === 'base' ? 'Formas' : 'Elementos'
  if (c.celular) {
    if (!(await c.aba.getByRole('dialog').isVisible())) await c.aba.getByRole('button', { name: 'Abrir ferramentas' }).click()
    await c.aba.getByRole('dialog').getByRole('button', { name: nome, exact: true }).click()
  } else {
    await c.aba.locator(`button[title="${nome}"]`).click()
  }
  await expect(painel(c.aba)).toBeVisible()
}

/** O item do catálogo. Na variante `base` não há `data-elemento`: acha pelo título (o rótulo), que existe nas duas. */
const botao = (c: Contexto, id: string) =>
  VARIANTE === 'base'
    ? painel(c.aba).locator(`button[title="${SHAPES_LIBRARY.find((s) => s.id === id)!.label}"]`)
    : c.aba.locator(`[data-elemento="${id}"]`)
const titulosDosItens = (c: Contexto) => painel(c.aba).locator('button[title]').evaluateAll((bs) => bs.map((b) => b.getAttribute('title')))

function hexDe(cor: unknown): string | null {
  if (typeof cor !== 'string') return null
  if (/^#[0-9a-f]{6}$/i.test(cor)) return cor.toLowerCase()
  const m = cor.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d*\.?\d+))?\)$/)
  if (!m || (m[4] !== undefined && Number(m[4]) !== 1)) return null
  return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`
}

async function capturar(c: Contexto, nome: string) {
  if (!CAPTURAS) return
  mkdirSync(CAPTURAS, { recursive: true })
  await c.aba.screenshot({ path: path.join(CAPTURAS, `${c.celular ? 'celular' : 'desktop'}-${nome}.png`) })
}

async function inserirEEsperar(c: Contexto, base: Linha, clique: () => Promise<void>): Promise<Layer> {
  await clique()
  await c.aba.waitForFunction((n) => window.__v2d!.design().layers.length === n, base.layers.length + 1)
  const layers = (await c.aba.evaluate(() => window.__v2d!.design().layers)) as Layer[]
  return layers.find((l) => !base.layers.some((b) => b.id === l.id))!
}

/** O ciclo do parecer: +1 camada e canUndo; 1 undo → linha de base e canUndo=false; redo → a camada; gravação; reload. */
async function cicloDeDesfazerEGravar(c: Contexto, base: Linha, nova: Layer) {
  const depois = (await c.aba.evaluate(() => window.__v2d!.design().layers)) as Layer[]
  expect(depois.filter((l) => !base.layers.some((b) => b.id === l.id)), 'V2D-UMA-CAMADA').toHaveLength(1)
  expect(depois.filter((l) => base.layers.some((b) => b.id === l.id)), 'V2D-OUTRAS-CAMADAS-INTACTAS').toEqual(base.layers)
  expect(await c.aba.evaluate(() => window.__v2d!.selecionadas()), 'V2D-SELECIONADA').toEqual([nova.id])
  expect(await c.aba.evaluate(() => window.__v2d!.canUndo()), 'V2D-CANUNDO-DEPOIS').toBe(true)

  await c.aba.evaluate(() => window.__v2d!.undo())
  await doisQuadros(c.aba)
  expect(await c.aba.evaluate(() => window.__v2d!.design().layers), 'V2D-UNDO-VOLTA-A-BASE').toEqual(base.layers)
  expect(await c.aba.evaluate(() => window.__v2d!.canUndo()), 'V2D-UNDO-ESVAZIA').toBe(false)

  await c.aba.evaluate(() => window.__v2d!.redo())
  await doisQuadros(c.aba)
  expect(await c.aba.evaluate(() => window.__v2d!.design().layers), 'V2D-REDO-RESTAURA').toEqual(depois)

  await assentar(c)
  const camadas = c.srv.patchesDesde(base.patches, 'camadas')
  expect(camadas.length, 'V2D-PATCH-CAMADAS-EXISTE').toBeGreaterThan(0)
  expect(camadas.map((p) => p.status), 'V2D-PATCH-CAMADAS-200').toEqual(camadas.map(() => 200))
  expect(c.srv.patches.filter((p) => p.status === 422), 'V2D-ZERO-422').toEqual([])
  expect(c.srv.patchesDesde(base.patches, 'outra'), 'V2D-SEM-PATCH-OUTRA').toEqual([])
  const ultimo = camadas.at(-1)!.layers as Layer[]
  const gravada = ultimo.find((l) => l.id === nova.id)!
  expect(gravada, 'V2D-PAYLOAD-TEM-A-CAMADA').toBeTruthy()
  expect(gravada.style, 'V2D-PAYLOAD-ESTILO').toEqual(depois.find((l) => l.id === nova.id)!.style)
  expect(ultimo.map((l) => l.id).sort(), 'V2D-PAYLOAD-IDS').toEqual(depois.map((l) => l.id).sort())

  await c.aba.reload()
  await c.aba.waitForFunction(() => typeof window.__v2dAbrir === 'function')
  await abrirTemplate(c, T8)
  const recarregadas = (await c.aba.evaluate(() => window.__v2d!.design().layers)) as Layer[]
  const voltou = recarregadas.find((l) => l.id === nova.id)
  expect(voltou?.style, 'V2D-RELOAD-ESTILO').toEqual(gravada.style)
  expect(voltou?.size, 'V2D-RELOAD-TAMANHO').toEqual(gravada.size)
  expect(voltou?.position, 'V2D-RELOAD-POSICAO').toEqual(gravada.position)
  expect(recarregadas.map((l) => l.id).sort(), 'V2D-RELOAD-IDS').toEqual(ultimo.map((l) => l.id).sort())
  expect(c.srv.externas, 'V2D-ZERO-EXTERNAS').toEqual([])
}

// ── rail, categorias e busca ─────────────────────────────────────────────────

test('rail único: "Elementos" abre o painel e não há "Formas"', async ({ page }) => {
  const c = await montar(page, { 8: marca8() })
  await abrirTemplate(c, T8)
  let formas: number
  if (c.celular) {
    await page.getByRole('button', { name: 'Abrir ferramentas' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    formas = await page.getByRole('dialog').getByRole('button', { name: 'Formas', exact: true }).count()
  } else {
    formas = await page.locator('button[title="Formas"]').count()
  }
  await abrirPainel(c)
  await pontoDeControle(c)
  await capturar(c, 'painel')
  expect.soft(formas, 'V2D-RAIL-SEM-FORMAS').toBe(0)
  const titulo = c.celular ? null : await page.locator('aside h2').first().textContent()
  if (!c.celular) expect.soft(titulo?.trim(), 'V2D-TITULO-ELEMENTOS').toBe('Elementos')
})

test('categorias: as 7 do catálogo e a Marca, na ordem; 46 itens; sparkle oculto', async ({ page }) => {
  const c = await montar(page, { 8: marca8() })
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await pontoDeControle(c)
  await page.waitForFunction(() => !document.querySelector('[data-secao="marca"] .animate-spin'))
  const rotulos = await painel(page).locator('p.uppercase').evaluateAll((ps) => ps.map((p) => p.textContent?.trim()))
  expect.soft(rotulos, 'V2D-CATEGORIAS-8').toEqual(['Linhas', 'Formas', 'Orgânicos', 'Setas', 'Destaques', 'Editorial', 'Ornamentos', 'Marca'])
  const titulos = (await titulosDosItens(c)).filter((t) => !ELEMENTOS_8.some((e) => e.name === t))
  expect.soft(titulos.filter((t) => t === 'Brilho'), 'V2D-SPARKLE-OCULTO').toEqual([])
  expect.soft(titulos, 'V2D-46-ITENS').toHaveLength(46)
})

test('busca PT/EN sem acento', async ({ page }) => {
  const c = await montar(page, { 8: marca8() })
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await pontoDeControle(c)
  const buscar = async (termo: string) => {
    await page.getByPlaceholder(/^Buscar /).fill(termo)
    await doisQuadros(page)
    return titulosDosItens(c)
  }
  expect.soft(await buscar('circulo'), 'V2D-BUSCA-CIRCULO').toEqual(['Círculo', 'Semicírculo', 'Anel'])
  expect.soft(await buscar('círculo'), 'V2D-BUSCA-CIRCULO-ACENTO').toEqual(['Círculo', 'Semicírculo', 'Anel'])
  expect.soft(await buscar('circle'), 'V2D-BUSCA-CIRCLE').toEqual(['Círculo', 'Semicírculo'])
  expect.soft(await buscar('wave'), 'V2D-BUSCA-WAVE').toEqual(['Onda suave'])
  expect.soft(await buscar('onda'), 'V2D-BUSCA-ONDA').toEqual(['Retângulo Arredondado', 'Onda suave'])
  expect.soft(await buscar('sparkle'), 'V2D-BUSCA-SPARKLE').toEqual(['Brilho de 4 pontas'])
  // "selo" também é palavra-chave da Explosão (legado): catálogo + Marca
  expect.soft(await buscar('selo'), 'V2D-BUSCA-MARCA').toEqual(['Explosão', 'Selo Lagosta'])
  expect.soft(await buscar('xyz'), 'V2D-BUSCA-NADA').toEqual([])
  expect.soft(await page.getByText('Nenhum elemento encontrado.').count(), 'V2D-BUSCA-NADA-TEXTO').toBe(1)
  await capturar(c, 'busca-vazia')
  expect(await buscar(''), 'V2D-BUSCA-LIMPA').toHaveLength(48)
})

test('as 26 máscaras de imagem não mudam (ids e paths)', async ({ page }) => {
  const c = await montar(page, { 8: marca8() })
  await abrirTemplate(c, T8)
  const mascaras = await page.evaluate(() => window.__v2dMascaras)
  expect(mascaras, 'V2D-MASCARAS-26').toEqual(MASCARAS_DE_IMAGEM.map((m) => [m.id, m.pathData]))
  expect(mascaras.map((m) => m[0]), 'V2D-MASCARAS-IDS').toEqual([
    'diamond', 'pentagon', 'hexagon', 'octagon', 'trapezoid', 'parallelogram', 'semicircle', 'ring', 'cross',
    'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'chevron-right',
    'heart', 'sparkle', 'burst', 'bolt', 'drop', 'pin', 'speech', 'cloud', 'blob', 'shield', 'tag', 'banner',
  ])
})

// ── os 10 itens ──────────────────────────────────────────────────────────────

const areas: Record<string, unknown> = {}
for (const item of DEZ) {
  test(`item ${item.id}: centrado, selecionado, 1 camada, 1 desfazer, cor da marca, proveniência, PATCH e reload`, async ({ page }, info) => {
    const c = await montar(page, { 8: marca8() })
    await abrirTemplate(c, T8)
    await abrirPainel(c)
    await pontoDeControle(c)
    await expect(botao(c, item.id)).toBeEnabled()
    const base = await linhaDeBase(c)
    expect(base.canUndo, 'V2D-BASE-SEM-HISTORICO').toBe(false)
    const nova = await inserirEEsperar(c, base, () => botao(c, item.id).click())
    if (c.celular) await expect(page.getByRole('dialog'), 'V2D-DRAWER-FECHA').toBeHidden()
    await capturar(c, `item-${item.id}`)

    const def = SHAPES_LIBRARY.find((s) => s.id === item.id)!
    const st = nova.style ?? {}
    const esperado = item.papel === 'texto' ? COR.texto8 : COR.destaque8
    expect([nova.type, st.shapeType], 'V2D-TIPO').toEqual(['shape', def.shapeType])
    expect(hexDe(st[item.canal]), 'V2D-COR-DA-MARCA').toBe(esperado)
    if (item.canal === 'strokeColor') expect(st.fill, 'V2D-SEM-PREENCHIMENTO').toBe('transparent')
    expect(JSON.stringify(st).toLowerCase(), 'V2D-SEM-VITRINE').not.toContain('#374151')
    expect(JSON.stringify(st), 'V2D-SEM-VITRINE-RGBA').not.toContain('55, 65, 81')
    expect(st.vetor, 'V2D-PROVENIENCIA').toEqual({ asset: { id: item.id, versao: 1 }, papeis: { [item.canal === 'fill' ? 'preenchimento' : 'contorno']: item.papel } })
    expect(st.manterProporcao, 'V2D-PROPORCAO').toBe(item.travado ? true : undefined)
    if (item.id === 'pilula-contorno') expect(st.border, 'V2D-PILULA').toEqual({ width: 0, color: 'transparent', radius: 9999 })
    const cx = nova.position.x + nova.size.width / 2
    const cy = nova.position.y + nova.size.height / 2
    expect([Math.abs(cx - 540) <= 1, Math.abs(cy - 960) <= 1], 'V2D-CENTRADA').toEqual([true, true])
    if (item.fino) areas[`${c.celular ? 'celular' : 'desktop'}:${item.id}`] = await page.evaluate((l) => window.__v2dAreaDeClique(l), nova)

    await cicloDeDesfazerEGravar(c, base, nova)
    if (item.fino) info.annotations.push({ type: 'area-de-clique', description: JSON.stringify(areas[`${c.celular ? 'celular' : 'desktop'}:${item.id}`]) })
  })
}

// ── dados da marca ───────────────────────────────────────────────────────────

test('lentidão e clique bloqueado: 0 camada, 0 desfazer, 0 PATCH de camadas; chegada tardia libera', async ({ page }) => {
  const c = await montar(page, { 8: marca8() })
  c.srv.segurar('cores:8')
  c.srv.segurar('projeto:8')
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await pontoDeControle(c)
  await expect(page.getByText('Carregando as cores da marca…')).toBeVisible()
  await capturar(c, 'carregando')
  const base = await linhaDeBase(c)
  expect(base.canUndo, 'V2D-BASE-SEM-HISTORICO').toBe(false)
  await botao(c, 'spark-4').click({ force: true })
  // se o primeiro clique tivesse inserido (controle `sem-bloqueio`), o drawer do celular fecharia e o botão some
  if (await botao(c, 'moldura-fina').count()) await botao(c, 'moldura-fina').click({ force: true })
  await assentar(c)
  expect.soft(await page.evaluate(() => window.__v2d!.design().layers), 'V2D-BLOQUEIO-0-CAMADA').toEqual(base.layers)
  expect.soft(await page.evaluate(() => window.__v2d!.canUndo()), 'V2D-BLOQUEIO-0-DESFAZER').toBe(false)
  expect.soft(c.srv.patchesDesde(base.patches, 'camadas'), 'V2D-BLOQUEIO-0-PATCH').toEqual([])
  expect.soft(c.srv.patchesDesde(base.patches, 'outra'), 'V2D-BLOQUEIO-0-OUTRA').toEqual([])
  if (c.celular) await expect(page.getByRole('dialog'), 'V2D-BLOQUEIO-DRAWER-ABERTO').toBeVisible()
  await expect(page.locator('[data-aviso="sem-cores"]'), 'V2D-D5-AUSENTE-CARREGANDO').toHaveCount(0)

  // bloqueio já reprovado (controle `sem-bloqueio`): a chegada tardia mediria sobre camadas a mais
  if (test.info().errors.length > 0) return
  c.srv.soltar('cores:8')
  c.srv.soltar('projeto:8')
  await expect(botao(c, 'spark-4')).toBeEnabled()
  const nova = await inserirEEsperar(c, base, () => botao(c, 'spark-4').click())
  expect(hexDe(nova.style?.fill), 'V2D-CHEGADA-TARDIA-COR').toBe(COR.destaque8)
  expect(await page.evaluate(() => window.__v2d!.design().layers.length), 'V2D-CHEGADA-TARDIA-1').toBe(base.layers.length + 1)
})

test('500 na paleta: erro e "Tentar de novo" refaz só a paleta; depois libera', async ({ page }) => {
  const c = await montar(page, { 8: marca8({ cores: { tipo: '500' } }) })
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await pontoDeControle(c)
  await expect(page.getByText('Não foi possível carregar as cores da marca.', { exact: false })).toBeVisible({ timeout: 15_000 })
  await capturar(c, 'erro-500')
  await expect(botao(c, 'spark-4'), 'V2D-500-BLOQUEADO').toBeDisabled()
  await expect(page.locator('[data-aviso="sem-cores"]'), 'V2D-D5-AUSENTE-500').toHaveCount(0)
  const leituras = { cores: c.srv.leituras.get('cores:8') ?? 0, projeto: c.srv.leituras.get('projeto:8') ?? 0 }
  c.srv.projetos.set(8, marca8())
  await page.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(botao(c, 'spark-4')).toBeEnabled()
  expect((c.srv.leituras.get('cores:8') ?? 0) > leituras.cores, 'V2D-RETRY-REFAZ-PALETA').toBe(true)
  expect(c.srv.leituras.get('projeto:8') ?? 0, 'V2D-RETRY-NAO-REFAZ-PROJETO').toBe(leituras.projeto)
  const base = await linhaDeBase(c)
  const nova = await inserirEEsperar(c, base, () => botao(c, 'spark-4').click())
  expect(hexDe(nova.style?.fill), 'V2D-RETRY-COR').toBe(COR.destaque8)
})

test('HTML 200 na paleta é erro, nunca "marca sem cores"', async ({ page }) => {
  const c = await montar(page, { 8: marca8({ cores: { tipo: 'html' } }) })
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await pontoDeControle(c)
  await expect(page.getByText('Não foi possível carregar as cores da marca.', { exact: false })).toBeVisible({ timeout: 15_000 })
  await expect(botao(c, 'spark-4'), 'V2D-HTML200-BLOQUEADO').toBeDisabled()
  expect.soft(await page.locator('[data-aviso="sem-cores"]').count(), 'V2D-D5-AUSENTE-HTML200').toBe(0)
})

test('projeto sem a chave "assinatura" é erro; "Tentar de novo" refaz só o projeto', async ({ page }) => {
  const semChave = { id: 8, name: 'Projeto 8', description: null, status: 'ACTIVE', logoUrl: null }
  const c = await montar(page, { 8: marca8({ projeto: json(semChave) }) })
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await pontoDeControle(c)
  await expect(page.getByText('Não foi possível carregar as cores da marca.', { exact: false })).toBeVisible({ timeout: 15_000 })
  await expect(botao(c, 'spark-4'), 'V2D-SEM-CHAVE-BLOQUEADO').toBeDisabled()
  expect(await page.locator('[data-aviso="sem-cores"]').count(), 'V2D-D5-AUSENTE-SEM-CHAVE').toBe(0)
  const leituras = { cores: c.srv.leituras.get('cores:8') ?? 0, projeto: c.srv.leituras.get('projeto:8') ?? 0 }
  c.srv.projetos.set(8, marca8())
  await page.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(botao(c, 'spark-4')).toBeEnabled()
  expect(c.srv.leituras.get('cores:8') ?? 0, 'V2D-RETRY-NAO-REFAZ-PALETA').toBe(leituras.cores)
  expect((c.srv.leituras.get('projeto:8') ?? 0) > leituras.projeto, 'V2D-RETRY-REFAZ-PROJETO').toBe(true)
})

test('entrada da paleta sem hexCode é erro', async ({ page }) => {
  const c = await montar(page, { 8: marca8({ cores: json([{ id: 1, name: 'Sem código', projectId: 8 }]) }) })
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await pontoDeControle(c)
  await expect(page.getByText('Não foi possível carregar as cores da marca.', { exact: false })).toBeVisible({ timeout: 15_000 })
  expect(await page.locator('[data-aviso="sem-cores"]').count(), 'V2D-D5-AUSENTE-SEM-HEX').toBe(0)
  await expect(botao(c, 'spark-4'), 'V2D-SEM-HEX-BLOQUEADO').toBeDisabled()
})

test('vazio confirmado: aviso D5 e inserção no padrão', async ({ page }) => {
  const c = await montar(page, { 8: marca8({ cores: json([]), projeto: json(projeto(8, null)) }) })
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await pontoDeControle(c)
  await expect(botao(c, 'spark-4')).toBeEnabled()
  await capturar(c, 'd5-vazio')
  expect.soft(await page.locator('[data-aviso="sem-cores"]').count(), 'V2D-D5-VISIVEL').toBe(1)
  const base = await linhaDeBase(c)
  const nova = await inserirEEsperar(c, base, () => botao(c, 'spark-4').click())
  expect(hexDe(nova.style?.fill), 'V2D-D5-COR-PADRAO').toBe(COR.padrao)
})

test('ausência por entradas ilegíveis: hex inválidos e assinatura {} também dão o aviso D5', async ({ page }) => {
  const ilegiveis = [{ id: 1, name: 'x', hexCode: 'azul', projectId: 8 }, { id: 2, name: 'y', hexCode: '#zz', projectId: 8 }]
  const c = await montar(page, { 8: marca8({ cores: json(ilegiveis), projeto: json(projeto(8, {})) }) })
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await pontoDeControle(c)
  await expect(botao(c, 'spark-4')).toBeEnabled()
  expect.soft(await page.locator('[data-aviso="sem-cores"]').count(), 'V2D-D5-VISIVEL-ILEGIVEL').toBe(1)
})

test('ausência parcial (paleta vazia, assinatura com fundo): sem D5; cores pelo resolvedor', async ({ page }) => {
  const c = await montar(page, { 8: marca8({ cores: json([]), projeto: json(projeto(8, { fundo: '#0B1F3A' })) }) })
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await pontoDeControle(c)
  await expect(botao(c, 'spark-4')).toBeEnabled()
  expect.soft(await page.locator('[data-aviso="sem-cores"]').count(), 'V2D-D5-AUSENTE-PARCIAL').toBe(0)
  const base = await linhaDeBase(c)
  const nova = await inserirEEsperar(c, base, () => botao(c, 'spark-4').click())
  // destaque sem dado cai no escuro, que vem do fundo da assinatura
  expect(hexDe(nova.style?.fill), 'V2D-PARCIAL-COR').toBe(COR.texto8)
})

test('troca de projeto: sem cache bloqueia até o projeto novo; com cache usa o do projeto atual', async ({ page }) => {
  const c = await montar(page, { 8: marca8(), 9: marca9() })
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await expect(botao(c, 'spark-4')).toBeEnabled()
  c.srv.segurar('cores:9')
  await abrirTemplate(c, T9)
  await abrirPainel(c)
  await pontoDeControle(c)
  await expect(page.getByText('Carregando as cores da marca…')).toBeVisible()
  const base9 = await linhaDeBase(c)
  await botao(c, 'spark-4').click({ force: true })
  await assentar(c)
  expect(await page.evaluate(() => window.__v2d!.design().layers), 'V2D-TROCA-BLOQUEIO').toEqual(base9.layers)
  c.srv.soltar('cores:9')
  await expect(botao(c, 'spark-4')).toBeEnabled()
  const nova9 = await inserirEEsperar(c, base9, () => botao(c, 'spark-4').click())
  expect(hexDe(nova9.style?.fill), 'V2D-TROCA-COR-DO-9').toBe(COR.destaque9)

  const leituras8 = c.srv.leituras.get('cores:8') ?? 0
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await expect(botao(c, 'spark-4'), 'V2D-CACHE-SEM-BLOQUEIO').toBeEnabled()
  const base8 = await linhaDeBase(c)
  const nova8 = await inserirEEsperar(c, base8, () => botao(c, 'spark-4').click())
  expect(hexDe(nova8.style?.fill), 'V2D-CACHE-COR-DO-8').toBe(COR.destaque8)
  expect(c.srv.leituras.get('cores:8') ?? 0, 'V2D-CACHE-SEM-RELEITURA').toBe(leituras8)
})

// ── Marca ────────────────────────────────────────────────────────────────────

test('Marca: lista pelo hook e insere imagem; 1 desfazer, PATCH e reload; nenhum POST/DELETE', async ({ page }) => {
  const c = await montar(page, { 8: marca8() })
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await pontoDeControle(c)
  await expect(page.locator('[data-marca="11"]')).toBeVisible()
  await capturar(c, 'marca')
  const base = await linhaDeBase(c)
  expect(base.canUndo, 'V2D-BASE-SEM-HISTORICO').toBe(false)
  const nova = await inserirEEsperar(c, base, () => page.locator('[data-marca="11"]').click())
  expect([nova.type, nova.fileUrl, nova.size], 'V2D-MARCA-IMAGEM').toEqual(['image', ELEMENTOS_8[0].fileUrl, { width: 200, height: 100 }])
  expect([nova.position.x + 100, nova.position.y + 50], 'V2D-MARCA-CENTRADA').toEqual([540, 960])
  if (c.celular) await expect(page.getByRole('dialog'), 'V2D-DRAWER-FECHA').toBeHidden()
  await cicloDeDesfazerEGravar(c, base, nova)
  // inserir não envia nem apaga elemento (o servidor do V2e registra POST/DELETE de elementos em `escritas`)
  expect([...c.srv.escritas, ...c.srv.desconhecidas.filter((d) => d.includes('/elements'))], 'V2D-MARCA-SEM-ESCRITA').toEqual([])
})

test('Marca: 500 com "Tentar de novo"; vazia; HTML 200 é ERRO (o limite do hook fechado no V2e)', async ({ page }) => {
  const c = await montar(page, { 8: marca8({ elementos: { tipo: '500' } }) })
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await pontoDeControle(c)
  await expect(page.locator('[data-aviso="marca-erro"]'), 'V2D-MARCA-ERRO').toBeVisible({ timeout: 15_000 })
  c.srv.projetos.set(8, marca8())
  await page.locator('[data-aviso="marca-erro"]').getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(page.locator('[data-marca="11"]'), 'V2D-MARCA-RETRY').toBeVisible()

  const v = await montar(await page.context().newPage(), { 8: marca8({ elementos: json([]) }) })
  await abrirTemplate(v, T8)
  await abrirPainel(v)
  await expect(v.aba.locator('[data-aviso="marca-vazia"]'), 'V2D-MARCA-VAZIA').toBeVisible()

  const h = await montar(await page.context().newPage(), { 8: marca8({ elementos: { tipo: 'html' } }) })
  await abrirTemplate(h, T8)
  await abrirPainel(h)
  // CP-V2e: o hook é estrito; HTML 200 (redirect do login) é erro com "Tentar de novo", nunca "vazia"
  await expect(h.aba.locator('[data-aviso="marca-erro"]'), 'V2D-MARCA-HTML200-LIMITE').toBeVisible({ timeout: 15_000 })
  expect(await h.aba.locator('[data-aviso="marca-vazia"]').count(), 'V2D-MARCA-HTML200-LIMITE').toBe(0)
})

test('busca com a Marca lenta: a seção segue "carregando" e não há falso vazio; o vazio só vem depois do sucesso', async ({ page }) => {
  const c = await montar(page, { 8: marca8() })
  c.srv.segurar('elementos:8')
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await pontoDeControle(c)
  await page.getByPlaceholder(/^Buscar /).fill('xyz')
  await doisQuadros(page)
  await capturar(c, 'busca-marca-carregando')
  expect.soft(await page.locator('[data-secao="marca"]').getByText('Carregando os elementos da marca…').count(), 'V2D-BUSCA-MARCA-CARREGANDO').toBe(1)
  expect.soft(await page.getByText('Nenhum elemento encontrado.').count(), 'V2D-BUSCA-SEM-FALSO-VAZIO-LENTO').toBe(0)
  c.srv.soltar('elementos:8')
  await expect(page.locator('[data-secao="marca"]')).toHaveCount(0)
  expect.soft(await page.getByText('Nenhum elemento encontrado.').count(), 'V2D-BUSCA-VAZIO-SO-APOS-SUCESSO').toBe(1)
})

test('busca com 500 na Marca: erro e "Tentar de novo" seguem visíveis; a nova tentativa traz o resultado buscado', async ({ page }) => {
  const c = await montar(page, { 8: marca8({ elementos: { tipo: '500' } }) })
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await pontoDeControle(c)
  // "lagosta" só casa com um elemento da Marca: o catálogo fica sem grupo
  await page.getByPlaceholder(/^Buscar /).fill('lagosta')
  // a consulta assenta: 1 leitura + as 2 novas tentativas do React Query, e o carregando some (vira erro)
  await expect.poll(() => c.srv.leituras.get('elementos:8') ?? 0, { timeout: 15_000 }).toBeGreaterThanOrEqual(3)
  await page.waitForFunction(() => !document.querySelector('[data-secao="marca"] .animate-spin'), undefined, { timeout: 15_000 })
  await doisQuadros(page)
  await capturar(c, 'busca-marca-erro')
  expect.soft(await page.locator('[data-aviso="marca-erro"]').count(), 'V2D-BUSCA-MARCA-ERRO').toBe(1)
  expect.soft(await page.getByText('Nenhum elemento encontrado.').count(), 'V2D-BUSCA-SEM-FALSO-VAZIO-ERRO').toBe(0)
  if (test.info().errors.length > 0) return
  c.srv.projetos.set(8, marca8())
  await page.locator('[data-aviso="marca-erro"]').getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(page.locator('[data-marca="11"]')).toBeVisible()
  expect.soft(await titulosDosItens(c), 'V2D-BUSCA-RETRY-RESULTADO').toEqual(['Selo Lagosta'])
  expect.soft(await page.getByText('Nenhum elemento encontrado.').count(), 'V2D-BUSCA-RETRY-SEM-VAZIO').toBe(0)
})

// ── Outros ───────────────────────────────────────────────────────────────────

test('Outros: item com categoria fora da lista aparece em "Outros" (antes da Marca) e insere', async ({ page }) => {
  test.skip(VARIANTE !== 'v2d', 'bundle próprio só na variante v2d')
  const c = await montar(page, { 8: marca8() }, pastaOutros)
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await pontoDeControle(c)
  const rotulos = await painel(page).locator('p.uppercase').evaluateAll((ps) => ps.map((p) => p.textContent?.trim()))
  expect(rotulos.slice(-2), 'V2D-OUTROS-ANTES-DA-MARCA').toEqual(['Outros', 'Marca'])
  await expect(page.locator('[data-secao="outros"] [data-elemento="sintetico-xyz"]'), 'V2D-OUTROS-ITEM').toBeVisible()
  const base = await linhaDeBase(c)
  const nova = await inserirEEsperar(c, base, () => botao(c, 'sintetico-xyz').click())
  expect(nova.style?.vetor, 'V2D-OUTROS-INSERE').toEqual({ asset: { id: 'sintetico-xyz', versao: 1 }, papeis: { preenchimento: 'destaque' } })
})

test.afterAll(async ({}, info) => {
  const destino = process.env.V2D_EVIDENCIAS
  if (destino && Object.keys(areas).length > 0) {
    mkdirSync(destino, { recursive: true })
    writeFileSync(path.join(destino, `area-de-clique-${info.project.name}.json`), JSON.stringify(areas, null, 2))
  }
})
