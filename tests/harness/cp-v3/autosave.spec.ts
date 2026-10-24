/**
 * H11 do CP-V3: o Reaplicar passa pelo AUTOSAVE real. Monta o `MultiPageProvider`, o `TemplateEditorProvider`, o
 * `PageSyncWrapper` (fila + PATCH) e o `ShapeControls` reais, com o `QueryProvider` e os hooks reais da marca; a API é o
 * `ServidorFalso` do V2d (Node, `page.route` numa origem falsa, a guarda de vetor e a canonização da rota real). Prova:
 * PATCH 200 com a cor nova, o `vetor` (papéis) e o `metadata` intactos; o no-op não gera PATCH; o reload (GET de novo)
 * devolve o estado gravado. Não prova: banco, Clerk, Blob, canvas Konva, ⌘Z de teclado, Vercel.
 *
 *   npx playwright test -c tests/harness/cp-v3/playwright.autosave.config.ts
 */
import { test, expect, type Page } from '@playwright/test'
import { build } from 'esbuild'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ORIGEM, ServidorFalso, type PaginaGravada } from '../cp-v2d/servidor'
import type { Layer } from '@/types/template'

const RAIZ = path.resolve(__dirname, '../../..')
let pasta = ''
test.beforeAll(async () => {
  pasta = mkdtempSync(path.join(tmpdir(), 'cp-v3-autosave-'))
  await build({
    entryPoints: [path.join(__dirname, 'autosave-entrada.tsx')],
    bundle: true,
    outfile: path.join(pasta, 'as.js'),
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    tsconfig: path.join(RAIZ, 'tsconfig.json'),
    logLevel: 'error',
    loader: { '.css': 'empty', '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'cp-v3-autosave',
        setup(b) {
          b.onLoad({ filter: /components[\\/]templates[\\/]properties-panel\.tsx$/ }, (a) => ({
            contents: `${readFileSync(a.path, 'utf8')}\nexport { ShapeControls }\n`,
            loader: 'tsx',
            resolveDir: path.dirname(a.path),
          }))
        },
      },
    ],
  })
})
test.afterAll(() => {
  if (pasta) rmSync(pasta, { recursive: true, force: true })
})

const PATH = 'M50 0 L61 39 L100 50 L61 61 L50 100 L39 61 L0 50 L39 39 Z'
const VETOR = { asset: { id: 'spark-4', versao: 1 }, papeis: { preenchimento: 'destaque' } }
const METADATA = { slot: 'acento', compositor: { origem: 'harness-cp-v3' } }
const F = {
  id: 'f', type: 'shape', name: 'f', visible: true, locked: false, order: 0, position: { x: 10, y: 20 }, size: { width: 100, height: 100 },
  style: { shapeType: 'svg-path', pathData: PATH, fill: 'rgba(250, 87, 1, 0.5)', opacity: 1, fillOpacity: 1, strokeOpacity: 1, vetor: VETOR },
  metadata: METADATA,
}
const pagina = (): PaginaGravada => ({
  id: 'pg1', name: 'Página 1', width: 1080, height: 1920, layers: [F], background: '#ffffff', order: 0,
  thumbnail: 'data:image/png;base64,iVBORw0KGgo=', templateId: 538, isTemplate: false, templateName: null,
})
const TEMPLATE = { id: 538, name: 'Modelo 538', type: 'STORY', dimensions: '1080x1920', projectId: 8, dynamicFields: [], designData: { canvas: { width: 1080, height: 1920, backgroundColor: '#ffffff' }, layers: [] } }
const cores = (lista: Array<[number, string, string]>) => ({ tipo: 'json' as const, corpo: lista.map(([id, name, hexCode]) => ({ id, name, hexCode, projectId: 8 })) })
const projeto = (destaque: string) => ({ tipo: 'json' as const, corpo: { id: 8, name: 'P8', assinatura: { destaque: { fill: destaque } } } })

const doisQuadros = (aba: Page) => aba.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
async function assentar(aba: Page, srv: ServidorFalso) {
  for (let i = 0; i < 15; i++) {
    const n = srv.patches.length
    await doisQuadros(aba)
    await aba.waitForTimeout(900)
    if (srv.patches.length === n) return
  }
  throw new Error('[INFRA] a página não assentou (PATCH contínuo)')
}
async function abrir(aba: Page, srv: ServidorFalso) {
  await aba.goto(`${ORIGEM}/`)
  await aba.waitForFunction(() => typeof window.__asAbrir === 'function')
  await aba.evaluate((t) => window.__asAbrir(t as never, 'pg1'), TEMPLATE)
  await aba.waitForFunction(() => window.__as?.paginaAtual === 'pg1' && window.__as.editor.design.layers.some((l) => l.id === 'f'))
  await assentar(aba, srv)
}
const camadaF = (aba: Page) => aba.evaluate(() => window.__as!.editor.design.layers.find((l) => l.id === 'f') as Layer)

test('H11 Reaplicar pelo autosave real: PATCH 200 com a cor, o vetor e o metadata; no-op sem PATCH; reload mantém', async ({ page }) => {
  const srv = new ServidorFalso()
  srv.projetos.set(8, { cores: cores([[1, 'Preto', '#0b0b0b'], [2, 'Laranja', '#FA5701']]), projeto: projeto('#fa5701'), elementos: { tipo: 'json', corpo: [] } })
  srv.paginas.set(538, [pagina()])
  srv.servirArquivo('/', 'text/html', Buffer.from('<!doctype html><meta charset="utf-8"><body><div id="app"></div><script src="/as.js"></script>'))
  srv.servirArquivo('/as.js', 'application/javascript', path.join(pasta, 'as.js'))
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(String(e)))
  await srv.ligar(page)
  await abrir(page, srv)
  const patchesDaCarga = srv.patches.length

  await page.evaluate(() => window.__as!.editor.selectLayer('f'))
  await doisQuadros(page)
  // a marca muda "no servidor": destaque teal
  srv.projetos.set(8, { cores: cores([[1, 'Preto', '#0b0b0b'], [7, 'Teal', '#0F766E']]), projeto: projeto('#0f766e'), elementos: { tipo: 'json', corpo: [] } })
  const leiturasAntes = { cores: srv.leituras.get('cores:8') ?? 0, projeto: srv.leituras.get('projeto:8') ?? 0 }
  await page.getByRole('button', { name: 'Reaplicar cores da marca' }).click()
  await expect(page.locator('[data-aviso-reaplicar="feito"]'), '[H11] o Reaplicar terminou').toContainText('Cores da marca reaplicadas.')
  expect(srv.leituras.get('cores:8'), '[H11] releu a paleta pela API').toBe(leiturasAntes.cores + 1)
  expect(srv.leituras.get('projeto:8'), '[H11] releu o projeto pela API').toBe(leiturasAntes.projeto + 1)
  await expect.poll(() => srv.patchesDesde(patchesDaCarga, 'camadas').length, { message: '[H11] o autosave gravou as camadas', timeout: 15_000 }).toBeGreaterThanOrEqual(1)
  await assentar(page, srv)
  const camadas = srv.patchesDesde(patchesDaCarga, 'camadas')
  expect(camadas.every((p) => p.status === 200 && p.pageId === 'pg1'), '[H11] PATCH 200 na página certa').toBe(true)
  const gravada = (camadas.at(-1)!.layers as Layer[]).find((l) => l.id === 'f')!
  expect(gravada.style?.fill, '[H11] cor nova com o alfa exato').toBe('rgba(15, 118, 110, 0.5)')
  expect(gravada.style?.vetor, '[H11] vetor e papéis intactos').toEqual(VETOR)
  expect((gravada as unknown as { metadata: unknown }).metadata, '[H11] metadata intacto').toEqual(METADATA)
  expect([gravada.style?.pathData, gravada.position, gravada.size], '[H11] desenho e caixa intactos').toEqual([PATH, F.position, F.size])
  expect(srv.patchesDesde(patchesDaCarga).filter((p) => p.status !== 200), '[H11] nenhum PATCH recusado').toEqual([])

  // no-op: a marca não mudou de novo → nenhum PATCH
  const antesDoNoop = srv.patches.length
  await page.getByRole('button', { name: 'Reaplicar cores da marca' }).click()
  await expect(page.locator('[data-aviso-reaplicar="feito"]'), '[H11] no-op terminou').toContainText('Nada mudou.')
  await assentar(page, srv)
  expect(srv.patchesDesde(antesDoNoop), '[H11] no-op sem PATCH').toEqual([])

  // reload: o GET devolve o que foi gravado
  const getsAntes = srv.leituras.get('paginas:538') ?? 0
  await page.reload()
  await abrir(page, srv)
  expect(srv.leituras.get('paginas:538') ?? 0, '[H11] o reload leu as páginas de novo').toBeGreaterThan(getsAntes)
  const recarregada = await camadaF(page)
  expect(recarregada.style?.fill, '[H11] reload: cor gravada').toBe('rgba(15, 118, 110, 0.5)')
  expect(recarregada.style?.vetor, '[H11] reload: vetor').toEqual(VETOR)
  expect((recarregada as unknown as { metadata: unknown }).metadata, '[H11] reload: metadata').toEqual(METADATA)

  expect(erros, '[INFRA] erro na página').toEqual([])
  expect(srv.externas, '[INFRA] rede externa').toEqual([])
  expect(srv.desconhecidas, '[INFRA] rota fora do harness').toEqual([])
  test.info().annotations.push({ type: 'patches', description: JSON.stringify(srv.patches.map((p) => ({ pageId: p.pageId, classe: p.classe, status: p.status }))) })
})
