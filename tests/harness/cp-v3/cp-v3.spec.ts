/**
 * Harness do CP-V3 (cores por slot da forma), no Chromium, com o `TemplateEditorProvider` e o `ShapeControls` REAIS.
 * Falsos: só a rede da marca (paleta estrita, projeto) e a página multipágina (`falsos.tsx`). Hermético: bundle local
 * do esbuild aberto por file://, rede externa bloqueada. Desfazer pelo `undo()` do contexto; o canvas Konva, o ⌘Z de
 * teclado, o autosave e o banco NÃO entram.
 *
 *   npx playwright test -c tests/harness/cp-v3/playwright.config.ts
 *
 * Controles negativos: `CP3_VARIANTE=M1…M11` troca um trecho da fonte no bundle (cada troca tem de aplicar exatamente
 * as vezes declaradas, senão o bundle falha = execução INVÁLIDA). Cada asserção leva a etiqueta `[Hx]`/`[Px]` da falha
 * semântica que o controle deve provocar (`VARIANTES` abaixo e `classificar-controles.mjs`).
 */
import { test, expect, type Page } from '@playwright/test'
import { build } from 'esbuild'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import type { Layer } from '@/types/template'

const RAIZ = path.resolve(__dirname, '../../..')
type Arquivo = 'painel' | 'cores'
type Troca = [Arquivo, string, string, number?]
/** Os controles negativos: o que cada um troca e as falhas semânticas que TEM de provocar. */
export const VARIANTES: Record<string, { trocas: Troca[]; esperadas: string[] }> = {
  /** Controle do CLASSIFICADOR: troca que não existe na fonte → o bundle recusa → execução INVÁLIDA, nunca sensibilidade. */
  M0: { trocas: [['painel', 'TRECHO QUE NAO EXISTE NA FONTE', '']], esperadas: ['H1'] },
  M1: {
    trocas: [['cores', "  const lida = lerCor(valorSalvo)\n  return !!lida && lida !== 'transparente' && lida.hex === hex\n", "  return typeof valorSalvo === 'string' && valorSalvo.trim().toUpperCase() === hex.toUpperCase()\n"]],
    esperadas: ['H2a', 'H2b'],
  },
  M2: {
    trocas: [['painel', "valor={layer.style?.fill} onSelect={(hex) => escolher('preenchimento', hex)}", "valor={corParaSeletor(layer.style?.fill, '#2563eb')} onSelect={(hex) => escolher('preenchimento', hex)}"]],
    esperadas: ['H2c'],
  },
  M3: {
    trocas: [['cores', '    const hex = hexValido(c.hexCode)\n', "    const hex = typeof c.hexCode === 'string' ? c.hexCode.trim() : null\n"]],
    esperadas: ['H2e'],
  },
  M4: {
    trocas: [
      ['painel', "import { useBrandColorsEstrita } from '@/hooks/use-brand-colors'\n", "import { useBrandColors, useBrandColorsEstrita } from '@/hooks/use-brand-colors'\n"],
      ['painel', '  const consultaDaPaleta = useBrandColorsEstrita(editor.projectId)\n', "  const naoEstrita = useBrandColors(editor.projectId) as any\n  const consultaDaPaleta = { ...naoEstrita, data: naoEstrita.status === 'success' ? { projectId: editor.projectId, cores: naoEstrita.data } : undefined } as any\n"],
    ],
    esperadas: ['H2d'],
  },
  M5: { trocas: [['cores', '  if (r.style === camada.style) return camada\n', '']], esperadas: ['H4b', 'P5'] },
  M6: {
    trocas: [['cores', 'resolverCorDaMarca(p.papel, marca).hex, lida.alfa, FALLBACK[canal])', "resolverCorDaMarca(p.papel, marca).hex, lida.alfa * (typeof style?.opacity === 'number' ? style.opacity : 1), FALLBACK[canal])"]],
    esperadas: ['P6'],
  },
  M7: { trocas: [['painel', '{ coalesceKey: `reaplicar:${op}` }', '{ coalesceKey: `layer:${alvo.layerId}` }']], esperadas: ['H5'] },
  M8: { trocas: [['painel', ': paleta.refetch(),', ': Promise.resolve(paleta),'], ['painel', ': projeto.refetch(),', ': Promise.resolve(projeto),']], esperadas: ['H6b', 'H6c'] },
  M9: {
    trocas: [['cores', "  return (\n    agora.montado &&\n    agora.token === alvo.token &&\n    agora.projectId === alvo.projectId &&\n    agora.templateId === alvo.templateId &&\n    agora.pageId === alvo.pageId &&\n    agora.geracao === alvo.geracao &&\n    agora.selecao.length === 1 &&\n    agora.selecao[0] === alvo.layerId\n  )\n", '  return agora.pageId === alvo.pageId\n']],
    esperadas: ['H7a', 'H7c', 'H7d', 'H7e'],
  },
  M10: {
    trocas: [['cores', '  return (camada) => (camada.id === alvo.layerId && alvoValido(alvo, lerSituacao()) ? reaplicarNaCamada(camada, marca) : camada)', '  return (camada) => (camada.id === alvo.layerId ? reaplicarNaCamada(camada, marca) : camada)']],
    esperadas: ['P10'],
  },
  M11: { trocas: [['painel', '    if (emVooRef.current?.token === tokenRef.current) return\n', '']], esperadas: ['H8'] },
  /** O aviso volta a valer só pela chave (sem o token) e não é descartado na troca: A → B → A o ressuscita. */
  M12: {
    trocas: [
      ['painel', '  const visivel = operacao && operacao.chave === chave && operacao.token === tokenRef.current ? operacao : null', '  const visivel = operacao && operacao.chave === chave ? operacao : null'],
      ['painel', '    emVooRef.current = null\n    setOperacao(null)\n  }, [chave])', '  }, [chave])'],
    ],
    esperadas: ['H12'],
  },
  /** O "Tentar de novo" relê as duas consultas, descartando a que voltou boa. */
  M13: { trocas: [['painel', '    void executar(visivel.alvo, visivel.op, visivel.confirmadas)', '    void executar(visivel.alvo, visivel.op, {})']], esperadas: ['H13'] },
}
const VARIANTE = process.env.CP3_VARIANTE ?? 'cp3'

function aplicar(arquivo: Arquivo, fonte: string): string {
  const v = VARIANTES[VARIANTE]
  if (VARIANTE !== 'cp3' && !v) throw new Error(`variante desconhecida: ${VARIANTE}`)
  let saida = fonte
  for (const [alvo, de, para, vezes = 1] of v?.trocas ?? []) {
    if (alvo !== arquivo) continue
    const n = saida.split(de).length - 1
    if (n !== vezes) throw new Error(`[INVALIDA] variante ${VARIANTE} não aplicou (${n}× em vez de ${vezes}×): ${de.slice(0, 70)}`)
    saida = saida.split(de).join(para)
  }
  return saida
}

let pasta = ''
test.beforeAll(async () => {
  pasta = mkdtempSync(path.join(tmpdir(), 'cp-v3-'))
  await build({
    entryPoints: [path.join(__dirname, 'entrada.tsx')],
    bundle: true,
    outfile: path.join(pasta, 'cp3.js'),
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    tsconfig: path.join(RAIZ, 'tsconfig.json'),
    logLevel: 'error',
    loader: { '.css': 'empty', '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'cp-v3',
        setup(b) {
          b.onResolve({ filter: /^@\/(contexts\/multi-page-context|hooks\/use-brand-colors|hooks\/use-project)$/ }, () => ({ path: path.join(__dirname, 'falsos.tsx') }))
          b.onLoad({ filter: /components[\\/]templates[\\/]properties-panel\.tsx$/ }, (a) => ({
            contents: `${aplicar('painel', readFileSync(a.path, 'utf8'))}\nexport { ShapeControls }\n`,
            loader: 'tsx',
            resolveDir: path.dirname(a.path),
          }))
          b.onLoad({ filter: /lib[\\/]editor[\\/]cores-da-forma\.ts$/ }, (a) => ({ contents: aplicar('cores', readFileSync(a.path, 'utf8')), loader: 'ts', resolveDir: path.dirname(a.path) }))
        },
      },
    ],
  })
  const globais = path.join(RAIZ, 'src/app/globals.css')
  const css = await postcss([tailwind({ base: RAIZ })]).process(readFileSync(globais, 'utf8'), { from: globais })
  writeFileSync(path.join(pasta, 'cp3.css'), css.css)
  writeFileSync(path.join(pasta, 'index.html'), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="cp3.css"><body style="width:320px;padding:12px"><div id="raiz"></div><script src="cp3.js"></script>')
})
test.afterAll(() => {
  if (pasta) rmSync(pasta, { recursive: true, force: true })
})

const externas: string[] = []
const errosDaPagina: string[] = []
test.beforeEach(async ({ page }) => {
  externas.length = 0
  errosDaPagina.length = 0
  page.on('pageerror', (e) => errosDaPagina.push(String(e)))
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('file:') || url.startsWith('data:')) return route.continue()
    externas.push(url)
    return route.abort()
  })
  await page.goto(pathToFileURL(path.join(pasta, 'index.html')).href)
  await page.waitForFunction(() => typeof window.__cp3?.montar === 'function')
})
test.afterEach(() => {
  expect(externas, '[INFRA] rede externa').toEqual([])
  expect(errosDaPagina, '[INFRA] erro na página').toEqual([])
})

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────────────────────────────
const PATH = 'M50 0 L61 39 L100 50 L61 61 L50 100 L39 61 L0 50 L39 39 Z'
const forma = (id: string, style: Record<string, unknown>): Layer =>
  ({ id, type: 'shape', name: id, visible: true, locked: false, order: 1, position: { x: 0, y: 0 }, size: { width: 100, height: 100 }, style }) as unknown as Layer
const svg = (id: string, style: Record<string, unknown>) => forma(id, { shapeType: 'svg-path', pathData: PATH, ...style })
const CAMADAS_A: Layer[] = [
  svg('f', { fill: 'rgba(250, 87, 1, 0.5)', vetor: { asset: { id: 'spark-4', versao: 1 }, papeis: { preenchimento: 'destaque' } } }),
  svg('d', { fill: 'rgba(250, 87, 1, 1)', strokeColor: 'rgba(11, 11, 11, 1)', strokeWidth: 3, vetor: { asset: { id: 'duplo', versao: 1 }, papeis: { preenchimento: 'destaque', contorno: 'texto' } } }),
  forma('m', { shapeType: 'rectangle', fill: 'transparent', strokeColor: 'rgba(11, 11, 11, 1)', strokeWidth: 2, vetor: { asset: { id: 'moldura-fina', versao: 1 }, papeis: { contorno: 'texto' } } }),
  svg('n', { fill: '#fa5701', opacity: 0.5, vetor: { asset: { id: 'spark-4', versao: 1 }, papeis: { preenchimento: 'destaque' } } }),
  forma('p', { shapeType: 'rounded-rectangle', fill: 'transparent', strokeColor: 'rgba(11, 11, 11, 1)', strokeWidth: 2, border: { width: 0, color: 'transparent', radius: 9999 }, vetor: { asset: { id: 'pilula-contorno', versao: 1 }, papeis: { contorno: 'texto' } } }),
  forma('fio', { shapeType: 'line', fill: 'rgba(11, 11, 11, 1)', strokeWidth: 2, vetor: { asset: { id: 'fio-fino', versao: 1 }, papeis: { preenchimento: 'texto' } } }),
  forma('g', { shapeType: 'circle', fill: '#2563eb' }),
  forma('b', { shapeType: 'rectangle', fill: 'rgba(255, 255, 255, 1)' }),
  { id: 't', type: 'text', name: 't', visible: true, locked: false, order: 2, position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, content: 'oi', style: { color: '#0F766E' } } as unknown as Layer,
]
const template = (id: number, projectId: number, layers: Layer[]) => ({
  id, name: `T${id}`, type: 'STORY', dimensions: '1080x1920', projectId, dynamicFields: [],
  designData: { canvas: { width: 1080, height: 1920, backgroundColor: '#ABCDEF' }, layers },
})
const PALETA_8 = [
  { id: 1, name: 'Preto', hexCode: '#0b0b0b', projectId: 8 },
  { id: 2, name: 'Laranja', hexCode: '#FA5701', projectId: 8 },
  { id: 3, name: 'Azul fallback', hexCode: '#2563EB', projectId: 8 },
  { id: 4, name: 'Branco curto', hexCode: '#FFF', projectId: 8 },
  { id: 5, name: 'Contexto', hexCode: 'currentcolor', projectId: 8 },
  { id: 6, name: 'Cinco', hexCode: '#12345', projectId: 8 },
]
/** A marca depois de "mudar a paleta": escuro #222222 (nome Preto) e destaque teal. */
const PALETA_NOVA = [
  { id: 1, name: 'Preto', hexCode: '#222222', projectId: 8 },
  { id: 7, name: 'Teal', hexCode: '#0F766E', projectId: 8 },
]
const marca = (cores = PALETA_8, destaque = '#fa5701') => ({ paleta: { modo: 'ok' as const, cores }, projeto: { modo: 'ok' as const, assinatura: { destaque: { fill: destaque } } } })

async function quadros(page: Page) {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
}
async function montar(page: Page, opcoes: { layers?: Layer[]; pagina?: string | null; prender?: boolean } = {}) {
  await page.evaluate(
    ([t, o]) => window.__cp3.montar(t as never, { marca: { 8: o.marca, 9: o.marca9 } as never, prender: o.prender, pagina: o.pagina ? { modo: 'multi', currentPageId: o.pagina } : null }),
    [template(538, 8, opcoes.layers ?? CAMADAS_A), { marca: marca(), marca9: marca(PALETA_8.map((c) => ({ ...c, projectId: 9 }))), prender: opcoes.prender ?? false, pagina: opcoes.pagina ?? null }] as const,
  )
  await quadros(page)
}
async function selecionar(page: Page, id: string | null) {
  await page.evaluate((i) => (i ? window.__cp3.editor().selectLayer(i) : window.__cp3.editor().clearLayerSelection()), id)
  await quadros(page)
}
const camada = (page: Page, id: string) => page.evaluate((i) => window.__cp3.editor().design.layers.find((l) => l.id === i) ?? null, id)
const camadas = (page: Page) => page.evaluate(() => JSON.stringify(window.__cp3.editor().design.layers))
const swatch = (page: Page, nome: string, canal: 0 | 1) => page.getByRole('button', { name: `Aplicar cor ${nome}`, exact: true }).nth(canal)
const botaoReaplicar = (page: Page) => page.getByRole('button', { name: 'Reaplicar cores da marca' })
/** A marca muda no "servidor"; com `tela`, a tela também já mostra a paleta nova (sem contar como releitura). */
async function mudarMarca(page: Page, tela = false) {
  await page.evaluate(([c, t]) => {
    window.__falsos.marca[8] = { paleta: { modo: 'ok', cores: c as never }, projeto: { modo: 'ok', assinatura: { destaque: { fill: '#0f766e' } } } }
    if (t) window.__cp3.recarregarTela()
  }, [PALETA_NOVA, tela] as const)
  await quadros(page)
}
async function contarDesfazeres(page: Page): Promise<number> {
  let n = 0
  while (await page.evaluate(() => window.__cp3.editor().canUndo)) {
    await page.evaluate(() => window.__cp3.editor().undo())
    await quadros(page)
    n += 1
    if (n > 20) break
  }
  return n
}
const tiraRaiz = async (page: Page, nome: string) => {
  if (process.env.CP3_SAIDA) await page.locator('#raiz').screenshot({ path: path.join(process.env.CP3_SAIDA, `${nome}.png`) })
}
const papeisDe = async (page: Page, id: string) => ((await camada(page, id))?.style as { vetor?: { papeis?: unknown } } | undefined)?.vetor?.papeis ?? null

// ── H1–H3: elo e fileiras ───────────────────────────────────────────────────────────────────────────────────────────
test('H1 elo por canal: some no gesto explícito, fica com Esc/inválido/slider; um desfazer isolado devolve cor e papel; legado sem elo', async ({ page }) => {
  await montar(page)
  await selecionar(page, 'f')
  await expect(page.locator('[data-elo="preenchimento"]'), '[H1] elo do preenchimento').toHaveText('Acompanha a marca: Destaque')
  expect(await page.locator('[data-elo="preenchimento"]').getAttribute('title'), '[H1] dica do Reaplicar').toContain('Reaplicar cores da marca')
  await tiraRaiz(page, 'h1-elo-e-reaplicar')
  const campo = page.locator('#raiz input[type="color"]').nth(0).locator('xpath=preceding-sibling::input')
  await campo.fill('banana')
  await campo.press('Escape')
  await campo.fill('banana')
  await campo.blur()
  await page.locator('#raiz input[type="range"]').first().fill('40')
  await quadros(page)
  expect(await papeisDe(page, 'f'), '[H1] Esc, inválido e slider não tiram o papel').toEqual({ preenchimento: 'destaque' })
  await page.waitForTimeout(900)
  const antes = await camadas(page)
  await swatch(page, 'Preto', 0).click()
  await quadros(page)
  expect((await camada(page, 'f'))?.style?.fill, '[H1] swatch grava o hex canônico com a transparência do canal').toBe('rgba(11, 11, 11, 0.4)')
  expect(await papeisDe(page, 'f'), '[H1] escolha explícita tira o papel').toBeNull()
  await expect(page.locator('[data-elo="preenchimento"]'), '[H1] elo some').toHaveCount(0)
  await page.evaluate(() => window.__cp3.editor().undo())
  await quadros(page)
  expect(await camadas(page), '[H1] um desfazer devolve cor e papel').toBe(antes)
  // campo confirmado também tira o papel
  await page.waitForTimeout(900)
  await campo.fill('#123456')
  await campo.press('Enter')
  await quadros(page)
  expect(await papeisDe(page, 'f'), '[H1] campo confirmado tira o papel').toBeNull()
  await selecionar(page, 'g')
  await expect(page.locator('[data-elo]'), '[H1] legado sem elo').toHaveCount(0)
  await expect(botaoReaplicar(page), '[H1] legado sem Reaplicar').toHaveCount(0)
})

test('H2a ativo por lerCor com rgba de qualquer alfa', async ({ page }) => {
  await montar(page)
  await selecionar(page, 'f') // rgba(250, 87, 1, 0.5)
  await expect(swatch(page, 'Laranja', 0).locator('span'), '[H2a] Laranja aceso com rgba 0,5').toHaveCount(2)
  await expect(swatch(page, 'Preto', 0).locator('span'), '[H2a] Preto apagado').toHaveCount(0)
})
test('H2b ativo #FFF × rgba(255, 255, 255, 1)', async ({ page }) => {
  await montar(page)
  await selecionar(page, 'b')
  await expect(swatch(page, 'Branco curto', 0).locator('span'), '[H2b] #FFF aceso').toHaveCount(2)
})
test('H2c sem cor nada acende (nem o swatch do fallback)', async ({ page }) => {
  await montar(page)
  await selecionar(page, 'm') // fill transparent
  await expect(swatch(page, 'Azul fallback', 0).locator('span'), '[H2c] fallback não acende com transparent').toHaveCount(0)
})
test('H2d paleta em erro (HTML 200) e carregando: mensagem, sem swatch, nunca "sem cores"', async ({ page }) => {
  await montar(page)
  await page.evaluate(() => { window.__falsos.marca[8].paleta.modo = 'html' })
  await page.evaluate(() => window.__cp3.recarregarTela())
  await selecionar(page, 'f')
  await expect(page.locator('[data-paleta-da-forma="erro"]'), '[H2d] HTML 200 é erro na fileira Marca').toHaveCount(1)
  await expect(page.getByRole('button', { name: /^Aplicar cor / }), '[H2d] sem swatch no erro').toHaveCount(0)
  await expect(page.locator('[data-paleta-da-forma="vazia"]'), '[H2d] erro nunca vira "sem cores"').toHaveCount(0)
  await page.evaluate(() => { window.__falsos.marca[8].paleta.modo = 'pendente' })
  await page.evaluate(() => window.__cp3.recarregarTela())
  await expect(page.locator('[data-paleta-da-forma="carregando"]'), '[H2d] carregando').toHaveCount(1)
})
test('H2e itens inválidos fora da fileira, contados; o clique grava o hex canônico', async ({ page }) => {
  await montar(page)
  await selecionar(page, 'g')
  await expect(page.getByRole('button', { name: 'Aplicar cor Contexto', exact: true }), '[H2e] currentcolor não vira swatch').toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Aplicar cor Cinco', exact: true }), '[H2e] #12345 não vira swatch').toHaveCount(0)
  await expect(page.locator('[data-paleta-da-forma="ignoradas"]'), '[H2e] aviso dos ignorados').toHaveText('2 cores da paleta ignoradas: hex inválido.')
  await swatch(page, 'Laranja', 0).click()
  await quadros(page)
  expect((await camada(page, 'g'))?.style?.fill, '[H2e] hex canônico').toBe('rgba(250, 87, 1, 1)')
})
test('H3 Nesta página: cores da página sem a paleta; o clique é escolha explícita', async ({ page }) => {
  await montar(page)
  await selecionar(page, 'f')
  // forma, texto e fundo, sem o que está na paleta aplicável (#fa5701, #0b0b0b, #2563eb, #ffffff)
  const titulos = await page.locator('[data-nesta-pagina]').first().locator('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('title')))
  expect(titulos, '[H3] cores da página sem a paleta, sem repetir').toEqual(['#0f766e', '#abcdef'])
  await page.getByRole('button', { name: 'Usar #0f766e desta página' }).first().click()
  await quadros(page)
  expect((await camada(page, 'f'))?.style?.fill, '[H3] aplica com a transparência').toBe('rgba(15, 118, 110, 0.5)')
  expect(await papeisDe(page, 'f'), '[H3] tira o papel').toBeNull()
})

// ── H4–H6: Reaplicar ────────────────────────────────────────────────────────────────────────────────────────────────
test('H4 Reaplicar com mudança: cor nova com o alfa exato, 1 desfazer → deep equal, refazer', async ({ page }) => {
  await montar(page)
  await selecionar(page, 'f')
  await mudarMarca(page)
  const antes = await camadas(page)
  await botaoReaplicar(page).click()
  await expect(page.locator('[data-aviso-reaplicar="feito"]'), '[H4] aviso').toContainText('Cores da marca reaplicadas.')
  expect((await camada(page, 'f'))?.style?.fill, '[H4] cor nova, alfa 0,5').toBe('rgba(15, 118, 110, 0.5)')
  expect(await papeisDe(page, 'f'), '[H4] papel continua').toEqual({ preenchimento: 'destaque' })
  await tiraRaiz(page, 'h4-reaplicado')
  await page.evaluate(() => window.__cp3.editor().undo())
  await quadros(page)
  expect(await camadas(page), '[H4] um desfazer volta igual').toBe(antes)
  expect(await page.evaluate(() => window.__cp3.editor().canUndo), '[H4] uma entrada só').toBe(false)
  await page.evaluate(() => window.__cp3.editor().redo())
  await quadros(page)
  expect((await camada(page, 'f'))?.style?.fill, '[H4] refazer reaplica').toBe('rgba(15, 118, 110, 0.5)')
})
test('H4b Reaplicar sem mudança (canônica e NÃO canônica): mesma camada, 0 desfazer, dirty intacto', async ({ page }) => {
  await montar(page)
  for (const id of ['f', 'n']) {
    await selecionar(page, id)
    const antes = await camadas(page)
    await botaoReaplicar(page).click()
    await expect(page.locator('[data-aviso-reaplicar="feito"]'), `[H4b] aviso ${id}`).toContainText('Nada mudou.')
    expect(await camadas(page), `[H4b] ${id} igual, sem normalizar`).toBe(antes)
    expect(await page.evaluate(() => window.__cp3.editor().canUndo), `[H4b] ${id} sem entrada de desfazer`).toBe(false)
    expect(await page.evaluate(() => window.__cp3.editor().dirty), `[H4b] ${id} sem dirty`).toBe(false)
  }
})
test('H5 Reaplicar tem entrada própria: swatch < 800 ms antes e depois → 3 entradas', async ({ page }) => {
  await montar(page)
  await selecionar(page, 'd')
  await mudarMarca(page, true)
  await swatch(page, 'Teal', 1).click() // tira o papel do contorno
  await botaoReaplicar(page).click()
  await expect(page.locator('[data-aviso-reaplicar="feito"]')).toHaveCount(1)
  await swatch(page, 'Preto', 1).click()
  await quadros(page)
  expect((await camada(page, 'd'))?.style?.fill, '[H5] preenchimento reaplicado').toBe('rgba(15, 118, 110, 1)')
  expect(await contarDesfazeres(page), '[H5] três entradas').toBe(3)
})
test('H6a releitura lenta: nada é gravado enquanto espera', async ({ page }) => {
  await montar(page, { prender: true })
  await selecionar(page, 'f')
  await mudarMarca(page)
  const antes = await camadas(page)
  await botaoReaplicar(page).click()
  await expect(page.locator('[data-aviso-reaplicar="em-voo"]'), '[H6a] em voo').toHaveCount(1)
  expect(await camadas(page), '[H6a] nada gravado na espera').toBe(antes)
  expect(await page.evaluate(() => window.__cp3.soltarReleituras()), '[H6a] duas releituras presas').toBe(2)
  await expect(page.locator('[data-aviso-reaplicar="feito"]')).toHaveCount(1)
  expect((await camada(page, 'f'))?.style?.fill, '[H6a] grava depois de soltar').toBe('rgba(15, 118, 110, 0.5)')
})
test('H6b erro na releitura (500, HTML 200, sem hexCode, projeto sem assinatura, projeto 500): 0 escrita, "Tentar de novo"', async ({ page }) => {
  for (const [onde, modo] of [['paleta', 'erro'], ['paleta', 'html'], ['paleta', 'sem-hex'], ['projeto', 'sem-assinatura'], ['projeto', 'erro']] as const) {
    await montar(page)
    await selecionar(page, 'f')
    await page.evaluate(([o, m]) => { (window.__falsos.marca[8] as unknown as Record<string, { modo: string }>)[o].modo = m }, [onde, modo] as const)
    const antes = await camadas(page)
    await botaoReaplicar(page).click()
    await expect(page.locator('[data-aviso-reaplicar="erro"]'), `[H6b] ${onde} ${modo}: erro`).toHaveCount(1)
    await expect(page.locator('[data-tentar-reaplicar]'), `[H6b] ${onde} ${modo}: tentar de novo`).toBeVisible()
    expect(await camadas(page), `[H6b] ${onde} ${modo}: 0 escrita`).toBe(antes)
    expect(await page.evaluate(() => window.__cp3.editor().canUndo), `[H6b] ${onde} ${modo}: 0 desfazer`).toBe(false)
  }
})
test('H6c releitura falha com o cache BOM: não usa o cache, 0 escrita', async ({ page }) => {
  await montar(page)
  await selecionar(page, 'f')
  // o cache da tela é BOM e já tem a marca nova (teal ≠ a cor da camada); depois a releitura da paleta falha
  await mudarMarca(page, true)
  await page.evaluate(() => { window.__falsos.marca[8].paleta.modo = 'erro' })
  const antes = await camadas(page)
  await botaoReaplicar(page).click()
  await page.waitForTimeout(200)
  expect(await camadas(page), '[H6c] não grava com o cache depois da falha').toBe(antes)
})

// ── H7: guarda do alvo ──────────────────────────────────────────────────────────────────────────────────────────────
async function prepararEspera(page: Page, pagina: string | null = null) {
  await montar(page, { prender: true, pagina })
  await selecionar(page, 'f')
  await mudarMarca(page)
  await botaoReaplicar(page).click()
  await expect(page.locator('[data-aviso-reaplicar="em-voo"]'), '[INFRA] pré-condição: operação em voo').toHaveCount(1)
}
async function soltarESemEscrita(page: Page, etiqueta: string, esperado: string) {
  await page.evaluate(() => window.__cp3.soltarReleituras())
  await page.waitForTimeout(150)
  await quadros(page)
  expect(await camadas(page), `[${etiqueta}] gravou na origem errada`).toBe(esperado)
  await expect(page.locator('[data-aviso-reaplicar]'), `[${etiqueta}] mensagem vazou para a origem nova`).toHaveCount(0)
}
const camadasB: Layer[] = [svg('f', { fill: 'rgba(1, 2, 3, 1)', vetor: { asset: { id: 'spark-4', versao: 1 }, papeis: { preenchimento: 'destaque' } } })]

test('H7a troca de template/projeto A → B SEM remontar, com camada de mesmo id e pageId nulo', async ({ page }) => {
  await prepararEspera(page)
  await page.evaluate((t) => {
    window.__cp3.trocarTemplate(t as never)
  }, template(539, 9, camadasB))
  await quadros(page)
  await page.evaluate((t) => window.__cp3.editor().loadTemplate({ designData: (t as unknown as { designData: never }).designData, markDirty: false }), template(539, 9, camadasB))
  await selecionar(page, 'f')
  expect(await page.evaluate(() => [window.__cp3.editor().templateId, window.__cp3.editor().projectId]), '[INFRA] trocou sem remontar').toEqual([539, 9])
  await soltarESemEscrita(page, 'H7a', await camadas(page))
})
test('H7b troca de página (multipágina) com camada de mesmo id', async ({ page }) => {
  await prepararEspera(page, 'p1')
  await page.evaluate(() => { window.__falsos.pagina = { modo: 'multi', currentPageId: 'p2' } })
  await page.evaluate((l) => window.__cp3.editor().loadTemplate({ designData: { canvas: { width: 1080, height: 1920 }, layers: l as never }, markDirty: false, historyKey: 'p2' }), camadasB)
  await page.evaluate(() => window.__cp3.avisar())
  await selecionar(page, 'f')
  await soltarESemEscrita(page, 'H7b', await camadas(page))
})
test('H7c pageId nulo e nova carga do MESMO documento', async ({ page }) => {
  await prepararEspera(page)
  await page.evaluate((l) => window.__cp3.editor().loadTemplate({ designData: { canvas: { width: 1080, height: 1920, backgroundColor: '#ABCDEF' }, layers: l as never }, markDirty: false }), CAMADAS_A)
  await selecionar(page, 'f')
  await soltarESemEscrita(page, 'H7c', await camadas(page))
})
test('H7d ids iguais: outro conteúdo com a camada f, pageId nulo, mesmo template', async ({ page }) => {
  await prepararEspera(page)
  await page.evaluate((l) => window.__cp3.editor().loadTemplate({ designData: { canvas: { width: 1080, height: 1920 }, layers: l as never }, markDirty: false }), camadasB)
  await selecionar(page, 'f')
  await soltarESemEscrita(page, 'H7d', await camadas(page))
})
test('H7e seleção diferente com a camada original ainda na página', async ({ page }) => {
  await prepararEspera(page)
  await selecionar(page, 'm')
  await soltarESemEscrita(page, 'H7e', await camadas(page))
})
test('H7f camada apagada durante a releitura', async ({ page }) => {
  await prepararEspera(page)
  await page.evaluate(() => window.__cp3.editor().removeLayer('f'))
  await quadros(page)
  const depois = await camadas(page)
  await page.evaluate(() => window.__cp3.soltarReleituras())
  await page.waitForTimeout(150)
  expect(await camadas(page), '[H7f] nada gravado').toBe(depois)
})
test('H7g desmonte do painel durante a releitura', async ({ page }) => {
  await prepararEspera(page)
  await selecionar(page, null)
  await expect(page.locator('#sem-forma'), '[INFRA] painel desmontado').toHaveCount(1)
  const depois = await camadas(page)
  await page.evaluate(() => window.__cp3.soltarReleituras())
  await page.waitForTimeout(150)
  expect(await camadas(page), '[H7g] nada gravado depois do desmonte').toBe(depois)
})
test('H7h escolha manual durante a espera é mantida; o outro canal vinculado é reaplicado', async ({ page }) => {
  await montar(page, { prender: true })
  await selecionar(page, 'd')
  await mudarMarca(page, true)
  await botaoReaplicar(page).click()
  await swatch(page, 'Teal', 0).click() // escolha manual no preenchimento, na espera
  await quadros(page)
  await page.evaluate(() => window.__cp3.soltarReleituras())
  await expect(page.locator('[data-aviso-reaplicar="feito"]')).toHaveCount(1)
  const d = await camada(page, 'd')
  expect(d?.style?.fill, '[H7h] escolha manual mantida').toBe('rgba(15, 118, 110, 1)')
  expect(d?.style?.strokeColor, '[H7h] contorno reaplicado (escuro #222222)').toBe('rgba(34, 34, 34, 1)')
})
test('H8 duplo clique: 1 par de releituras, 1 escrita', async ({ page }) => {
  await montar(page, { prender: true })
  await selecionar(page, 'f')
  await mudarMarca(page)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Reaplicar cores da marca')!
    b.click()
    b.click()
  })
  expect(await page.evaluate(() => window.__falsos.releituras), '[H8] uma releitura por consulta').toBe(2)
  await page.evaluate(() => window.__cp3.soltarReleituras())
  await expect(page.locator('[data-aviso-reaplicar="feito"]')).toHaveCount(1)
  expect(await contarDesfazeres(page), '[H8] uma escrita').toBe(1)
})

// ── H9–H10: seletor e campo ─────────────────────────────────────────────────────────────────────────────────────────
test('H9 seletor contínuo (eventos a < 800 ms) = 1 entrada; 1 desfazer devolve cor e papel', async ({ page }) => {
  await montar(page)
  await selecionar(page, 'f')
  const antes = await camadas(page)
  const seletor = page.locator('#raiz input[type="color"]').nth(0)
  for (let i = 0; i < 20; i++) {
    await seletor.fill(`#${(16 + i).toString(16).padStart(2, '0')}2030`)
    await page.waitForTimeout(16)
  }
  expect(await papeisDe(page, 'f'), '[H9] papel removido').toBeNull()
  await page.evaluate(() => window.__cp3.editor().undo())
  await quadros(page)
  expect(await camadas(page), '[H9] um desfazer devolve cor e papel').toBe(antes)
  expect(await page.evaluate(() => window.__cp3.editor().canUndo), '[H9] uma entrada').toBe(false)
})
test('H9b limite: pausa de 900 ms no seletor = 2 entradas; o papel só volta no 2º desfazer', async ({ page }) => {
  await montar(page)
  await selecionar(page, 'f')
  const seletor = page.locator('#raiz input[type="color"]').nth(0)
  await seletor.fill('#102030')
  await seletor.fill('#112030')
  await page.waitForTimeout(900)
  await seletor.fill('#122030')
  await page.evaluate(() => window.__cp3.editor().undo())
  await quadros(page)
  expect(await papeisDe(page, 'f'), '[H9b] 1º desfazer: papel ainda fora').toBeNull()
  await page.evaluate(() => window.__cp3.editor().undo())
  await quadros(page)
  expect(await papeisDe(page, 'f'), '[H9b] 2º desfazer: papel de volta').toEqual({ preenchimento: 'destaque' })
})
test('H9c limite: dois swatches a 300 ms se fundem numa entrada', async ({ page }) => {
  await montar(page)
  await selecionar(page, 'f')
  await swatch(page, 'Preto', 0).click()
  await page.waitForTimeout(300)
  await swatch(page, 'Laranja', 0).click()
  expect(await contarDesfazeres(page), '[H9c] uma entrada').toBe(1)
})
test('H10 currentcolor recusado no campo da camada com vetor que não é svg-path (moldura, pílula, fio)', async ({ page }) => {
  await montar(page)
  for (const id of ['m', 'p', 'fio']) {
    await selecionar(page, id)
    const antes = await camadas(page)
    const campo = page.locator('#raiz input[type="color"]').nth(id === 'fio' ? 0 : 1).locator('xpath=preceding-sibling::input')
    await campo.fill('currentcolor')
    await campo.press('Enter')
    await quadros(page)
    expect(await camadas(page), `[H10] ${id}: currentcolor não grava`).toBe(antes)
  }
})

// ── U6 no navegador: a geração da carga no contexto REAL ────────────────────────────────────────────────────────────
test('U6h geração da carga: sobe em loadTemplate e na troca de template; não sobe em edição nem com objeto novo do mesmo template', async ({ page }) => {
  await montar(page)
  const g = () => page.evaluate(() => window.__cp3.editor().geracaoDaCarga())
  const g0 = await g()
  await page.evaluate(() => window.__cp3.editor().updateLayerStyle('f', { fill: '#000000' }))
  await quadros(page)
  expect(await g(), '[U6h] edição não sobe').toBe(g0)
  await page.evaluate((t) => window.__cp3.trocarTemplate(t as never), template(538, 8, CAMADAS_A))
  await quadros(page)
  expect(await g(), '[U6h] objeto novo do mesmo template não sobe').toBe(g0)
  await page.evaluate((l) => window.__cp3.editor().loadTemplate({ designData: { canvas: { width: 1, height: 1 }, layers: l as never }, markDirty: false }), CAMADAS_A)
  await quadros(page)
  expect(await g(), '[U6h] carga sobe').toBe(g0 + 1)
  await page.evaluate((t) => window.__cp3.trocarTemplate(t as never), template(539, 9, camadasB))
  await quadros(page)
  expect(await g(), '[U6h] troca de template sobe').toBe(g0 + 2)
})

// ── P: funções puras do BUNDLE (mesma fonte, com a variante aplicada) ───────────────────────────────────────────────
const MARCA_NOVA = { paleta: PALETA_NOVA, assinaturaCrua: { destaque: { fill: '#0f766e' } } }
test('P5 no-op devolve a própria camada (não canônica)', async ({ page }) => {
  const mesma = await page.evaluate(() => {
    const c = { id: 'n', type: 'shape', style: { fill: '#fa5701', opacity: 0.5, vetor: { asset: { id: 'x', versao: 1 }, papeis: { preenchimento: 'destaque' } } } }
    return window.__cp3.puro.reaplicarNaCamada(c as never, { paleta: [], assinaturaCrua: { destaque: { fill: '#fa5701' } } }) === (c as never)
  })
  expect(mesma, '[P5] no-op normalizou a camada').toBe(true)
})
test('P6 alfa efetivo no pipeline: opacity 0,5 + rgba 0,5 → 0,25', async ({ page }) => {
  const fill = await page.evaluate((m) => {
    const c = { id: 'n', type: 'shape', style: { fill: 'rgba(250, 87, 1, 0.5)', opacity: 0.5, vetor: { asset: { id: 'x', versao: 1 }, papeis: { preenchimento: 'destaque' } } } }
    return window.__cp3.puro.reaplicarNaCamada(c as never, m as never).style?.fill
  }, MARCA_NOVA)
  expect(fill, '[P6] multiplicação dupla do alfa').toBe('rgba(15, 118, 110, 0.25)')
})
test('P10 o atualizador relê a guarda na hora da execução', async ({ page }) => {
  const intacta = await page.evaluate((m) => {
    const alvo = { token: 1, projectId: 8, templateId: 538, pageId: null, geracao: 0, layerId: 'f' }
    let situacao = { token: 1, montado: true, projectId: 8, templateId: 538, pageId: null, geracao: 0, selecao: ['f'] }
    const atualizar = window.__cp3.puro.atualizadorDoReaplicar(alvo, () => situacao, m as never)
    situacao = { ...situacao, geracao: 1 }
    const c = { id: 'f', type: 'shape', style: { fill: 'rgba(250, 87, 1, 1)', vetor: { asset: { id: 'x', versao: 1 }, papeis: { preenchimento: 'destaque' } } } }
    return atualizar(c as never) === (c as never)
  }, MARCA_NOVA)
  expect(intacta, '[P10] o atualizador gravou com a carga trocada').toBe(true)
})

// ── H1b: um desfazer isolado devolve cor e papel em CADA gesto explícito ────────────────────────────────────────────
for (const gesto of ['swatch', 'nesta-pagina', 'campo'] as const) {
  test(`H1b desfazer isolado do gesto ${gesto}: devolve cor e papel`, async ({ page }) => {
    await montar(page)
    await selecionar(page, 'f')
    const antes = await camadas(page)
    if (gesto === 'swatch') await swatch(page, 'Preto', 0).click()
    if (gesto === 'nesta-pagina') await page.getByRole('button', { name: 'Usar #0f766e desta página' }).first().click()
    if (gesto === 'campo') {
      const campo = page.locator('#raiz input[type="color"]').nth(0).locator('xpath=preceding-sibling::input')
      await campo.fill('#123456')
      await campo.press('Enter')
    }
    await quadros(page)
    expect(await papeisDe(page, 'f'), `[H1b] ${gesto}: tira o papel`).toBeNull()
    await page.evaluate(() => window.__cp3.editor().undo())
    await quadros(page)
    expect(await camadas(page), `[H1b] ${gesto}: um desfazer devolve cor e papel`).toBe(antes)
    expect(await page.evaluate(() => window.__cp3.editor().canUndo), `[H1b] ${gesto}: uma entrada`).toBe(false)
  })
}

// ── H12: o aviso pertence à operação (A → B → A) ────────────────────────────────────────────────────────────────────
test('H12 A → B → A com a releitura velha pendente: aviso velho não volta, nova operação livre, resposta velha não mexe na nova; erro velho não ressuscita', async ({ page }) => {
  await montar(page, { prender: true })
  await selecionar(page, 'f')
  await mudarMarca(page)
  await botaoReaplicar(page).click()
  await expect(page.locator('[data-aviso-reaplicar="em-voo"]'), '[INFRA] pré-condição: operação 1 em voo').toHaveCount(1)
  const op1 = await page.locator('[data-aviso-reaplicar]').getAttribute('data-operacao')
  await selecionar(page, 'm')
  await selecionar(page, 'f')
  await expect(page.locator('[data-aviso-reaplicar]'), '[H12] o aviso da operação velha voltou em A').toHaveCount(0)
  await expect(botaoReaplicar(page), '[H12] o botão ficou preso pela operação velha').toBeEnabled()
  await botaoReaplicar(page).click()
  const op2 = await page.locator('[data-aviso-reaplicar="em-voo"]').getAttribute('data-operacao')
  expect(op2, '[H12] nova operação').not.toBe(op1)
  expect(await page.evaluate(() => window.__falsos.soltar.length), '[INFRA] 4 releituras presas (2 velhas + 2 novas)').toBe(4)
  await page.evaluate(() => window.__cp3.soltarReleituras())
  await expect(page.locator('[data-aviso-reaplicar="feito"]'), '[H12] a nova operação termina').toHaveCount(1)
  expect(await page.locator('[data-aviso-reaplicar]').getAttribute('data-operacao'), '[H12] o aviso é da operação nova').toBe(op2)
  expect((await camada(page, 'f'))?.style?.fill, '[H12] gravou pela nova').toBe('rgba(15, 118, 110, 0.5)')
  expect(await contarDesfazeres(page), '[H12] uma escrita só').toBe(1)

  // erro velho
  await montar(page)
  await selecionar(page, 'f')
  await page.evaluate(() => { window.__falsos.marca[8].paleta.modo = 'erro' })
  await botaoReaplicar(page).click()
  await expect(page.locator('[data-aviso-reaplicar="erro"]'), '[INFRA] pré-condição: erro em A').toHaveCount(1)
  await selecionar(page, 'm')
  await selecionar(page, 'f')
  await expect(page.locator('[data-aviso-reaplicar]'), '[H12] o erro velho ressuscitou em A').toHaveCount(0)
  await expect(page.locator('[data-tentar-reaplicar]'), '[H12] "Tentar de novo" velho ressuscitou').toHaveCount(0)
})

// ── H13: "Tentar de novo" relê só a consulta que falhou ─────────────────────────────────────────────────────────────
for (const falha of ['paleta', 'projeto'] as const) {
  test(`H13 tentar de novo com falha só ${falha === 'paleta' ? 'da paleta' : 'do projeto'}: relê só ela, guarda a outra, 0 escrita no erro`, async ({ page }) => {
    await montar(page)
    await selecionar(page, 'f')
    await mudarMarca(page)
    await page.evaluate((f) => { (window.__falsos.marca[8] as unknown as Record<string, { modo: string }>)[f].modo = 'erro' }, falha)
    const antes = await camadas(page)
    await botaoReaplicar(page).click()
    await expect(page.locator('[data-aviso-reaplicar="erro"]'), '[INFRA] pré-condição: erro').toHaveCount(1)
    expect(await page.evaluate(() => window.__falsos.releiturasPor), '[H13] o clique relê as duas').toEqual({ paleta: 1, projeto: 1 })
    expect(await camadas(page), '[H13] 0 escrita no erro').toBe(antes)
    await page.evaluate((f) => { (window.__falsos.marca[8] as unknown as Record<string, { modo: string }>)[f].modo = 'ok' }, falha)
    await page.locator('[data-tentar-reaplicar]').click()
    await expect(page.locator('[data-aviso-reaplicar="feito"]'), '[H13] o retry termina').toHaveCount(1)
    const outra = falha === 'paleta' ? 'projeto' : 'paleta'
    expect(await page.evaluate(() => window.__falsos.releiturasPor), `[H13] retry relê só ${falha}`).toEqual({ [falha]: 2, [outra]: 1 })
    expect((await camada(page, 'f'))?.style?.fill, '[H13] grava com a consulta guardada + a relida').toBe('rgba(15, 118, 110, 0.5)')
    await botaoReaplicar(page).click()
    await expect(page.locator('[data-aviso-reaplicar="feito"]')).toHaveCount(1)
    await page.waitForTimeout(100)
    expect(await page.evaluate(() => window.__falsos.releiturasPor), '[H13] um clique novo relê as duas (R2)').toEqual({ [falha]: 3, [outra]: 2 })
  })
}

// ── H14: a ordem das fileiras ───────────────────────────────────────────────────────────────────────────────────────
test('H14 ordem por canal: Marca → Nesta página → Personalizada', async ({ page }) => {
  await montar(page)
  await selecionar(page, 'd')
  const ordem = await page.evaluate(() => [...document.querySelectorAll('#raiz [data-fileira]')].map((e) => e.getAttribute('data-fileira')))
  expect(ordem, '[H14] ordem das fileiras').toEqual(['marca', 'nesta-pagina', 'personalizada', 'marca', 'nesta-pagina', 'personalizada'])
  const personalizadaAntesDoCampo = await page.evaluate(() => {
    const rotulo = document.querySelector('#raiz [data-fileira="personalizada"]')!
    const campo = document.querySelector('#raiz input[type="color"]')!
    return !!(rotulo.compareDocumentPosition(campo) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(personalizadaAntesDoCampo, '[H14] o campo e o seletor ficam na Personalizada').toBe(true)
  await tiraRaiz(page, 'h14-ordem-das-fileiras')
})
