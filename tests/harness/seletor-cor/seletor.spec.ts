/**
 * O seletor nativo e a paleta da marca da forma mostram os CANAIS da cor salva (`corParaSeletor`), no Chromium, com o
 * `ShapeControls` REAL. A paleta vem de um `useBrandColors` falso (só neste bundle). Hermético: bundle local do esbuild
 * aberto por file://, rede externa bloqueada.
 *
 *   npx playwright test -c tests/harness/seletor-cor/playwright.config.ts
 *
 * Controle negativo: `SELETOR_VARIANTE=base` empacota o `properties-panel.tsx` do merge `788bd261` (antes da correção,
 * via `git show`); nessa variante os testes de seletor e de paleta TÊM de falhar.
 */
import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Layer } from '@/types/template'

const RAIZ = path.resolve(__dirname, '../../..')
const BASE = '788bd261ef3b4917de5ea0a899760a65bbb84a68'
const fonteDoPainel = (arquivo: string) =>
  process.env.SELETOR_VARIANTE === 'base'
    ? execFileSync('git', ['show', `${BASE}:src/components/templates/properties-panel.tsx`], { cwd: RAIZ }).toString()
    : readFileSync(arquivo, 'utf8')
const ETIQUETA = 'M0 0 H55 L100 45 L55 100 L0 55 Z'
let pasta = ''

test.beforeAll(async () => {
  pasta = mkdtempSync(path.join(tmpdir(), 'seletor-cor-'))
  await build({
    entryPoints: [path.join(__dirname, 'entrada.tsx')],
    bundle: true,
    outfile: path.join(pasta, 'seletor.js'),
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    tsconfig: path.join(RAIZ, 'tsconfig.json'),
    logLevel: 'error',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'seletor-cor',
        setup(b) {
          b.onResolve({ filter: /^@\/(contexts\/(multi-page-context|template-editor-context)|hooks\/use-brand-colors)$/ }, () => ({ path: path.join(__dirname, 'falsos.tsx') }))
          b.onLoad({ filter: /components[\\/]templates[\\/]properties-panel\.tsx$/ }, (a) => ({
            contents: `${fonteDoPainel(a.path)}\nexport { ShapeControls }\n`,
            loader: 'tsx',
            resolveDir: path.dirname(a.path),
          }))
        },
      },
    ],
  })
  writeFileSync(path.join(pasta, 'index.html'), '<!doctype html><meta charset="utf-8"><body><div id="raiz"></div><script src="seletor.js"></script>')
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
  await page.waitForFunction(() => typeof window.__seletor?.montar === 'function')
})
test.afterEach(() => {
  expect(externas).toEqual([])
})

const forma = (style: Record<string, unknown>, id = 'f'): Layer =>
  ({ id, type: 'shape', name: id, visible: true, locked: false, order: 1, position: { x: 0, y: 0 }, size: { width: 100, height: 100 }, style: { shapeType: 'svg-path', pathData: ETIQUETA, strokeWidth: 16, ...style } }) as unknown as Layer
/** A paleta da regressão: os dois fallbacks (azuis) e as duas cores reais. */
const PALETA = [
  { id: '1', name: 'Azul fallback do preenchimento', hexCode: '#2563EB' },
  { id: '2', name: 'Laranja', hexCode: '#F97316' },
  { id: '3', name: 'Azul fallback da borda', hexCode: '#1E3A8A' },
  { id: '4', name: 'Teal', hexCode: '#0F766E' },
]
const quadros = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

test('seletores mostram os canais da cor salva (rgba), não o fallback azul', async ({ page }) => {
  await page.evaluate(([l, p]) => window.__seletor.montar(l, p), [forma({ fill: 'rgba(249, 115, 22, 1)', strokeColor: 'rgba(15, 118, 110, 1)' }), PALETA] as const)
  await page.evaluate(quadros)
  expect(await page.evaluate(() => window.__seletor.seletores())).toEqual({ preenchimento: '#f97316', borda: '#0f766e' })

  await page.evaluate(([l, p]) => window.__seletor.montar(l, p), [forma({ fill: 'hsla(120, 100%, 25%, 0.4)', strokeColor: 'rgba(17, 24, 39, 1)' }), PALETA] as const)
  await page.evaluate(quadros)
  expect(await page.evaluate(() => window.__seletor.seletores())).toEqual({ preenchimento: '#008000', borda: '#111827' })

  // alfa 0 mostra os canais; o literal transparent mostra o fallback
  await page.evaluate(([l, p]) => window.__seletor.montar(l, p), [forma({ fill: 'transparent', strokeColor: 'rgba(17, 24, 39, 0)' }), PALETA] as const)
  await page.evaluate(quadros)
  expect(await page.evaluate(() => window.__seletor.seletores())).toEqual({ preenchimento: '#2563eb', borda: '#111827' })
  expect(await page.evaluate(() => window.__seletor.chamadas())).toEqual([])
})

test('regressão da paleta: acende o swatch da cor real e NÃO o azul do fallback', async ({ page }) => {
  await page.evaluate(([l, p]) => window.__seletor.montar(l, p), [forma({ fill: 'rgba(249, 115, 22, 1)', strokeColor: 'rgba(15, 118, 110, 1)' }), PALETA] as const)
  await page.evaluate(quadros)
  expect(await page.evaluate(() => window.__seletor.ativos())).toEqual({ preenchimento: ['Laranja (#F97316)'], borda: ['Teal (#0F766E)'] })
  await page.locator('#raiz').screenshot({ path: process.env.SELETOR_SAIDA ? path.join(process.env.SELETOR_SAIDA, 'painel-teal.png') : path.join(pasta, 'painel-teal.png') })
})

test('zero escrita: montar, re-renderizar e trocar a camada não chamam setStyleValue', async ({ page }) => {
  await page.evaluate(([l, p]) => window.__seletor.montar(l, p), [forma({ fill: 'rgba(249, 115, 22, 1)', strokeColor: 'rgba(15, 118, 110, 1)' }, 'a'), PALETA] as const)
  await page.evaluate(quadros)
  await page.evaluate(() => window.__seletor.rerender())
  await page.evaluate(quadros)
  await page.evaluate((l) => window.__seletor.trocarCamada(l), forma({ fill: 'red', strokeColor: 'rgba(17, 24, 39, 0.5)' }, 'b'))
  await page.evaluate(quadros)
  expect(await page.evaluate(() => window.__seletor.seletores())).toEqual({ preenchimento: '#ff0000', borda: '#111827' })
  expect(await page.evaluate(() => window.__seletor.chamadas())).toEqual([])
})

test('seletor nativo e swatch gravam UMA vez, preservando a opacidade (50%)', async ({ page }) => {
  await page.evaluate(([l, p]) => window.__seletor.montar(l, p), [forma({ fill: 'rgba(249, 115, 22, 0.5)', strokeColor: 'rgba(15, 118, 110, 0.5)' }), PALETA] as const)
  await page.evaluate(quadros)
  expect(await page.evaluate(() => window.__seletor.seletores())).toEqual({ preenchimento: '#f97316', borda: '#0f766e' })

  await page.locator('#raiz input[type="color"]').nth(1).fill('#ff0000')
  await page.evaluate(quadros)
  expect(await page.evaluate(() => window.__seletor.chamadas())).toEqual([{ strokeColor: 'rgba(255, 0, 0, 0.5)', strokeOpacity: 1 }])
  expect((await page.evaluate(() => window.__seletor.seletores())).borda).toBe('#ff0000')

  await page.getByRole('button', { name: 'Aplicar cor Azul fallback da borda' }).nth(1).click()
  await page.evaluate(quadros)
  expect(await page.evaluate(() => window.__seletor.chamadas())).toEqual([
    { strokeColor: 'rgba(255, 0, 0, 0.5)', strokeOpacity: 1 },
    { strokeColor: 'rgba(30, 58, 138, 0.5)', strokeOpacity: 1 },
  ])

  await page.getByRole('button', { name: 'Aplicar cor Teal' }).first().click()
  await page.evaluate(quadros)
  expect((await page.evaluate(() => window.__seletor.chamadas())).at(-1)).toEqual({ fill: 'rgba(15, 118, 110, 0.5)', fillOpacity: 1 })
})
