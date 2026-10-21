/**
 * CP-X1 — GATE no navegador: o CanvasPreview REAL do /gerar-criativo (React + react-konva no
 * Chromium) exporta pelo próprio `exportToDataUrl`, e o PNG é comparado com o servidor
 * (CanvasRenderer → RenderEngine, @napi-rs/canvas) no mesmo layout.
 *
 * Hermético: bundle local do esbuild aberto por file://, rede bloqueada, sem login, banco ou
 * Blob. A variante "base" empacota o canvas-preview.tsx de 6bdc1f77 (antes do CP-X1) para
 * registrar a regressão.
 *
 * Rasterizadores diferentes (Chromium × Skia do napi): a tolerância vale SÓ na faixa de
 * borda (pixels a até 2 px de uma transição na referência do servidor); fora dela, os
 * números abaixo foram MEDIDOS na primeira execução (ver o relatório) e anotados aqui.
 * As amostras (fundo/tinta/furo/contorno) não dependem de tolerância de borda.
 *
 *   npx playwright test -c tests/harness/cp-x1/playwright.config.ts
 *   CPX1_SAIDA=<dir> grava os PNGs e as medidas.
 */
import { test, expect, type Page } from '@playwright/test'
import { build, type Plugin } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Layer } from '@/types/template'
import { comparar, pixelsDePng, pixelsDoServidor, pngDe, type Pixels } from '@/lib/vetor/__tests__/suporte/konva-no-node'
import { CASOS_X1, FUNDO_X1, TEXTO_COM_CONTORNO, type CasoX1 } from '@/lib/gerar-criativo/__tests__/suporte/fixture-x1'
import type { Montagem } from './entrada'

const RAIZ = path.resolve(__dirname, '../../..')
const BASE = '6bdc1f77669db150faefe7556d8924308fe0d8cc'
const COMPONENTE = 'src/components/gerar-criativo/components/canvas-preview.tsx'

// Medidos com CPX1_SAIDA (Chromium do Playwright 1.57 × @napi-rs/canvas, 21/10/2026, duas execuções
// iguais), sem folga acrescentada: toda diferença ficou na faixa de borda, com delta de canal 1; fora
// dela, zero pixel; amostras com delta 0. Ver human-output/relatorios/cp-x1/RELATORIO.md.
const DELTA_FORA_DA_BORDA = 0 // fora da faixa de borda: nenhum pixel pode diferir
const DELTA_NA_BORDA = 1 // antialias de borda: maior delta de canal medido
const DELTA_AMOSTRA = 0 // amostra × servidor e fundo
const RAIO_DA_BORDA = 2
/** Teto de pixels diferentes por caso (todos na borda, delta 1) = a contagem medida. */
const TETO_NA_BORDA: Record<string, number> = {
  'anel-evenodd': 796,
  'viewbox-deslocado': 0,
  'contorno-800x200': 0,
  'espelho-h': 160,
  'espelho-v': 160,
  'espelho-hv': 160,
  alfa: 5096,
  rotacao: 300,
  interacao: 132,
}

type Variante = 'atual' | 'base'
const pastas: Record<Variante, string> = { atual: '', base: '' }
let temporario = ''
const saida = process.env.CPX1_SAIDA

async function empacotar(variante: Variante, dir: string) {
  const plugins: Plugin[] = []
  if (variante === 'base') {
    const fonte = execFileSync('git', ['show', `${BASE}:${COMPONENTE}`], { cwd: RAIZ }).toString()
    plugins.push({
      name: 'componente-da-base',
      setup(b) {
        b.onLoad({ filter: /components[\\/]gerar-criativo[\\/]components[\\/]canvas-preview\.tsx$/ }, () => ({
          contents: fonte,
          loader: 'tsx',
          resolveDir: path.join(RAIZ, path.dirname(COMPONENTE)),
        }))
      },
    })
  }
  await build({
    entryPoints: [path.join(__dirname, 'entrada.tsx')],
    bundle: true,
    outfile: path.join(dir, 'previa.js'),
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    tsconfig: path.join(RAIZ, 'tsconfig.json'),
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'error',
    plugins,
  })
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="raiz"></div><script src="previa.js"></script>')
}

test.beforeAll(async () => {
  temporario = mkdtempSync(path.join(tmpdir(), 'cpx1-harness-'))
  for (const v of ['atual', 'base'] as Variante[]) {
    pastas[v] = path.join(temporario, v)
    mkdirSync(pastas[v])
    await empacotar(v, pastas[v])
  }
})

test.afterAll(() => {
  if (temporario) rmSync(temporario, { recursive: true, force: true })
})

async function abrir(page: Page, variante: Variante) {
  const externas: string[] = []
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('file:')) return route.continue()
    externas.push(url)
    return route.abort()
  })
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(String(e)))
  await page.goto(pathToFileURL(path.join(pastas[variante], 'index.html')).href)
  await page.waitForFunction(() => typeof window.__montar === 'function')
  return { externas, erros }
}

async function montar(page: Page, m: Montagem) {
  await page.evaluate((mm) => window.__montar(mm), m)
}

async function exportar(page: Page): Promise<Pixels> {
  const dataUrl = await page.evaluate(() => window.__previa.exportar())
  return pixelsDePng(Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'))
}

const montagem = (c: CasoX1, selecionado: string | null, camadas: Layer[] = [c.camada]): Montagem => ({
  largura: c.largura, altura: c.altura, camadas, selecionado, fundo: FUNDO_X1,
})

function delta(a: Pixels, b: Pixels, x: number, y: number) {
  const i = (y * a.largura + x) * 4
  let d = 0
  for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(a.dados[i + k] - b.dados[i + k]))
  return d
}

function rgba(p: Pixels, x: number, y: number) {
  const i = (y * p.largura + x) * 4
  return [p.dados[i], p.dados[i + 1], p.dados[i + 2], p.dados[i + 3]]
}

/** Borda = algum vizinho a até `r` px tem cor diferente na referência. */
function ehBorda(ref: Pixels, x: number, y: number, r: number) {
  const c = rgba(ref, x, y)
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx
      const yy = y + dy
      if (xx < 0 || yy < 0 || xx >= ref.largura || yy >= ref.altura) continue
      const v = rgba(ref, xx, yy)
      if (v.some((n, k) => n !== c[k])) return true
    }
  }
  return false
}

function analisar(navegador: Pixels, servidor: Pixels) {
  let foraDaBorda = 0
  let maxForaDaBorda = 0
  let foraDaBordaAcimaDaTolerancia = 0
  for (let y = 0; y < servidor.altura; y++) {
    for (let x = 0; x < servidor.largura; x++) {
      const d = delta(navegador, servidor, x, y)
      if (d === 0 || ehBorda(servidor, x, y, RAIO_DA_BORDA)) continue
      foraDaBorda++
      maxForaDaBorda = Math.max(maxForaDaBorda, d)
      if (d > DELTA_FORA_DA_BORDA) foraDaBordaAcimaDaTolerancia++
    }
  }
  return { ...comparar(navegador, servidor), foraDaBorda, maxForaDaBorda, foraDaBordaAcimaDaTolerancia }
}

type Analise = ReturnType<typeof analisar>

/** O gate: vazio = aprovado. Fora da borda nada difere; na borda, delta ≤ o medido e contagem ≤ o teto do caso. */
function violacoes(analise: Analise, teto: number): string[] {
  const v: string[] = []
  if (analise.foraDaBordaAcimaDaTolerancia > 0) v.push(`${analise.foraDaBordaAcimaDaTolerancia} px diferem fora da borda`)
  if (analise.maxDelta > DELTA_NA_BORDA) v.push(`delta ${analise.maxDelta} > ${DELTA_NA_BORDA}`)
  if (analise.diferentes > teto) v.push(`${analise.diferentes} px diferentes > teto ${teto}`)
  return v
}

/** Maior delta de canal entre o pixel e o fundo branco opaco. */
function deltaDoFundo(p: Pixels, x: number, y: number) {
  return Math.max(...rgba(p, x, y).map((n) => 255 - n))
}

function amostras(c: CasoX1, navegador: Pixels, servidor: Pixels) {
  return c.amostras.map((a) => {
    const doFundo = deltaDoFundo(navegador, a.x, a.y)
    const vsServidor = delta(navegador, servidor, a.x, a.y)
    const certo = a.esperado === 'fundo' ? doFundo <= DELTA_AMOSTRA : doFundo > 30
    return { nome: a.nome, esperado: a.esperado, doFundo, vsServidor, ok: certo && vsServidor <= DELTA_AMOSTRA }
  })
}

function guardar(nome: string, imagens: Record<string, Pixels>, extra: unknown) {
  if (!saida) return
  mkdirSync(saida, { recursive: true })
  // um JSON por medida: o Playwright troca de worker depois de uma falha e o afterAll de outro worker não as tem
  writeFileSync(path.join(saida, `${nome}.json`), JSON.stringify(extra, null, 2))
  for (const [k, p] of Object.entries(imagens)) writeFileSync(path.join(saida, `${nome}.${k}.png`), pngDe(p))
}

test.describe('CanvasPreview real × servidor (svg-path)', () => {
  for (const c of CASOS_X1) {
    test(`${c.id}: PNG do export = servidor; selecionado = desmarcado; sem UI de edição`, async ({ page }) => {
      const { externas, erros } = await abrir(page, 'atual')
      const servidor = await pixelsDoServidor(c.largura, c.altura, FUNDO_X1, [c.camada])

      await montar(page, montagem(c, null))
      const desmarcado = await exportar(page)
      await montar(page, montagem(c, c.camada.id))
      const selecionado = await exportar(page)

      const analise = analisar(selecionado, servidor)
      const amostrasMedidas = amostras(c, selecionado, servidor)
      guardar(`atual-${c.id}`, { navegador: selecionado, servidor }, { analise, amostras: amostrasMedidas })

      expect(erros).toEqual([])
      expect(externas).toEqual([])
      // selecionado e desmarcado: os MESMOS pixels (nenhum contorno apagado, nenhuma alça, nenhuma guia)
      expect(comparar(selecionado, desmarcado).diferentes).toBe(0)
      expect(amostrasMedidas.filter((a) => !a.ok)).toEqual([])
      expect(violacoes(analise, TETO_NA_BORDA[c.id])).toEqual([])
    })
  }
})

test.describe('controle negativo: o gate reprova contorno que some ou muda fora das amostras', () => {
  /** Pinta um retângulo da imagem (cópia) com a cor dada. */
  const pintar = (p: Pixels, x0: number, y0: number, x1: number, y1: number, cor: [number, number, number]): Pixels => {
    const dados = new Uint8ClampedArray(p.dados)
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * p.largura + x) * 4
        dados[i] = cor[0]
        dados[i + 1] = cor[1]
        dados[i + 2] = cor[2]
        dados[i + 3] = 255
      }
    }
    return { ...p, dados }
  }

  // trechos de contorno longe de toda amostra da fixture
  const trechos: Array<[string, number, number, number, number]> = [
    ['contorno-800x200', 600, 36, 700, 45], // lado de cima (amostra em x=420)
    ['anel-evenodd', 214, 105, 223, 135], // contorno externo, lado direito (amostras em cima e no centro)
  ]
  for (const [id, x0, y0, x1, y1] of trechos) {
    test(`${id}: trecho de contorno apagado ou acinzentado reprova`, async ({ page }) => {
      const c = CASOS_X1.find((x) => x.id === id) as CasoX1
      await abrir(page, 'atual')
      await montar(page, montagem(c, c.camada.id))
      const navegador = await exportar(page)
      const servidor = await pixelsDoServidor(c.largura, c.altura, FUNDO_X1, [c.camada])
      expect(violacoes(analisar(navegador, servidor), TETO_NA_BORDA[id])).toEqual([])

      const apagado = pintar(navegador, x0, y0, x1, y1, [255, 255, 255])
      const acinzentado = pintar(navegador, x0, y0, x1, y1, [80, 80, 80])
      const vApagado = violacoes(analisar(apagado, servidor), TETO_NA_BORDA[id])
      const vAcinzentado = violacoes(analisar(acinzentado, servidor), TETO_NA_BORDA[id])
      // as amostras sozinhas NÃO pegam o defeito (é o ponto do controle)
      expect(amostras(c, apagado, servidor).filter((a) => !a.ok)).toEqual([])
      guardar(`controle-${id}`, { apagado }, { vApagado, vAcinzentado })
      expect(vApagado.length).toBeGreaterThan(0)
      expect(vAcinzentado.length).toBeGreaterThan(0)
    })
  }
})

test.describe('regressão: o canvas-preview de 6bdc1f77 (antes do CP-X1)', () => {
  test('desenha retângulo e perde o contorno do vetor selecionado', async ({ page }) => {
    await abrir(page, 'base')
    const resumo: Record<string, unknown> = {}
    let casosComAmostraErrada = 0
    let casosComContornoPerdido = 0
    for (const c of CASOS_X1) {
      const servidor = await pixelsDoServidor(c.largura, c.altura, FUNDO_X1, [c.camada])
      await montar(page, montagem(c, null))
      const desmarcado = await exportar(page)
      await montar(page, montagem(c, c.camada.id))
      const selecionado = await exportar(page)
      const analise = analisar(desmarcado, servidor)
      const erradas = amostras(c, desmarcado, servidor).filter((a) => !a.ok).map((a) => a.nome)
      const perdeuContorno = comparar(selecionado, desmarcado).diferentes
      if (erradas.length > 0) casosComAmostraErrada++
      if (perdeuContorno > 0) casosComContornoPerdido++
      resumo[c.id] = { analise, amostrasErradas: erradas, pixelsQueMudamAoSelecionar: perdeuContorno }
      guardar(`base-${c.id}`, { desmarcado, selecionado, servidor }, resumo[c.id])
    }
    guardar('base-resumo', {}, { casosComAmostraErrada, casosComContornoPerdido })
    // a base reprova o contrato: todo caso diverge do servidor fora da borda
    for (const [id, r] of Object.entries(resumo)) {
      expect([id, (r as { analise: { foraDaBordaAcimaDaTolerancia: number } }).analise.foraDaBordaAcimaDaTolerancia > 0]).toEqual([id, true])
    }
    // e o contorno some ao selecionar onde há contorno
    expect(casosComContornoPerdido).toBeGreaterThan(0)
  })
})

test.describe('a raiz do export vale para outros tipos', () => {
  test('texto com effects.stroke: selecionado = desmarcado (na base, o contorno some)', async ({ page }) => {
    const c = TEXTO_COM_CONTORNO
    for (const variante of ['atual', 'base'] as Variante[]) {
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await abrir(page, variante)
      await montar(page, montagem(c, null))
      const desmarcado = await exportar(page)
      await montar(page, montagem(c, c.camada.id))
      const selecionado = await exportar(page)
      const diferentes = comparar(selecionado, desmarcado).diferentes
      guardar(`${variante}-texto-contorno`, { desmarcado, selecionado }, { diferentes })
      if (variante === 'atual') expect(diferentes).toBe(0)
      else expect(diferentes).toBeGreaterThan(0)
    }
  })
})

test.describe('interação no CanvasPreview real', () => {
  const caixaDoCanvas = async (page: Page) => {
    const box = await page.locator('canvas').first().boundingBox()
    if (!box) throw new Error('canvas sem caixa')
    return box
  }

  test('clique: no anel seleciona; no furo do evenodd não seleciona', async ({ page }) => {
    const c = CASOS_X1.find((x) => x.id === 'anel-evenodd') as CasoX1
    await abrir(page, 'atual')
    await montar(page, montagem(c, null))
    const box = await caixaDoCanvas(page)
    await page.mouse.click(box.x + 120, box.y + 120) // furo
    expect(await page.evaluate(() => window.__previa.selecionado())).toBeNull()
    await page.mouse.click(box.x + 120, box.y + 57) // tinta do anel
    expect(await page.evaluate(() => window.__previa.selecionado())).toBe('anel-evenodd')
  })

  test('arrastar e redimensionar: o PNG acompanha a camada gravada e continua = servidor', async ({ page }) => {
    const c = CASOS_X1.find((x) => x.id === 'viewbox-deslocado') as CasoX1
    await abrir(page, 'atual')
    await montar(page, montagem(c, null))
    const box = await caixaDoCanvas(page)

    // arrastar +40,+40 (longe das guias de centro)
    await page.mouse.move(box.x + 120, box.y + 120)
    await page.mouse.down()
    await page.mouse.move(box.x + 140, box.y + 140, { steps: 5 })
    await page.mouse.move(box.x + 160, box.y + 160, { steps: 5 })
    await page.mouse.up()
    let camadas = await page.evaluate(() => window.__previa.camadas())
    expect(camadas[0].position).toEqual({ x: 60, y: 60 })

    // selecionar e puxar a alça do canto inferior direito (caixa 60..260 → canto em 260,260: fora do canvas de 240)
    // então redimensiona pela alça do canto superior esquerdo, em (60,60), até (80,90)
    await page.mouse.click(box.x + 100, box.y + 100)
    expect(await page.evaluate(() => window.__previa.selecionado())).toBe('viewbox-deslocado')
    await page.mouse.move(box.x + 60, box.y + 60)
    await page.mouse.down()
    await page.mouse.move(box.x + 70, box.y + 75, { steps: 5 })
    await page.mouse.move(box.x + 80, box.y + 90, { steps: 5 })
    await page.mouse.up()
    camadas = await page.evaluate(() => window.__previa.camadas())
    const movida = camadas[0]
    // o Transformer do Konva arredonda a alça (medido: 180,58 × 170,6): o que vale é o PNG seguir a camada gravada
    expect(Math.abs(movida.position.x - 80)).toBeLessThan(2)
    expect(Math.abs(movida.position.y - 90)).toBeLessThan(2)
    expect(Math.abs(movida.size.width - 180)).toBeLessThan(2)
    expect(Math.abs(movida.size.height - 170)).toBeLessThan(2)

    const navegador = await exportar(page)
    const servidor = await pixelsDoServidor(c.largura, c.altura, FUNDO_X1, [movida])
    const analise = analisar(navegador, servidor)
    guardar('atual-interacao', { navegador, servidor }, { camada: movida, analise })
    expect(violacoes(analise, TETO_NA_BORDA.interacao)).toEqual([])
  })

  test('export que falha restaura escala, posição, Transformer, realce e guias — e devolve o erro', async ({ page }) => {
    const c = CASOS_X1.find((x) => x.id === 'viewbox-deslocado') as CasoX1
    // imagem sintética local (data URL), sem rede: o realce de seleção só existe para imagem
    const { createCanvas } = await import('@napi-rs/canvas')
    const tela = createCanvas(60, 60)
    const ctx = tela.getContext('2d')
    ctx.fillStyle = '#e67e22'
    ctx.fillRect(0, 0, 60, 60)
    const imagem: Layer = {
      id: 'foto', type: 'image', name: 'foto', visible: true, locked: false, order: 1,
      position: { x: 160, y: 160 }, size: { width: 60, height: 60 }, fileUrl: tela.toDataURL('image/png'), style: {},
    }
    await abrir(page, 'atual')
    // contêiner com metade da largura → stage em escala 0,5
    await montar(page, { ...montagem(c, 'foto', [c.camada, imagem]), larguraDoContainer: c.largura / 2 })
    await page.waitForFunction(() => {
      const stage = window.Konva.stages[0]
      const img = stage.findOne('Image') as unknown as { image: () => unknown } | undefined
      const tr = stage.findOne('Transformer') as unknown as { nodes: () => unknown[] } | undefined
      return !!img?.image() && tr?.nodes().length === 1
    })
    const box = await page.locator('canvas').first().boundingBox()
    if (!box) throw new Error('canvas sem caixa')

    // arrasta o vetor (centrado na página) 5 px de tela — acima do dragDistance 3 do Konva — = 10 px
    // da página em escala 0,5: o centro vai a 130, ainda no snap (< 25). As duas guias aparecem e o mouse fica preso
    await page.mouse.move(box.x + 30, box.y + 30)
    await page.mouse.down()
    await page.mouse.move(box.x + 35, box.y + 35, { steps: 5 })
    await page.waitForFunction(() => window.Konva.stages[0].find('Line').filter((n) => n.name() === '__ui-da-previa').length === 2)

    const retrato = () =>
      page.evaluate(() => {
        const stage = window.Konva.stages[0]
        const tr = stage.findOne('Transformer') as unknown as { visible: () => boolean; nodes: () => Array<{ name: () => string }> }
        return {
          escala: [stage.scaleX(), stage.scaleY()],
          posicao: stage.position(),
          transformer: { visivel: tr.visible(), nos: tr.nodes().map((n) => n.name()) },
          ui: stage.find('.__ui-da-previa').map((n) => [n.getClassName(), n.visible()]),
        }
      })
    await page.evaluate(() => window.Konva.stages[0].position({ x: 7, y: 5 }))
    const antes = await retrato()
    expect(antes).toEqual({
      escala: [0.5, 0.5],
      posicao: { x: 7, y: 5 },
      transformer: { visivel: true, nos: ['foto'] },
      ui: [['Rect', true], ['Line', true], ['Line', true]],
    })

    const erro = await page.evaluate(async () => {
      const stage = window.Konva.stages[0]
      stage.toDataURL = () => {
        throw new Error('falha forçada')
      }
      try {
        await window.__previa.exportar()
        return null
      } catch (e) {
        return String((e as Error).message)
      }
    })
    expect(erro).toBe('falha forçada')
    expect(await retrato()).toEqual(antes)
    await page.mouse.up()
  })

  test('vetor com sombra: o export interrompe com o diagnóstico (segunda linha de defesa)', async ({ page }) => {
    const c = CASOS_X1.find((x) => x.id === 'viewbox-deslocado') as CasoX1
    const comSombra: Layer = { ...c.camada, effects: { shadow: { enabled: true, shadowColor: '#000000', shadowBlur: 8, shadowOffsetX: 0, shadowOffsetY: 4, shadowOpacity: 1 } } }
    await abrir(page, 'atual')
    await montar(page, montagem(c, null, [comSombra]))
    const erro = await page.evaluate(async () => {
      try {
        await window.__previa.exportar()
        return null
      } catch (e) {
        return String((e as Error).message)
      }
    })
    expect(erro).toContain('sombra')
  })
})
