/**
 * Konva REAL (a lib, não um dublê) desenhando sobre o canvas do @napi-rs/canvas no Node.
 * Prova o adaptador do editor (atributos + sceneFunc + fillStrokeShape do Konva) sem
 * navegador. NÃO prova o Konva do navegador: lá o canvas é o do browser (outro
 * rasterizador) e o stage usa o devicePixelRatio.
 */
import { Path2D as NapiPath2D, createCanvas, loadImage, type Canvas } from '@napi-rs/canvas'
import { Util } from 'konva/lib/Util'
import { SceneCanvas } from 'konva/lib/Canvas'
import { Shape, type ShapeConfig } from 'konva/lib/Shape'
import { CanvasRenderer } from '@/lib/canvas-renderer'
import type { Layer } from '@/types/template'
import { FUNDO, type Caso } from './fixtures'

let preparado = false
function preparar() {
  if (preparado) return
  // o mesmo que o index-node do Konva faz com o pacote `canvas`
  ;(Util as unknown as { createCanvasElement: () => unknown }).createCanvasElement = () => {
    const c = createCanvas(1, 1) as unknown as { style?: object }
    c.style = {}
    return c
  }
  preparado = true
}

export interface Pixels {
  largura: number
  altura: number
  dados: Uint8ClampedArray
}

/** Desenha UM Konva.Shape com `config` num canvas `largura × altura` pintado de `fundo`. */
export function pixelsDoKonva(largura: number, altura: number, fundo: string, config: ShapeConfig): Pixels {
  preparar()
  const canvas = new SceneCanvas({ width: largura, height: altura, pixelRatio: 1 })
  const nativo = (canvas as unknown as { _canvas: Canvas })._canvas
  const ctx2d = nativo.getContext('2d')
  ctx2d.fillStyle = fundo
  ctx2d.fillRect(0, 0, largura, altura)
  new Shape(config).drawScene(canvas)
  return { largura, altura, dados: new Uint8ClampedArray(ctx2d.getImageData(0, 0, largura, altura).data) }
}

/** O caminho do servidor: CanvasRenderer → RenderEngine.renderDesign → PNG → pixels. */
export async function pixelsDoServidor(largura: number, altura: number, fundo: string, layers: Layer[]): Promise<Pixels> {
  const png = await new CanvasRenderer(largura, altura).renderDesign({
    canvas: { width: largura, height: altura, backgroundColor: fundo },
    layers,
  } as never)
  return pixelsDePng(png)
}

export async function pixelsDePng(png: Buffer): Promise<Pixels> {
  const img = await loadImage(png)
  const c = createCanvas(img.width, img.height)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return { largura: img.width, altura: img.height, dados: new Uint8ClampedArray(ctx.getImageData(0, 0, img.width, img.height).data) }
}

export function pngDe(p: Pixels): Buffer {
  const c = createCanvas(p.largura, p.altura)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(p.largura, p.altura)
  img.data.set(p.dados)
  ctx.putImageData(img, 0, 0)
  return c.toBuffer('image/png')
}

/** Quantos pixels diferem (algum canal) e a maior diferença de canal. */
export function comparar(a: Pixels, b: Pixels): { diferentes: number; maxDelta: number; total: number } {
  if (a.largura !== b.largura || a.altura !== b.altura) throw new Error('tamanhos diferentes')
  let diferentes = 0
  let maxDelta = 0
  for (let i = 0; i < a.dados.length; i += 4) {
    let d = 0
    for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(a.dados[i + k] - b.dados[i + k]))
    if (d > 0) diferentes++
    maxDelta = Math.max(maxDelta, d)
  }
  return { diferentes, maxDelta, total: a.largura * a.altura }
}

/** Pixel "escuro" (luz < 128) em (x, y). */
export function escuro(p: Pixels, x: number, y: number): boolean {
  const i = (y * p.largura + x) * 4
  return (p.dados[i] + p.dados[i + 1] + p.dados[i + 2]) / 3 < 128
}

/** Comprimento da maior sequência de pixels escuros numa linha (eixo x) ou coluna (eixo y). */
export function maiorCorrida(p: Pixels, eixo: 'x' | 'y', fixo: number, de: number, ate: number): number {
  let melhor = 0
  let atual = 0
  for (let t = de; t < ate; t++) {
    const e = eixo === 'x' ? escuro(p, t, fixo) : escuro(p, fixo, t)
    atual = e ? atual + 1 : 0
    melhor = Math.max(melhor, atual)
  }
  return melhor
}

/** Réplica do RenderEngine ANTES do CP-V0 (render-engine.ts:1843-1862 em edb46935): Path2D do Skia + contorno ÷ escala média. */
export function pixelsDoServidorAntes(c: Caso): Pixels {
  const canvas = createCanvas(c.canvas.largura, c.canvas.altura)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = FUNDO
  ctx.fillRect(0, 0, c.canvas.largura, c.canvas.altura)
  ctx.save()
  ctx.translate(c.caixa.x, c.caixa.y)
  let path: NapiPath2D | null = null
  try {
    path = new NapiPath2D(c.pathData)
  } catch {
    path = null
  }
  if (path) {
    const [vx, vy, vw, vh] = c.viewBox ?? [0, 0, 100, 100]
    const scaleX = c.caixa.largura / (vw || 1)
    const scaleY = c.caixa.altura / (vh || 1)
    ctx.save()
    ctx.scale(scaleX, scaleY)
    ctx.translate(-vx, -vy)
    ctx.fillStyle = c.fill
    ctx.fill(path, c.fillRule ?? 'nonzero')
    if (c.stroke && c.strokeWidth > 0) {
      ctx.strokeStyle = c.stroke
      ctx.lineWidth = c.strokeWidth / ((scaleX + scaleY) / 2 || 1)
      ctx.lineJoin = 'round'
      ctx.stroke(path)
    }
    ctx.restore()
  }
  ctx.restore()
  return { largura: c.canvas.largura, altura: c.canvas.altura, dados: new Uint8ClampedArray(ctx.getImageData(0, 0, c.canvas.largura, c.canvas.altura).data) }
}
