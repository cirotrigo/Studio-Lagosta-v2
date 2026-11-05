/**
 * L1 das linhas-guia (Codex R2, achado bloqueante): a `guides-layer` com as DUAS camadas desenhadas (linhas azuis da
 * marca — R — e a faixa hachurada da interface com rótulos — M) NÃO sai na miniatura nem no download.
 *
 * Miniatura: `generatePageThumbnail` real, com um palco mínimo (sem DOM) cujo `toDataURL` rasteriza as layers REAIS do
 * Konva no canvas do Node, respeitando `visible`. Download: `exportStageDataUrl`/`exportDesign` vivem no provider; a
 * prova é pelo fonte — todo `toDataURL(` do contexto esconde `.guides-layer` antes (regressão apontada na hora).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Konva } from 'konva/lib/_FullInternals'
import { SceneCanvas } from 'konva/lib/Canvas'
import { Shape } from 'konva/lib/Shape'
import type { Canvas } from '@napi-rs/canvas'
import type KonvaNS from 'konva'

import { generatePageThumbnail } from '@/lib/page-thumbnail-utils'
import { margensDoEditor } from '@/lib/canvas-margin'
import { faixasDaInterface, linhasDaMarca } from '@/lib/margens-no-editor'
import { pixelsDoNoKonva, type Pixels } from '@/lib/vetor/__tests__/suporte/konva-no-node'
import type { Page } from '@/types/template'

const W = 270
const H = 480
const AZUL = { r: 59, g: 130, b: 246 } // #3B82F6
const VERMELHO = { r: 239, g: 68, b: 68 } // rgba(239,68,68,…)

beforeAll(() => {
  pixelsDoNoKonva(1, 1, '#ffffff', () => new Shape({}))
  globalThis.requestAnimationFrame ??= ((cb: (t: number) => void) => setTimeout(() => cb(0), 0) as unknown as number) as typeof requestAnimationFrame
})

/** As duas camadas como o stage as desenha (mesmos helpers, mesmas cores), num Story escalado para 270×480. */
function guidesLayerComAsDuasCamadas(): KonvaNS.Layer {
  const m = margensDoEditor({ formato: 'story', assinatura: null, largura: W, altura: H })
  const layer = new Konva.Layer({ name: 'guides-layer', listening: false })
  for (const f of faixasDaInterface(m.interface, W, H)) layer.add(new Konva.Rect({ ...f, fill: 'rgba(239, 68, 68, 0.5)' }))
  layer.add(new Konva.Text({ x: 4, y: 4, text: 'Interface do Instagram', fontSize: 10, fill: '#B91C1C' }))
  for (const l of linhasDaMarca(m.marca, W, H)) layer.add(new Konva.Line({ points: l.points, stroke: '#3B82F6', strokeWidth: 2, dash: [8, 5] }))
  layer.add(new Konva.Text({ x: m.marca.esquerda + 4, y: m.marca.topo + 4, text: 'Margem da marca', fontSize: 10, fill: '#3B82F6' }))
  return layer
}

/** Um palco mínimo com o que `generatePageThumbnail` usa; `toDataURL` rasteriza as layers visíveis no canvas do Node. */
function palco(layers: KonvaNS.Layer[]) {
  let escala = 1
  let pos = { x: 0, y: 0 }
  let ultimo: Pixels | null = null
  const rasterizar = (): Pixels => {
    const canvas = new SceneCanvas({ width: W, height: H, pixelRatio: 1 })
    const nativo = (canvas as unknown as { _canvas: Canvas })._canvas
    const ctx = nativo.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    for (const l of layers) if (l.visible()) l.drawScene(canvas)
    return { largura: W, altura: H, dados: new Uint8ClampedArray(ctx.getImageData(0, 0, W, H).data) }
  }
  const stage = {
    scaleX: () => escala,
    x: () => pos.x,
    y: () => pos.y,
    scale: (s?: { x: number; y: number }) => (s ? void (escala = s.x) : { x: escala, y: escala }),
    position: (p?: { x: number; y: number }) => (p ? void (pos = p) : pos),
    batchDraw: () => undefined,
    findOne: (seletor: string) => layers.find((l) => `.${l.name()}` === seletor),
    toDataURL: () => {
      ultimo = rasterizar()
      return 'data:image/jpeg;base64,'
    },
  }
  return { stage: stage as unknown as KonvaNS.Stage, pixels: () => ultimo, rasterizar }
}

const conta = (p: Pixels, cor: { r: number; g: number; b: number }, tol = 40) => {
  let n = 0
  for (let i = 0; i < p.dados.length; i += 4) {
    if (Math.abs(p.dados[i] - cor.r) <= tol && Math.abs(p.dados[i + 1] - cor.g) <= tol && Math.abs(p.dados[i + 2] - cor.b) <= tol) n++
  }
  return n
}

describe('a guides-layer com M e R ligados não sai do export', () => {
  const page = { id: 'p', name: 'p', width: W, height: H } as unknown as Page

  it('controle: com a guides-layer visível, o raster TEM azul da marca e vermelho da faixa', () => {
    const conteudo = new Konva.Layer({ name: 'content-layer' })
    conteudo.add(new Konva.Rect({ x: 0, y: 0, width: W, height: H, fill: '#ffffff' }))
    const guias = guidesLayerComAsDuasCamadas()
    const p = palco([conteudo, guias]).rasterizar()
    expect(conta(p, AZUL)).toBeGreaterThan(100)
    expect(conta(p, VERMELHO)).toBeGreaterThan(1000) // a faixa (o Layer.drawScene limpa o canvas antes: o 50% fica sobre transparente)
  })

  it('miniatura: generatePageThumbnail esconde a guides-layer antes do toDataURL e a devolve depois', async () => {
    const conteudo = new Konva.Layer({ name: 'content-layer' })
    conteudo.add(new Konva.Rect({ x: 0, y: 0, width: W, height: H, fill: '#ffffff' }))
    const guias = guidesLayerComAsDuasCamadas()
    const { stage, pixels } = palco([conteudo, guias])
    expect(guias.visible()).toBe(true)
    const dataUrl = await generatePageThumbnail(stage, page)
    expect(dataUrl).toMatch(/^data:image\/jpeg/)
    const p = pixels()!
    expect(conta(p, AZUL)).toBe(0)
    expect(conta(p, VERMELHO)).toBe(0)
    // o editor continua mostrando as guias depois da miniatura
    expect(guias.visible()).toBe(true)
  })

  it('download e exportDesign (contexto do editor): todo toDataURL do fonte esconde .guides-layer antes', () => {
    const fonte = readFileSync(join(__dirname, '../../contexts/template-editor-context.tsx'), 'utf8')
    const chamadas = [...fonte.matchAll(/\.toDataURL\(/g)].map((m) => m.index!)
    expect(chamadas.length).toBeGreaterThanOrEqual(2)
    for (const i of chamadas) {
      const inicioDaFuncao = fonte.lastIndexOf('useCallback(', i)
      const trecho = fonte.slice(inicioDaFuncao, i)
      expect(trecho, `toDataURL em ${fonte.slice(0, i).split('\n').length} sem esconder a guides-layer antes`).toMatch(/findOne\('\.guides-layer'\)[\s\S]*visible\(false\)/)
    }
  })
})
