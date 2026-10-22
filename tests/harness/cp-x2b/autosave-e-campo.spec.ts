/**
 * CP-X2b — o autosave recusado (422 `VETOR_INVALIDO`) e o campo de cor do `svg-path`, no Chromium, com o
 * `PageSyncWrapper` e o `ShapeControls` REAIS. Os contextos do editor são falsos (`contextos-falsos.tsx`), e o
 * "servidor" roda a mesma guarda das rotas. Bundle local do esbuild aberto por file://, rede bloqueada.
 *
 *   npx playwright test -c tests/harness/cp-x2b/playwright.config.ts
 */
import { test, expect, type Page as Aba } from '@playwright/test'
import { build } from 'esbuild'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Layer, Page } from '@/types/template'

const RAIZ = path.resolve(__dirname, '../../..')
const ETIQUETA = 'M0 0 H55 L100 45 L55 100 L0 55 Z'
let pasta = ''

test.beforeAll(async () => {
  pasta = mkdtempSync(path.join(tmpdir(), 'cpx2b-'))
  await build({
    entryPoints: [path.join(__dirname, 'entrada.tsx')],
    bundle: true,
    outfile: path.join(pasta, 'x2b.js'),
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    tsconfig: path.join(RAIZ, 'tsconfig.json'),
    logLevel: 'error',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'x2b',
        setup(b) {
          b.onResolve({ filter: /^@\/contexts\/(multi-page-context|template-editor-context)$/ }, () => ({ path: path.join(__dirname, 'contextos-falsos.tsx') }))
          b.onLoad({ filter: /components[\\/]templates[\\/]properties-panel\.tsx$/ }, (a) => ({
            contents: `${readFileSync(a.path, 'utf8')}\nexport { ShapeControls }\n`,
            loader: 'tsx',
            resolveDir: path.dirname(a.path),
          }))
        },
      },
    ],
  })
  writeFileSync(path.join(pasta, 'index.html'), '<!doctype html><meta charset="utf-8"><body><div id="editor"></div><div id="campo"></div><script src="x2b.js"></script>')
})
test.afterAll(() => {
  if (pasta) rmSync(pasta, { recursive: true, force: true })
})

const externas: string[] = []
test.beforeEach(async ({ page }) => {
  externas.length = 0
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('file:') || url.startsWith('data:')) return route.continue()
    externas.push(url)
    return route.abort()
  })
  await page.goto(pathToFileURL(path.join(pasta, 'index.html')).href)
  await page.waitForFunction(() => typeof window.__x2b?.iniciar === 'function')
})
test.afterEach(() => {
  expect(externas).toEqual([])
})

const vetor = (id: string, style: Record<string, unknown> = {}): Layer =>
  ({ id, type: 'shape', name: id, visible: true, locked: false, order: 1, position: { x: 10, y: 20 }, size: { width: 300, height: 200 }, style: { shapeType: 'svg-path', pathData: ETIQUETA, fill: '#f97316', ...style } }) as unknown as Layer
const texto = (id: string, content: string): Layer =>
  ({ id, type: 'text', name: id, visible: true, locked: false, order: 2, position: { x: 100, y: 300 }, size: { width: 800, height: 80 }, content, style: { fontSize: 40 } }) as unknown as Layer
const pagina = (id: string, order: number, name: string, layers: Layer[]): Page => ({ id, name, order, width: 1080, height: 1920, background: '#ffffff', layers, audio: null })

const INVALIDA = [texto('t', 'Sexta'), vetor('etq', { pathData: 'M0 0 Z L1 1' })]
const CORRIGIDA = [texto('t', 'Sexta'), vetor('etq', { pathData: 'M0 0 H10 V10 Z' })]

async function iniciar(aba: Aba) {
  await aba.evaluate(
    ([p1, p2]) => window.__x2b.iniciar([p1, p2], 'p1'),
    [pagina('p1', 0, 'Sexta', [texto('t', 'Sexta'), vetor('etq')]), pagina('p2', 1, 'Sábado', [texto('s', 'Sábado')])],
  )
  await aba.waitForFunction(() => typeof window.__x2b.design === 'function' && window.__x2b.design().layers.length === 2)
  await cargaAssentada(aba)
}
const envios = (aba: Aba) => aba.evaluate(() => window.__x2b.envios())
const aviso = (aba: Aba) => aba.locator('[data-aviso="vetor-recusado"]')
/**
 * Cada carga de página termina no `requestAnimationFrame` seguinte (`isSyncingRef` volta a false); o teste aguarda
 * dois quadros depois de TODA carga antes do passo seguinte. Troca ou edição feita durante a carga é um limite
 * anterior ao X2b (o efeito sai cedo e não reage quando o ref zera), registrado no relatório e fora desta suíte.
 */
const cargaAssentada = (aba: Aba) => aba.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
/** Espera o debounce (800 ms) e mais folga: o que tiver de sair, saiu. */
const assentar = (aba: Aba) => aba.waitForTimeout(1_400)

test('422 no autosave: aviso visível, o MESMO conteúdo não é reenviado em laço, e a correção grava e limpa o aviso', async ({ page }) => {
  await iniciar(page)
  await page.evaluate((l) => window.__x2b.editarCamadas(l), INVALIDA)
  await expect(aviso(page)).toContainText('Esta página NÃO foi salva')
  await expect(aviso(page)).toContainText('PATH_INVALIDO')
  await expect(aviso(page)).toContainText('Corrija ou remova a forma')
  await assentar(page)
  expect((await envios(page)).filter((e) => e.status === 422)).toHaveLength(1)
  // um re-render qualquer (mesmo conteúdo) não reenvia
  await page.evaluate((l) => window.__x2b.editarCamadas(l), INVALIDA)
  await assentar(page)
  expect((await envios(page)).filter((e) => e.status === 422)).toHaveLength(1)
  expect(await page.evaluate(() => window.__x2b.descarregar())).toMatch(/Forma vetorial inválida/)

  await page.evaluate((l) => window.__x2b.editarCamadas(l), CORRIGIDA)
  await expect(aviso(page)).toHaveCount(0)
  expect((await page.evaluate(() => window.__x2b.gravado('p1'))).layers[1].style.pathData).toBe('M0 0 H10 V10 Z')
  expect(await page.evaluate(() => window.__x2b.descarregar())).toBeNull()
})

test('422 → troca de página → volta: o pendente recusado continua recuperável e o aviso visível; Restaurar devolve a edição', async ({ page }) => {
  await iniciar(page)
  await page.evaluate((l) => window.__x2b.editarCamadas(l), INVALIDA)
  await expect(aviso(page)).toContainText('Esta página NÃO foi salva')
  await page.evaluate(() => window.__x2b.trocarPagina('p2'))
  await page.waitForFunction(() => window.__x2b.design().layers[0]?.id === 's')
  await cargaAssentada(page)
  await expect(aviso(page)).toContainText('Sexta: a última edição NÃO foi salva')
  await expect(aviso(page)).toContainText('Abra a página para restaurar')
  await page.evaluate(() => window.__x2b.trocarPagina('p1'))
  await page.waitForFunction(() => window.__x2b.design().layers[1]?.style?.pathData === 'M0 0 H55 L100 45 L55 100 L0 55 Z')
  await cargaAssentada(page)
  await expect(aviso(page)).toContainText('A tela mostra o que está gravado')
  await page.getByRole('button', { name: 'Restaurar a edição recusada' }).click()
  await page.waitForFunction(() => window.__x2b.design().layers[1]?.style?.pathData === 'M0 0 Z L1 1')
  await assentar(page)
  expect((await envios(page)).filter((e) => e.status === 422)).toHaveLength(1) // restaurar não reenvia o recusado
  await expect(aviso(page)).toContainText('Corrija ou remova a forma')
  await page.evaluate((l) => window.__x2b.editarCamadas(l), CORRIGIDA)
  await expect(aviso(page)).toHaveCount(0)
  expect((await page.evaluate(() => window.__x2b.gravado('p1'))).layers[1].style.pathData).toBe('M0 0 H10 V10 Z')
})

test('achado da revisão: depois de voltar, gravar SÓ o fundo (sobre a versão do banco) não apaga a recusa; Descartar apaga', async ({ page }) => {
  await iniciar(page)
  await page.evaluate((l) => window.__x2b.editarCamadas(l), INVALIDA)
  await expect(aviso(page)).toContainText('Esta página NÃO foi salva')
  await page.evaluate(() => window.__x2b.trocarPagina('p2'))
  await page.waitForFunction(() => window.__x2b.design().layers[0]?.id === 's')
  await cargaAssentada(page)
  await page.evaluate(() => window.__x2b.trocarPagina('p1'))
  await page.waitForFunction(() => window.__x2b.design().layers[1]?.style?.pathData === 'M0 0 H55 L100 45 L55 100 L0 55 Z')
  await cargaAssentada(page)
  await page.evaluate(() => window.__x2b.mudarFundo('#000000'))
  await page.waitForFunction(() => window.__x2b.envios().some((e) => e.status === 200 && e.campos.includes('background')))
  await assentar(page)
  expect((await page.evaluate(() => window.__x2b.gravado('p1'))).background).toBe('#000000')
  await expect(aviso(page)).toContainText('A tela mostra o que está gravado')
  await expect(page.getByRole('button', { name: 'Restaurar a edição recusada' })).toBeVisible()
  await page.getByRole('button', { name: 'Descartar a edição recusada' }).click()
  await expect(aviso(page)).toHaveCount(0)
  expect(await page.evaluate(() => window.__x2b.descarregar())).toBeNull()
})

test('recusa na TROCA de página (antes do debounce): a página que saiu fica com a recusa guardada', async ({ page }) => {
  await iniciar(page)
  await page.evaluate((l) => {
    window.__x2b.editarCamadas(l)
    window.__x2b.trocarPagina('p2')
  }, INVALIDA)
  await expect(aviso(page)).toContainText('Sexta: a última edição NÃO foi salva')
  await assentar(page)
  expect((await envios(page)).filter((e) => e.status === 422).map((e) => e.pageId)).toEqual(['p1'])
  expect((await page.evaluate(() => window.__x2b.gravado('p1'))).layers[1].style.pathData).toBe('M0 0 H55 L100 45 L55 100 L0 55 Z')
  expect(await page.evaluate(() => window.__x2b.descarregar())).toMatch(/Forma vetorial inválida/)
})

test.describe('campo de cor do svg-path (predicado lerCor)', () => {
  async function digitar(aba: Aba, campo: number, valor: string) {
    const entrada = aba.locator('#campo input:not([type])').nth(campo)
    await entrada.fill(valor)
    await entrada.press('Enter')
  }
  const forma = (shapeType: string) =>
    ({ id: 'f', type: 'shape', name: 'f', visible: true, locked: false, order: 1, position: { x: 0, y: 0 }, size: { width: 100, height: 100 }, style: { shapeType, pathData: ETIQUETA, fill: '#2563eb', strokeColor: '#1e3a8a' } }) as unknown as Layer

  test('svg-path: currentcolor e inherit NÃO são gravados (o campo volta ao salvo); #111, rgb(1 2 3) e red são', async ({ page }) => {
    await page.evaluate((l) => window.__campo.montar(l), forma('svg-path'))
    for (const recusada of ['currentcolor', 'inherit', 'CurrentColor']) {
      await digitar(page, 0, recusada)
      await expect(page.locator('#campo input:not([type])').nth(0)).toHaveValue('#2563eb')
    }
    await digitar(page, 1, 'unset')
    await expect(page.locator('#campo input:not([type])').nth(1)).toHaveValue('#1e3a8a')
    expect(await page.evaluate(() => window.__campo.gravacoes())).toEqual([])
    await digitar(page, 0, '#111')
    await digitar(page, 0, 'rgb(1 2 3)')
    await digitar(page, 1, 'red')
    expect(await page.evaluate(() => window.__campo.gravacoes())).toEqual([
      { fill: 'rgba(17, 17, 17, 1)', fillOpacity: 1 },
      { fill: 'rgba(1, 2, 3, 1)', fillOpacity: 1 },
      { strokeColor: 'red', strokeOpacity: 1 }, // nome com opacidade 1 já era gravado assim antes do X2b
    ])
  })

  test('outras formas: comportamento de antes (currentcolor continua aceito pelo CSS.supports)', async ({ page }) => {
    await page.evaluate((l) => window.__campo.montar(l), forma('rectangle'))
    await digitar(page, 0, 'currentcolor')
    const g = await page.evaluate(() => window.__campo.gravacoes())
    expect(g).toHaveLength(1)
    expect(g[0].fill).toBeTruthy()
  })
})
