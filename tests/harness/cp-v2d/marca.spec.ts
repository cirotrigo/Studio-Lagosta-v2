/**
 * CP-V2e — envio e exclusão da Marca no Chromium, com o `TemplateEditorShell` REAL (H1) e a Identidade visual REAL
 * (`ProjectAssetsPanel`), no computador (1280×800) e no celular (375×812 emulado). Rede falsa (`servidor.ts`): sem
 * banco, Clerk, Blob, Vercel ou produção. Os módulos do V2e (hook, confirmação, Marca, Identidade) são os reais.
 *
 *   npx playwright test -c tests/harness/cp-v2d/playwright.config.ts marca.spec.ts
 *   V2D_VARIANTE=sem-confirmacao|hook-permissivo|sem-invalidacao|delete-aceita-qualquer-resposta|invalida-projeto-atual|upload-json …
 *
 * Asserções nomeadas (`V2E-…`) são as que um controle negativo tem de derrubar; antes delas, o ponto de controle
 * (`PONTO-DE-CONTROLE`: página montada, sem `pageerror`, sonda viva, painel visível, nenhuma URL externa). Nenhum
 * teste espera por um elemento que uma variante remove: a ausência é a própria asserção.
 *
 * A invalidação é provada por um ESPIÃO EXATO em `queryClient.invalidateQueries` (o `QueryClient` real exposto pela
 * sonda), não por um GET: uma query sem observador (projeto trocado) é invalidada sem nova leitura.
 */
import { test, expect, type Page as Aba } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import type { TemplateDto } from '@/hooks/use-template'
import type { Layer } from '@/types/template'
import { empacotar, type Variante } from './bundle'
import { ORIGEM, ServidorFalso, type PaginaGravada, type Projeto, type Resposta } from './servidor'

// um controle que remove um botão não pode esperar o timeout do teste inteiro (90 s) para cair
test.use({ actionTimeout: 10_000 })

const VARIANTE = (process.env.V2D_VARIANTE ?? 'v2d') as Variante
const CAPTURAS = process.env.V2E_CAPTURAS
let pasta = ''
let SELO: Buffer
let FOGO: Buffer
let NOVO: Buffer
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#e4572e"/></svg>')
const GIF = Buffer.from('R0lGODlhAQABAAAAACw=', 'base64')

test.beforeAll(async () => {
  pasta = mkdtempSync(path.join(tmpdir(), 'cp-v2e-'))
  await empacotar(pasta, VARIANTE)
  SELO = await sharp({ create: { width: 400, height: 200, channels: 4, background: '#e4572e' } }).png().toBuffer()
  FOGO = await sharp({ create: { width: 100, height: 100, channels: 4, background: '#0b1f3a' } }).png().toBuffer()
  NOVO = await sharp({ create: { width: 400, height: 200, channels: 4, background: '#2a9d8f' } }).png().toBuffer()
})
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
const ELEMENTOS_8 = () => [
  { id: 11, name: 'Selo Lagosta', fileUrl: `${ORIGEM}/imagens/selo.png`, category: null, projectId: 8 },
  { id: 12, name: 'Ícone Fogo', fileUrl: `${ORIGEM}/imagens/fogo.png`, category: 'icone', projectId: 8 },
]
const projeto = (id: number, assinatura: unknown) => ({ id, name: `Projeto ${id}`, description: null, status: 'ACTIVE', logoUrl: null, assinatura })
const marca8 = (extra: Partial<Projeto> = {}): Projeto => ({
  cores: json([{ id: 1, name: 'Azul noite', hexCode: '#0B1F3A', projectId: 8 }, { id: 2, name: 'Laranja', hexCode: '#E4572E', projectId: 8 }]),
  projeto: json(projeto(8, { fundo: '#0B1F3A', destaque: { fill: '#E4572E' } })),
  elementos: json(ELEMENTOS_8()),
  ...extra,
})
const marca9 = (): Projeto => ({
  cores: json([{ id: 9, name: 'Verde', hexCode: '#2A9D8F', projectId: 9 }]),
  projeto: json(projeto(9, { fundo: '#1D3557', destaque: { fill: '#264653' } })),
  elementos: json([]),
})
const TEXTO: Layer = { id: 'texto-1', type: 'text', name: 'Título', visible: true, locked: false, order: 0, position: { x: 100, y: 300 }, size: { width: 880, height: 120 }, content: 'Sexta', style: { fontSize: 64, color: '#111111' } } as unknown as Layer
const pagina = (templateId: number): PaginaGravada => ({
  id: `p${templateId}`, name: 'Página 1', width: 1080, height: 1920, layers: [TEXTO], background: '#ffffff', order: 0,
  thumbnail: 'data:image/png;base64,iVBORw0KGgo=', templateId, isTemplate: false, templateName: null,
})
const template = (id: number, projectId: number): TemplateDto => ({
  id, name: `Modelo ${id}`, type: 'STORY', dimensions: '1080x1920', projectId, dynamicFields: [],
  designData: { canvas: { width: 1080, height: 1920, backgroundColor: '#ffffff' }, layers: [] },
  createdAt: '2026-10-23T00:00:00Z', updatedAt: '2026-10-23T00:00:00Z', createdBy: 'harness',
} as unknown as TemplateDto)
const T8 = template(101, 8)
const T9 = template(102, 9)
/** As 3 keys do endpoint, escritas à mão (não importadas do módulo do V2e). */
const CHAVES = (pid: number) => [['project-elements', pid], ['project-assets', pid, 'elements'], ['project', pid, 'elements']]

// ── montagem, ponto de controle, espião ─────────────────────────────────────

interface Contexto {
  aba: Aba
  srv: ServidorFalso
  erros: string[]
  celular: boolean
}
interface SondaDaJanela {
  __v2dAbrir: (t: TemplateDto) => void
  __v2dAbrirIdentidade: (pid: number) => void
  __v2d?: { design: () => { layers: Layer[] }; canUndo: () => boolean; undo: () => void; redo: () => void; selecionadas: () => string[]; projectId: () => number }
  __v2dQueryClient?: { invalidateQueries: (f?: { queryKey?: unknown }, o?: unknown) => Promise<void>; __espiado?: boolean }
  __invalidacoes: unknown[]
}
const janela = () => window as unknown as SondaDaJanela

async function montar(aba: Aba, projetos: Record<number, Projeto>): Promise<Contexto> {
  const srv = new ServidorFalso()
  for (const [id, p] of Object.entries(projetos)) srv.projetos.set(Number(id), p)
  srv.paginas.set(101, [pagina(101)])
  srv.paginas.set(102, [pagina(102)])
  srv.imagemDoEnvio = NOVO
  srv.servirArquivo('/', 'text/html', Buffer.from('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/v2d.css"><body><div id="app"></div><script src="/v2d.js"></script>'))
  srv.servirArquivo('/v2d.js', 'application/javascript', path.join(pasta, 'v2d.js'))
  srv.servirArquivo('/v2d.css', 'text/css', path.join(pasta, 'v2d.css'))
  srv.servirArquivo('/imagens/selo.png', 'image/png', SELO)
  srv.servirArquivo('/imagens/fogo.png', 'image/png', FOGO)
  const erros: string[] = []
  aba.on('pageerror', (e) => erros.push(String(e)))
  await srv.ligar(aba)
  await aba.goto(`${ORIGEM}/`)
  await aba.waitForFunction(() => typeof (window as unknown as SondaDaJanela).__v2dAbrir === 'function')
  return { aba, srv, erros, celular: (aba.viewportSize()?.width ?? 1280) < 768 }
}

const doisQuadros = (aba: Aba) => aba.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
/** Dois quadros, 400 ms e mais dois: tempo para um pedido disparado no clique chegar ao servidor falso. */
async function quieto(aba: Aba) {
  await doisQuadros(aba)
  await aba.waitForTimeout(400)
  await doisQuadros(aba)
}

async function assentar(c: Contexto) {
  await c.aba.waitForFunction(() => !!(window as unknown as SondaDaJanela).__v2d)
  for (let tentativa = 0; tentativa < 15; tentativa++) {
    const n = c.srv.patches.length
    await doisQuadros(c.aba)
    await c.aba.waitForTimeout(850)
    await doisQuadros(c.aba)
    if (c.srv.patches.length === n) return
  }
  throw new Error('a página não assentou (PATCH contínuo)')
}

async function abrirTemplate(c: Contexto, t: TemplateDto) {
  await c.aba.evaluate((tt) => (window as unknown as SondaDaJanela).__v2dAbrir(tt), t as unknown as TemplateDto)
  await c.aba.waitForFunction((pid) => (window as unknown as SondaDaJanela).__v2d?.projectId() === pid, t.projectId)
  await assentar(c)
}

const painel = (aba: Aba) => aba.getByPlaceholder(/^Buscar /).locator('xpath=ancestor::div[contains(@class,"min-h-[400px]")][1]')

async function abrirPainel(c: Contexto) {
  if (c.celular) {
    if (!(await c.aba.getByRole('dialog').isVisible())) await c.aba.getByRole('button', { name: 'Abrir ferramentas' }).click()
    await c.aba.getByRole('dialog').getByRole('button', { name: 'Elementos', exact: true }).click()
  } else {
    await c.aba.locator('button[title="Elementos"]').click()
  }
  await expect(painel(c.aba)).toBeVisible()
}

async function pontoDeControle(c: Contexto, comPainel = true) {
  expect(c.erros, 'PONTO-DE-CONTROLE: pageerror').toEqual([])
  if (comPainel) {
    expect(await c.aba.evaluate(() => !!(window as unknown as SondaDaJanela).__v2d), 'PONTO-DE-CONTROLE: sonda').toBe(true)
    await expect(painel(c.aba), 'PONTO-DE-CONTROLE: painel visível').toBeVisible()
  }
  expect(c.srv.externas, 'PONTO-DE-CONTROLE: URL externa').toEqual([])
}

/** Espião exato: envolve o `invalidateQueries` do `QueryClient` real (uma vez) e zera o registro. */
async function espiar(aba: Aba) {
  await aba.waitForFunction(() => !!(window as unknown as SondaDaJanela).__v2dQueryClient)
  await aba.evaluate(() => {
    const w = window as unknown as SondaDaJanela
    w.__invalidacoes = []
    const qc = w.__v2dQueryClient!
    if (qc.__espiado) return
    const original = qc.invalidateQueries.bind(qc)
    qc.invalidateQueries = (f, o) => {
      w.__invalidacoes.push(f?.queryKey ?? null)
      return original(f, o)
    }
    qc.__espiado = true
  })
}
/** As invalidações que tocam elementos (as 3 keys de qualquer projeto), na ordem. */
const invalidacoesDeElementos = (aba: Aba) =>
  aba.evaluate(() =>
    (window as unknown as SondaDaJanela).__invalidacoes.filter(
      (k) => Array.isArray(k) && (k[0] === 'project-elements' || k.includes('elements')),
    ),
  ) as Promise<unknown[][]>

const camadas = (aba: Aba) => aba.evaluate(() => (window as unknown as SondaDaJanela).__v2d!.design().layers) as Promise<Layer[]>
const podeDesfazer = (aba: Aba) => aba.evaluate(() => (window as unknown as SondaDaJanela).__v2d!.canUndo())

const item = (aba: Aba, id: number) => aba.locator(`[data-marca="${id}"]`)
const lixeira = (aba: Aba, id: number) => aba.locator(`[data-apagar="${id}"]`)
const confirmacao = (aba: Aba) => aba.locator('[data-confirmacao="apagar-elemento"]')
const botaoDaConfirmacao = (aba: Aba, nome: 'Cancelar' | 'Apagar') => confirmacao(aba).getByRole('button', { name: nome, exact: true })
const entradaDeArquivo = (aba: Aba) => aba.locator('input[data-envio="marca"]')

async function capturar(c: Contexto, nome: string) {
  if (!CAPTURAS) return
  mkdirSync(CAPTURAS, { recursive: true })
  await c.aba.screenshot({ path: path.join(CAPTURAS, `${c.celular ? 'celular' : 'desktop'}-${nome}.png`) })
}

/** Editor do projeto 8 aberto, painel visível, Marca listada, espião instalado. */
async function marcaPronta(page: Aba, projetos: Record<number, Projeto> = { 8: marca8(), 9: marca9() }) {
  const c = await montar(page, projetos)
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await pontoDeControle(c)
  await expect(item(page, 11)).toBeVisible()
  await espiar(page)
  return c
}

const arquivo = (name: string, mimeType: string, buffer: Buffer) => ({ name, mimeType, buffer })

// ── exclusão: confirmação ────────────────────────────────────────────────────

test('lixeira: 0 DELETE antes da confirmação e não insere; Cancelar, Esc e clique fora = 0 DELETE', async ({ page }) => {
  const c = await marcaPronta(page)
  await assentar(c)
  const base = { layers: await camadas(page), canUndo: await podeDesfazer(page) }
  expect(base.canUndo, 'PONTO-DE-CONTROLE: base sem histórico').toBe(false)

  await lixeira(page, 11).click()
  await quieto(page)
  // medido LOGO depois do clique, antes de qualquer confirmação
  expect(c.srv.escritasDe('DELETE'), 'V2E-0-DELETE-ANTES-DA-CONFIRMACAO').toEqual([])
  expect(await confirmacao(page).isVisible(), 'V2E-0-DELETE-ANTES-DA-CONFIRMACAO').toBe(true)
  await capturar(c, 'confirmacao')
  expect(await camadas(page), 'V2E-LIXEIRA-SEM-ADDLAYER').toEqual(base.layers)
  expect(await podeDesfazer(page), 'V2E-LIXEIRA-SEM-ADDLAYER').toBe(false)
  await expect(confirmacao(page)).toContainText('Apagar "Selo Lagosta" da Marca?')
  await expect(confirmacao(page)).toContainText('As artes que já usam esta imagem não mudam.')
  // com a confirmação (modal) aberta, o Radix põe `aria-hidden` no resto: o drawer segue na tela, fora da árvore de acessibilidade
  if (c.celular) await expect(page.getByRole('dialog', { includeHidden: true }), 'V2E-DRAWER-SEGUE-ABERTO').toBeVisible()

  await botaoDaConfirmacao(page, 'Cancelar').click()
  await expect(confirmacao(page)).toHaveCount(0)
  await quieto(page)
  expect(c.srv.escritasDe('DELETE'), 'V2E-CANCELAR-0-DELETE').toEqual([])

  await lixeira(page, 11).click()
  await expect(confirmacao(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(confirmacao(page)).toHaveCount(0)
  await quieto(page)
  expect(c.srv.escritasDe('DELETE'), 'V2E-CANCELAR-0-DELETE').toEqual([])

  await lixeira(page, 11).click()
  await expect(confirmacao(page)).toBeVisible()
  await page.mouse.click(4, 4)
  await quieto(page)
  expect(await confirmacao(page).isVisible(), 'V2E-CANCELAR-0-DELETE').toBe(true)
  expect(c.srv.escritasDe('DELETE'), 'V2E-CANCELAR-0-DELETE').toEqual([])
  await botaoDaConfirmacao(page, 'Cancelar').click()
  await expect(confirmacao(page)).toHaveCount(0)

  await expect(item(page, 11), 'V2E-CANCELAR-0-DELETE').toBeVisible()
  expect(await camadas(page), 'V2E-LIXEIRA-SEM-ADDLAYER').toEqual(base.layers)
  if (c.celular) await expect(page.getByRole('dialog'), 'V2E-DRAWER-SEGUE-ABERTO').toBeVisible()
  expect(c.srv.escritas, 'V2E-CANCELAR-0-DELETE').toEqual([])
})

test('exclusão confirmada: exatamente 1 DELETE; o item some pela nova leitura; espião = as 3 keys da origem', async ({ page }) => {
  const c = await marcaPronta(page)
  const leituras = c.srv.leituras.get('elementos:8') ?? 0
  await lixeira(page, 11).click()
  await expect(confirmacao(page)).toBeVisible()
  await botaoDaConfirmacao(page, 'Apagar').click()
  await expect(confirmacao(page)).toHaveCount(0)
  // soft: sem a invalidação (controle) o item não some, e o teste segue até o espião
  await expect.soft(item(page, 11), 'V2E-UM-DELETE').toHaveCount(0, { timeout: 10_000 })
  await quieto(page)
  expect(c.srv.escritasDe('DELETE').map((e) => e.caminho), 'V2E-UM-DELETE').toEqual(['/api/projects/8/elements/11'])
  expect.soft(c.srv.leituras.get('elementos:8') ?? 0, 'V2E-UM-DELETE').toBeGreaterThan(leituras)
  expect(await invalidacoesDeElementos(page), 'V2E-INVALIDA-3-KEYS-DA-ORIGEM').toEqual(CHAVES(8))
  await expect(page.getByText('Elemento apagado', { exact: true })).toBeVisible()
  await expect(item(page, 12)).toBeVisible()
  if (c.celular) await expect(page.getByRole('dialog'), 'V2E-DRAWER-SEGUE-ABERTO').toBeVisible()
  await capturar(c, 'apagado')
})

test('DELETE pendente: Esc ignorado, botões desabilitados, 1 só DELETE com clique duplo; termina e fecha', async ({ page }) => {
  const c = await marcaPronta(page)
  c.srv.segurar('delete:8')
  await lixeira(page, 11).click()
  await expect(confirmacao(page)).toBeVisible()
  await botaoDaConfirmacao(page, 'Apagar').dblclick()
  await expect.poll(() => c.srv.escritasDe('DELETE').length).toBe(1)
  await page.keyboard.press('Escape')
  await quieto(page)
  await capturar(c, 'apagando')
  expect(await confirmacao(page).isVisible(), 'V2E-ESC-PENDENTE-MANTEM').toBe(true)
  expect(await botaoDaConfirmacao(page, 'Apagar').isDisabled(), 'V2E-DELETE-PENDENTE').toBe(true)
  expect(await botaoDaConfirmacao(page, 'Cancelar').isDisabled(), 'V2E-DELETE-PENDENTE').toBe(true)
  await botaoDaConfirmacao(page, 'Apagar').click({ force: true, timeout: 2_000 }).catch(() => {})
  await quieto(page)
  expect(c.srv.escritasDe('DELETE').length, 'V2E-DELETE-PENDENTE').toBe(1)
  c.srv.soltar('delete:8')
  await expect(confirmacao(page)).toHaveCount(0)
  await expect(item(page, 11)).toHaveCount(0, { timeout: 10_000 })
  expect(c.srv.escritasDe('DELETE').length, 'V2E-DELETE-PENDENTE').toBe(1)
})

test('DELETE 500: erro, o item continua e o toast avisa; "tentar de novo" com 200 remove', async ({ page }) => {
  const c = await marcaPronta(page)
  c.srv.exclusao.set(8, ['500', 'ok'])
  await lixeira(page, 11).click()
  await botaoDaConfirmacao(page, 'Apagar').click()
  await expect(confirmacao(page)).toHaveCount(0)
  await expect(page.getByText('Não foi possível apagar o elemento', { exact: true }), 'V2E-DELETE-ERRO-MANTEM').toBeVisible()
  await quieto(page)
  await expect(item(page, 11), 'V2E-DELETE-ERRO-MANTEM').toBeVisible()
  expect(c.srv.escritasDe('DELETE').length, 'V2E-DELETE-ERRO-MANTEM').toBe(1)
  await capturar(c, 'apagar-erro')
  await lixeira(page, 11).click()
  await botaoDaConfirmacao(page, 'Apagar').click()
  await expect(item(page, 11), 'V2E-DELETE-ERRO-MANTEM').toHaveCount(0, { timeout: 10_000 })
  expect(c.srv.escritasDe('DELETE').length, 'V2E-DELETE-ERRO-MANTEM').toBe(2)
})

test('resposta do DELETE inválida (HTML 200, texto, {success:false}) é erro; nunca toast de sucesso', async ({ page }) => {
  const c = await marcaPronta(page)
  for (const r of ['html', 'texto', 'success-false'] as const) {
    c.srv.exclusao.set(8, [r])
    await lixeira(page, 11).click()
    await botaoDaConfirmacao(page, 'Apagar').click()
    await expect(confirmacao(page)).toHaveCount(0)
    await quieto(page)
    expect(await page.getByText('Elemento apagado', { exact: true }).count(), `V2E-DELETE-RESPOSTA-INVALIDA-E-ERRO (${r})`).toBe(0)
    expect(await page.getByText('Não foi possível apagar o elemento', { exact: true }).isVisible(), `V2E-DELETE-RESPOSTA-INVALIDA-E-ERRO (${r})`).toBe(true)
    await expect(item(page, 11)).toBeVisible()
  }
  expect(c.srv.escritasDe('DELETE').length, 'V2E-DELETE-RESPOSTA-INVALIDA-E-ERRO').toBe(3)
})

// ── envio ────────────────────────────────────────────────────────────────────

test('envio válido (PNG e SVG): 1 POST multipart por arquivo, com file e name; itens novos; nenhuma camada', async ({ page }) => {
  const c = await marcaPronta(page)
  await assentar(c)
  const base = await camadas(page)
  await entradaDeArquivo(page).setInputFiles([arquivo('selo novo.png', 'image/png', NOVO), arquivo('icone.svg', 'image/svg+xml', SVG)])
  await expect.poll(() => c.srv.escritasDe('POST').length, { timeout: 10_000 }).toBe(2)
  const posts = c.srv.escritasDe('POST')
  expect(posts.map((p) => p.caminho), 'V2E-UPLOAD-FORMDATA').toEqual(['/api/projects/8/elements', '/api/projects/8/elements'])
  expect(posts.map((p) => p.contentType.split(';')[0]), 'V2E-UPLOAD-FORMDATA').toEqual(['multipart/form-data', 'multipart/form-data'])
  expect(posts.map((p) => p.campos), 'V2E-UPLOAD-FORMDATA').toEqual([['file', 'name'], ['file', 'name']])
  expect(posts.map((p) => p.nome), 'V2E-UPLOAD-FORMDATA').toEqual(['selo novo', 'icone'])
  await expect(page.getByText('2 elementos enviados', { exact: true }), 'V2E-UPLOAD-FORMDATA').toBeVisible({ timeout: 10_000 })
  // soft: sem a invalidação (controle) os itens não aparecem, e o teste segue até o espião
  await expect.soft(painel(page).locator('[data-marca] img[alt="selo novo"]'), 'V2E-UPLOAD-FORMDATA').toBeVisible()
  await expect.soft(painel(page).locator('[data-marca] img[alt="icone"]'), 'V2E-UPLOAD-FORMDATA').toBeVisible()
  expect(await camadas(page), 'V2E-UPLOAD-SEM-CAMADA').toEqual(base)
  expect(await podeDesfazer(page), 'V2E-UPLOAD-SEM-CAMADA').toBe(false)
  expect(await invalidacoesDeElementos(page), 'V2E-INVALIDA-3-KEYS-DA-ORIGEM').toEqual([...CHAVES(8), ...CHAVES(8)])
  if (c.celular) await expect(page.getByRole('dialog'), 'V2E-DRAWER-SEGUE-ABERTO').toBeVisible()
  await capturar(c, 'enviado')
})

test('envio recusado no cliente (GIF, acima de 4 MiB): 0 POST', async ({ page }) => {
  const c = await marcaPronta(page)
  await entradaDeArquivo(page).setInputFiles([arquivo('anima.gif', 'image/gif', GIF), arquivo('grande.png', 'image/png', Buffer.alloc(4_194_305))])
  await quieto(page)
  expect(c.srv.escritasDe('POST'), 'V2E-UPLOAD-RECUSADO-SEM-REDE').toEqual([])
  await expect(page.getByText('Arquivo não enviado', { exact: true }), 'V2E-UPLOAD-RECUSADO-SEM-REDE').toBeVisible()
  await expect(page.getByText(/arquivo acima de 4 MB: envie pela Identidade visual/).first()).toBeVisible()
})

test('envio 415/413/500: a fila segue, o resumo traz as mensagens; lista igual, nada inserido', async ({ page }) => {
  const c = await marcaPronta(page)
  await assentar(c)
  const base = await camadas(page)
  c.srv.envio.set(8, [
    { status: 415, corpo: JSON.stringify({ error: 'Formato não suportado' }), tipo: 'json' },
    { status: 413, corpo: 'Request Entity Too Large', tipo: 'texto' },
    { status: 500, corpo: JSON.stringify({ error: 'falha simulada' }), tipo: 'json' },
  ])
  await entradaDeArquivo(page).setInputFiles([arquivo('a.png', 'image/png', NOVO), arquivo('b.png', 'image/png', NOVO), arquivo('c.png', 'image/png', NOVO)])
  await expect(page.getByText('3 de 3 não enviados', { exact: true }), 'V2E-UPLOAD-ERRO').toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Formato não suportado.*grande demais.*falha simulada/).first(), 'V2E-UPLOAD-ERRO').toBeVisible()
  expect(c.srv.escritasDe('POST').length, 'V2E-UPLOAD-ERRO').toBe(3)
  await quieto(page)
  expect(await painel(page).locator('[data-marca]').count(), 'V2E-UPLOAD-ERRO').toBe(2)
  expect(await camadas(page), 'V2E-UPLOAD-ERRO').toEqual(base)
})

test('resposta do POST inválida (HTML 200, objeto incompleto, outro projectId) é erro', async ({ page }) => {
  const c = await marcaPronta(page)
  c.srv.envio.set(8, ['html', 'incompleto', 'outro-projeto'])
  await entradaDeArquivo(page).setInputFiles([arquivo('a.png', 'image/png', NOVO), arquivo('b.png', 'image/png', NOVO), arquivo('c.png', 'image/png', NOVO)])
  await expect(page.getByText('3 de 3 não enviados', { exact: true }), 'V2E-UPLOAD-RESPOSTA-INVALIDA-E-ERRO').toBeVisible({ timeout: 10_000 })
  expect(await page.getByText(/elementos? enviados?$/i).count(), 'V2E-UPLOAD-RESPOSTA-INVALIDA-E-ERRO').toBe(0)
  expect(c.srv.escritasDe('POST').length, 'V2E-UPLOAD-RESPOSTA-INVALIDA-E-ERRO').toBe(3)
})

// ── lista ────────────────────────────────────────────────────────────────────

test('lista inválida (HTML 200, {}, item malformado) é erro com "Tentar de novo", nunca vazia; [] é vazia confirmada', async ({ page }) => {
  const casos: Array<[string, Resposta]> = [
    ['html', { tipo: 'html' }],
    ['objeto', json({})],
    ['malformado', json([{ id: 11, name: 'Sem arquivo', category: null, projectId: 8 }])],
  ]
  for (const [nome, elementos] of casos) {
    const aba = nome === 'html' ? page : await page.context().newPage()
    const c = await montar(aba, { 8: marca8({ elementos }) })
    await abrirTemplate(c, T8)
    await abrirPainel(c)
    await pontoDeControle(c)
    await aba.waitForFunction(() => !document.querySelector('[data-secao="marca"] .animate-spin'), undefined, { timeout: 15_000 })
    expect(await aba.locator('[data-aviso="marca-vazia"]').count(), `V2E-LISTA-INVALIDA-E-ERRO (${nome})`).toBe(0)
    expect(await aba.locator('[data-aviso="marca-erro"]').isVisible(), `V2E-LISTA-INVALIDA-E-ERRO (${nome})`).toBe(true)
    if (nome === 'html') {
      await capturar(c, 'lista-invalida')
      c.srv.projetos.set(8, marca8())
      await aba.locator('[data-aviso="marca-erro"]').getByRole('button', { name: 'Tentar de novo' }).click()
      await expect(item(aba, 11), 'V2E-LISTA-INVALIDA-E-ERRO (tentar de novo)').toBeVisible()
    }
  }
  const v = await montar(await page.context().newPage(), { 8: marca8({ elementos: json([]) }) })
  await abrirTemplate(v, T8)
  await abrirPainel(v)
  await expect(v.aba.locator('[data-aviso="marca-vazia"]'), 'V2E-VAZIA-CONFIRMADA').toBeVisible()
  await expect(v.aba.locator('[data-acao="enviar-marca"]'), 'V2E-VAZIA-CONFIRMADA').toBeEnabled()
})

// ── troca de projeto ─────────────────────────────────────────────────────────

test('troca A → B com a confirmação aberta (não iniciada): fecha e 0 DELETE', async ({ page }) => {
  const c = await marcaPronta(page)
  await lixeira(page, 11).click()
  await expect(confirmacao(page)).toBeVisible()
  await abrirTemplate(c, T9)
  await quieto(page)
  expect(await confirmacao(page).count(), 'V2E-TROCA-FECHA-CONFIRMACAO').toBe(0)
  expect(c.srv.escritasDe('DELETE'), 'V2E-TROCA-FECHA-CONFIRMACAO').toEqual([])
})

test('troca A → B com a fila: só o POST em voo sai (contra A); o resto é cancelado; B intocado; invalida só A', async ({ page }) => {
  const c = await marcaPronta(page)
  c.srv.segurar('post:8')
  await entradaDeArquivo(page).setInputFiles([arquivo('a.png', 'image/png', NOVO), arquivo('b.png', 'image/png', NOVO), arquivo('c.png', 'image/png', NOVO)])
  await expect.poll(() => c.srv.escritasDe('POST').length).toBe(1)
  await abrirTemplate(c, T9)
  await abrirPainel(c)
  await expect(page.locator('[data-aviso="marca-vazia"]')).toBeVisible()
  const leituras9 = c.srv.leituras.get('elementos:9') ?? 0
  const base9 = await camadas(page)
  await espiar(page)
  c.srv.soltar('post:8')
  await quieto(page)
  await assentar(c)
  expect(c.srv.escritasDe('POST').map((p) => p.caminho), 'V2E-TROCA-CANCELA-FILA').toEqual(['/api/projects/8/elements'])
  expect(await page.getByText(/enviados?|não enviados/).count(), 'V2E-TROCA-CANCELA-FILA').toBe(0)
  expect(await invalidacoesDeElementos(page), 'V2E-INVALIDA-PROJETO-DA-MUTACAO').toEqual(CHAVES(8))
  expect(c.srv.leituras.get('elementos:9') ?? 0, 'V2E-INVALIDA-PROJETO-DA-MUTACAO').toBe(leituras9)
  await expect(page.locator('[data-aviso="marca-vazia"]'), 'V2E-INVALIDA-PROJETO-DA-MUTACAO').toBeVisible()
  expect(await camadas(page), 'V2E-INVALIDA-PROJETO-DA-MUTACAO').toEqual(base9)
  // o envio em voo foi gravado no servidor de A: de volta a A, a lista lida mostra o item novo
  await abrirTemplate(c, T8)
  await abrirPainel(c)
  await expect(painel(page).locator('[data-marca] img[alt="a"]'), 'V2E-TROCA-CANCELA-FILA (em voo gravado em A)').toBeVisible({ timeout: 10_000 })
})

// ── inserção, desfazer e autosave sem regressão ──────────────────────────────

test('inserção, desfazer e autosave de um elemento recém-enviado, depois de uma exclusão', async ({ page }) => {
  const c = await marcaPronta(page)
  await entradaDeArquivo(page).setInputFiles([arquivo('recem.png', 'image/png', NOVO)])
  await expect(page.getByText('Elemento enviado', { exact: true }), 'V2E-INSERCAO-SEM-REGRESSAO (envio)').toBeVisible({ timeout: 10_000 })
  await lixeira(page, 12).click()
  await botaoDaConfirmacao(page, 'Apagar').click()
  await expect(item(page, 12), 'V2E-INSERCAO-SEM-REGRESSAO (exclusão)').toHaveCount(0, { timeout: 10_000 })
  const novo = painel(page).locator('[data-marca]:has(img[alt="recem"])')
  await expect(novo, 'V2E-INSERCAO-SEM-REGRESSAO (item novo listado)').toBeVisible()
  await assentar(c)
  const base = { layers: await camadas(page), patches: c.srv.patches.length }
  await novo.click()
  await page.waitForFunction((n) => (window as unknown as SondaDaJanela).__v2d!.design().layers.length === n, base.layers.length + 1)
  const depois = await camadas(page)
  const nova = depois.find((l) => !base.layers.some((b) => b.id === l.id))!
  expect([nova.type, nova.size], 'V2E-INSERCAO-SEM-REGRESSAO').toEqual(['image', { width: 200, height: 100 }])
  expect(nova.fileUrl, 'V2E-INSERCAO-SEM-REGRESSAO').toMatch(new RegExp(`^${ORIGEM}/imagens/novo-\\d+\\.png$`))
  expect([nova.position.x + 100, nova.position.y + 50], 'V2E-INSERCAO-SEM-REGRESSAO').toEqual([540, 960])
  if (c.celular) await expect(page.getByRole('dialog'), 'V2E-INSERCAO-SEM-REGRESSAO (drawer fecha)').toBeHidden()
  expect(await podeDesfazer(page), 'V2E-INSERCAO-SEM-REGRESSAO').toBe(true)
  await page.evaluate(() => (window as unknown as SondaDaJanela).__v2d!.undo())
  await doisQuadros(page)
  expect(await camadas(page), 'V2E-INSERCAO-SEM-REGRESSAO (undo)').toEqual(base.layers)
  expect(await podeDesfazer(page), 'V2E-INSERCAO-SEM-REGRESSAO (undo esvazia)').toBe(false)
  await page.evaluate(() => (window as unknown as SondaDaJanela).__v2d!.redo())
  await doisQuadros(page)
  expect(await camadas(page), 'V2E-INSERCAO-SEM-REGRESSAO (redo)').toEqual(depois)
  await assentar(c)
  const gravacoes = c.srv.patchesDesde(base.patches, 'camadas')
  expect(gravacoes.length, 'V2E-INSERCAO-SEM-REGRESSAO (PATCH)').toBeGreaterThan(0)
  expect(gravacoes.map((p) => p.status), 'V2E-INSERCAO-SEM-REGRESSAO (PATCH 200)').toEqual(gravacoes.map(() => 200))
  const ultimo = gravacoes.at(-1)!.layers as Layer[]
  expect(ultimo.find((l) => l.id === nova.id)?.fileUrl, 'V2E-INSERCAO-SEM-REGRESSAO (payload)').toBe(nova.fileUrl)
  await page.reload()
  await page.waitForFunction(() => typeof (window as unknown as SondaDaJanela).__v2dAbrir === 'function')
  await abrirTemplate(c, T8)
  const recarregada = (await camadas(page)).find((l) => l.id === nova.id)
  expect([recarregada?.fileUrl, recarregada?.size], 'V2E-INSERCAO-SEM-REGRESSAO (reload)').toEqual([nova.fileUrl, nova.size])
  expect(c.srv.externas, 'V2E-INSERCAO-SEM-REGRESSAO (externas)').toEqual([])
})

// ── Identidade visual: a mesma confirmação e o mesmo hook ────────────────────

test('Identidade visual: lixeira abre a confirmação (0 DELETE), Cancelar = 0, Apagar = 1 DELETE e as 3 keys', async ({ page }) => {
  // cores com `createdAt`, como o endpoint real devolve (a seção de cores da Identidade formata a data)
  const cores = json([{ id: 1, name: 'Azul noite', hexCode: '#0B1F3A', projectId: 8, uploadedBy: 'u', createdAt: '2026-10-23T00:00:00Z' }])
  const c = await montar(page, { 8: marca8({ cores }) })
  await page.evaluate(() => (window as unknown as SondaDaJanela).__v2dAbrirIdentidade(8))
  await page.getByText('Elementos Gráficos').waitFor({ timeout: 15_000 }).catch(() => {})
  await pontoDeControle(c, false)
  const trash = page.getByRole('button', { name: 'Apagar Selo Lagosta', exact: true })
  await expect(trash).toBeVisible({ timeout: 15_000 })
  await espiar(page)
  await trash.click()
  await quieto(page)
  expect(c.srv.escritasDe('DELETE'), 'V2E-IDENTIDADE-0-DELETE-ANTES-DA-CONFIRMACAO').toEqual([])
  expect(await confirmacao(page).isVisible(), 'V2E-IDENTIDADE-0-DELETE-ANTES-DA-CONFIRMACAO').toBe(true)
  await capturar(c, 'identidade-confirmacao')
  await botaoDaConfirmacao(page, 'Cancelar').click()
  await expect(confirmacao(page)).toHaveCount(0)
  await quieto(page)
  expect(c.srv.escritasDe('DELETE'), 'V2E-IDENTIDADE-CANCELAR-0-DELETE').toEqual([])
  await trash.click()
  await botaoDaConfirmacao(page, 'Apagar').click()
  await expect(trash, 'V2E-IDENTIDADE-UM-DELETE').toHaveCount(0, { timeout: 10_000 })
  await quieto(page)
  expect(c.srv.escritasDe('DELETE').map((e) => e.caminho), 'V2E-IDENTIDADE-UM-DELETE').toEqual(['/api/projects/8/elements/11'])
  expect(await invalidacoesDeElementos(page), 'V2E-IDENTIDADE-INVALIDA-3-KEYS').toEqual(CHAVES(8))
  expect(c.erros, 'V2E-IDENTIDADE-SEM-PAGEERROR').toEqual([])
})

// ── revisão 2 do Codex: troca de projeto SEM remontagem e upload da Identidade em voo ─────────────────

const coresComData = (pid: number, hex: string) => json([{ id: pid * 10, name: 'Cor', hexCode: hex, projectId: pid, uploadedBy: 'u', createdAt: '2026-10-23T00:00:00Z' }])

/** Mesmo `template.id` (o shell usa `key={template.id}`), outro `projectId`: o provider recebe o projeto novo sem remontar. */
async function trocarSemRemontar(c: Contexto, projectId: number) {
  await c.aba.evaluate((t) => (window as unknown as SondaDaJanela).__v2dAbrir(t), { ...T8, projectId } as unknown as TemplateDto)
  await c.aba.waitForFunction((pid) => (window as unknown as SondaDaJanela).__v2d?.projectId() === pid, projectId)
  await assentar(c)
}
/** Marca o nó da seção Marca e lê o contador de montagens: depois da troca, o mesmo nó e o mesmo número = sem remontagem. */
async function marcarMontagem(aba: Aba) {
  return aba.evaluate(() => {
    const no = document.querySelector('[data-secao="marca"]') as (Element & { __v2eNo?: string }) | null
    if (no) no.__v2eNo = 'original'
    return (window as unknown as { __v2dMontagens?: number }).__v2dMontagens ?? 0
  })
}
async function semRemontagem(aba: Aba, montagens: number) {
  return aba.evaluate(
    (m) => ({
      mesmoNo: (document.querySelector('[data-secao="marca"]') as (Element & { __v2eNo?: string }) | null)?.__v2eNo === 'original',
      mesmasMontagens: (window as unknown as { __v2dMontagens?: number }).__v2dMontagens === m,
    }),
    montagens,
  )
}

test('sem remontagem A → B: a confirmação aberta (não iniciada) fecha e 0 DELETE', async ({ page }) => {
  const c = await marcaPronta(page)
  const montagens = await marcarMontagem(page)
  await lixeira(page, 11).click()
  await expect(confirmacao(page)).toBeVisible()
  await trocarSemRemontar(c, 9)
  await quieto(page)
  expect(await semRemontagem(page, montagens), 'V2E-SEM-REMONTAGEM').toEqual({ mesmoNo: true, mesmasMontagens: true })
  expect(await confirmacao(page).count(), 'V2E-SEM-REMONTAGEM-FECHA-CONFIRMACAO').toBe(0)
  expect(c.srv.escritasDe('DELETE'), 'V2E-SEM-REMONTAGEM-FECHA-CONFIRMACAO').toEqual([])
})

test('sem remontagem A → B com a fila: o POST preso sai contra A, o resto não sai; invalida só as 3 keys de A; B intocado', async ({ page }) => {
  const c = await marcaPronta(page)
  const montagens = await marcarMontagem(page)
  c.srv.segurar('post:8')
  await entradaDeArquivo(page).setInputFiles([arquivo('a.png', 'image/png', NOVO), arquivo('b.png', 'image/png', NOVO), arquivo('c.png', 'image/png', NOVO)])
  await expect.poll(() => c.srv.escritasDe('POST').length).toBe(1)
  await trocarSemRemontar(c, 9)
  await expect(page.locator('[data-aviso="marca-vazia"]')).toBeVisible()
  expect(await semRemontagem(page, montagens), 'V2E-SEM-REMONTAGEM').toEqual({ mesmoNo: true, mesmasMontagens: true })
  const leituras9 = c.srv.leituras.get('elementos:9') ?? 0
  const base9 = await camadas(page)
  await espiar(page)
  c.srv.soltar('post:8')
  await quieto(page)
  await assentar(c)
  expect(c.srv.escritasDe('POST').map((p) => p.caminho), 'V2E-SEM-REMONTAGEM-CANCELA-FILA').toEqual(['/api/projects/8/elements'])
  expect(await page.getByText(/enviados?|não enviados/).count(), 'V2E-SEM-REMONTAGEM-CANCELA-FILA').toBe(0)
  await expect(page.locator('[data-acao="enviar-marca"]'), 'V2E-SEM-REMONTAGEM-CANCELA-FILA').toHaveText('Enviar')
  expect(await invalidacoesDeElementos(page), 'V2E-SEM-REMONTAGEM-INVALIDA-ORIGEM').toEqual(CHAVES(8))
  expect(c.srv.leituras.get('elementos:9') ?? 0, 'V2E-SEM-REMONTAGEM-INVALIDA-ORIGEM').toBe(leituras9)
  await expect(page.locator('[data-aviso="marca-vazia"]'), 'V2E-SEM-REMONTAGEM-INVALIDA-ORIGEM').toBeVisible()
  expect(await camadas(page), 'V2E-SEM-REMONTAGEM-INVALIDA-ORIGEM').toEqual(base9)
})

test('sem remontagem A → B com o DELETE em voo: o callback tardio de A não fecha a confirmação de B nem anuncia nada', async ({ page }) => {
  const nove = { ...marca9(), elementos: json([{ id: 21, name: 'Selo Nove', fileUrl: `${ORIGEM}/imagens/fogo.png`, category: null, projectId: 9 }]) }
  const c = await marcaPronta(page, { 8: marca8(), 9: nove })
  const montagens = await marcarMontagem(page)
  c.srv.segurar('delete:8')
  await lixeira(page, 11).click()
  await botaoDaConfirmacao(page, 'Apagar').click()
  await expect.poll(() => c.srv.escritasDe('DELETE').length).toBe(1)
  await trocarSemRemontar(c, 9)
  await expect(item(page, 21)).toBeVisible()
  expect(await semRemontagem(page, montagens), 'V2E-SEM-REMONTAGEM').toEqual({ mesmoNo: true, mesmasMontagens: true })
  expect(await confirmacao(page).count(), 'V2E-SEM-REMONTAGEM-FECHA-CONFIRMACAO').toBe(0)
  await lixeira(page, 21).click()
  await expect(confirmacao(page)).toContainText('Apagar "Selo Nove" da Marca?')
  await espiar(page)
  c.srv.soltar('delete:8')
  await quieto(page)
  await capturar(c, 'sem-remontagem-callback-tardio')
  expect(await confirmacao(page).isVisible(), 'V2E-SEM-REMONTAGEM-CALLBACK-TARDIO').toBe(true)
  await expect(confirmacao(page), 'V2E-SEM-REMONTAGEM-CALLBACK-TARDIO').toContainText('Apagar "Selo Nove" da Marca?')
  expect(await page.getByText('Elemento apagado', { exact: true }).count(), 'V2E-SEM-REMONTAGEM-CALLBACK-TARDIO').toBe(0)
  expect(await page.getByText('Não foi possível apagar o elemento', { exact: true }).count(), 'V2E-SEM-REMONTAGEM-CALLBACK-TARDIO').toBe(0)
  expect(await invalidacoesDeElementos(page), 'V2E-SEM-REMONTAGEM-INVALIDA-ORIGEM').toEqual(CHAVES(8))
  // terminado o DELETE de A, a confirmação de B volta a ficar operável; cancelar não manda nada para B
  await expect(botaoDaConfirmacao(page, 'Apagar'), 'V2E-SEM-REMONTAGEM-CALLBACK-TARDIO').toBeEnabled()
  await botaoDaConfirmacao(page, 'Cancelar').click()
  await expect(confirmacao(page)).toHaveCount(0)
  await expect(item(page, 21)).toBeVisible()
  expect(c.srv.escritasDe('DELETE').map((e) => e.caminho), 'V2E-SEM-REMONTAGEM-CALLBACK-TARDIO').toEqual(['/api/projects/8/elements/11'])
})

test('Identidade visual: upload em voo e troca A → B na MESMA instância: POST para A e invalida só as 3 keys de A', async ({ page }) => {
  const c = await montar(page, { 8: marca8({ cores: coresComData(8, '#0B1F3A') }), 9: { ...marca9(), cores: coresComData(9, '#2A9D8F') } })
  await page.evaluate(() => (window as unknown as SondaDaJanela).__v2dAbrirIdentidade(8))
  const titulo = page.getByRole('heading', { name: 'Elementos Gráficos' })
  await titulo.waitFor({ timeout: 15_000 }).catch(() => {})
  await pontoDeControle(c, false)
  await expect(page.getByRole('button', { name: 'Apagar Selo Lagosta', exact: true })).toBeVisible({ timeout: 15_000 })
  await titulo.evaluate((no) => ((no as Element & { __v2eNo?: string }).__v2eNo = 'original'))
  await page.evaluate(() => {
    const w = window as unknown as { __v2dBlobPreso?: Promise<void>; __v2dSoltarBlob?: () => void }
    w.__v2dBlobPreso = new Promise<void>((r) => (w.__v2dSoltarBlob = r))
  })
  await titulo.locator('xpath=ancestor::section[1]').locator('input[type="file"]').setInputFiles([arquivo('novo.png', 'image/png', NOVO)])
  await expect.poll(() => page.evaluate(() => (window as unknown as { __v2dBlobPedidos?: number }).__v2dBlobPedidos ?? 0)).toBe(1)
  await page.evaluate(() => (window as unknown as SondaDaJanela).__v2dAbrirIdentidade(9))
  await expect(page.getByText(/Nenhum elemento cadastrado/)).toBeVisible({ timeout: 15_000 })
  expect(await titulo.evaluate((no) => (no as Element & { __v2eNo?: string }).__v2eNo), 'V2E-IDENTIDADE-SEM-REMONTAGEM').toBe('original')
  await quieto(page)
  const leituras9 = c.srv.leituras.get('elementos:9') ?? 0
  await espiar(page)
  await page.evaluate(() => (window as unknown as { __v2dSoltarBlob?: () => void }).__v2dSoltarBlob?.())
  await expect.poll(() => c.srv.escritasDe('POST').length).toBe(1)
  await quieto(page)
  expect(c.srv.escritasDe('POST').map((p) => p.caminho), 'V2E-IDENTIDADE-UPLOAD-PROJETO-DA-MUTACAO').toEqual(['/api/projects/8/elements'])
  expect(await invalidacoesDeElementos(page), 'V2E-IDENTIDADE-UPLOAD-PROJETO-DA-MUTACAO').toEqual(CHAVES(8))
  expect(c.srv.leituras.get('elementos:9') ?? 0, 'V2E-IDENTIDADE-UPLOAD-PROJETO-DA-MUTACAO').toBe(leituras9)
  await expect(page.getByText(/Nenhum elemento cadastrado/), 'V2E-IDENTIDADE-UPLOAD-PROJETO-DA-MUTACAO').toBeVisible()
  expect(c.erros, 'V2E-IDENTIDADE-SEM-PAGEERROR').toEqual([])
})
