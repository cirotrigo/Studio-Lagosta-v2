/**
 * CP-V2c — paridade de pixel dos 3 presets de forma NATIVA do catálogo (`fio-fino` = line, `moldura-fina` =
 * rectangle só contorno, `pilula-contorno` = rounded-rectangle com raio de pílula), no MESMO canvas de Node do CP-V0:
 * servidor (CanvasRenderer → RenderEngine) × `Konva.Line`/`Konva.Rect` REAIS com as props que o `ShapeNode` do editor
 * monta (`konva-layer-factory.tsx`, replicadas abaixo e conferidas na fonte). A camada é a do construtor da inserção,
 * com uma cor de teste resolvida pela marca, em caixas 300×100 e 100×300.
 *
 * Não prova o Konva do navegador (outro rasterizador, devicePixelRatio). Com CPV2C_SAIDA=<dir>, grava os PNGs e as
 * medidas.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Line } from 'konva/lib/shapes/Line'
import { Rect } from 'konva/lib/shapes/Rect'
import { describe, expect, it } from 'vitest'
import { SHAPES_LIBRARY } from '@/lib/assets/shapes-library'
import { camadaDoElemento } from '@/lib/editor/camada-do-elemento'
import type { Layer } from '@/types/template'
import { FUNDO } from './suporte/fixtures'
import { comparar, pixelsDoNoKonva, pixelsDoServidor, pngDe, type Pixels } from './suporte/konva-no-node'

const COR_DE_TESTE = '#1a3987' // a marca de teste: fundo da assinatura → escuro → texto (o papel dos 3 presets)
const BASE: Layer = { id: 'p', type: 'shape', name: 'p', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, style: { fill: '#2563eb', fillOpacity: 1, strokeColor: '#1e3a8a', strokeOpacity: 1, strokeWidth: 2, shapeType: 'rectangle' } }

/**
 * Tolerância declarada: 0 px nos 6 casos. A pílula media 1.346 px / delta 229 enquanto o servidor traçava o canto com
 * `quadraticCurveTo` (CP-V2c, 23/10/2026); desde a correção do canto (`traceRoundedRectPath` com a sequência de arcos
 * do `Konva.Util.drawRoundedRectPath`), é paridade de verdade. A faixa reta continua conferida à parte.
 */
const TOLERANCIA: Record<string, { diferentes: number; maxDelta: number }> = {
  'fio-fino 300x100': { diferentes: 0, maxDelta: 0 },
  'fio-fino 100x300': { diferentes: 0, maxDelta: 0 },
  'moldura-fina 300x100': { diferentes: 0, maxDelta: 0 },
  'moldura-fina 100x300': { diferentes: 0, maxDelta: 0 },
  'pilula-contorno 300x100': { diferentes: 0, maxDelta: 0 },
  'pilula-contorno 100x300': { diferentes: 0, maxDelta: 0 },
}

/** Pixels diferentes só dentro do retângulo [x0, x1) × [y0, y1). */
function diferentesNaFaixa(a: Pixels, b: Pixels, x0: number, y0: number, x1: number, y1: number): number {
  let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * a.largura + x) * 4
      if ([0, 1, 2, 3].some((k) => a.dados[i + k] !== b.dados[i + k])) n++
    }
  }
  return n
}

/** As props do `ShapeNode` (konva-layer-factory.tsx) para line, rectangle e rounded-rectangle, com cores opacas. */
function noDoEditor(camada: Layer) {
  const style = camada.style ?? {}
  const width = Math.max(10, camada.size.width)
  const height = Math.max(10, camada.size.height)
  const borderColor = style.border?.color ?? '#000000'
  const borderWidth = style.border?.width ?? 0
  const borderRadius = style.border?.radius ?? 0
  const fill = style.fill ?? '#2563eb'
  const stroke = style.strokeColor ? style.strokeColor : borderWidth > 0 ? borderColor : undefined
  const strokeWidth = style.strokeWidth ?? borderWidth ?? 0
  const comum = { x: camada.position.x, y: camada.position.y, rotation: camada.rotation ?? 0 }
  if (style.shapeType === 'line') {
    return new Line({ ...comum, points: [0, height / 2, width, height / 2], stroke: fill, strokeWidth: style.strokeWidth ?? 4, lineCap: 'round', lineJoin: 'round' })
  }
  const cornerRadius = style.shapeType === 'rounded-rectangle' ? Math.min(borderRadius || 24, Math.min(width, height) / 2) : borderRadius
  return new Rect({ ...comum, width, height, cornerRadius, fill, stroke, strokeWidth })
}

const casos = ['fio-fino', 'moldura-fina', 'pilula-contorno'].flatMap((id) =>
  [[300, 100], [100, 300]].map(([w, h]) => {
    const definicao = SHAPES_LIBRARY.find((s) => s.id === id)!
    const inserida = camadaDoElemento(definicao, { base: BASE, canvas: { width: 1080, height: 1920 }, marca: { paleta: [], assinaturaCrua: { fundo: COR_DE_TESTE } } })
    const camada: Layer = { ...inserida, position: { x: 20, y: 20 }, size: { width: w, height: h } }
    return { nome: `${id} ${w}x${h}`, camada, canvas: { largura: w + 40, altura: h + 40 } }
  }),
)

const saida = process.env.CPV2C_SAIDA
const medidas: Record<string, unknown> = {}

describe('CP-V2c: presets nativos, servidor × Konva.Line/Konva.Rect reais', () => {
  it('as props replicadas são as do ShapeNode de hoje (conferidas na fonte)', () => {
    const fonte = readFileSync(join(process.cwd(), 'src/components/templates/konva-layer-factory.tsx'), 'utf8')
    for (const trecho of [
      'points={[0, height / 2, width, height / 2]}\n          stroke={fill}\n          strokeWidth={lineWidth}',
      'const lineWidth = layer.style?.strokeWidth ?? 4',
      'cornerRadius={Math.min(borderRadius || 24, Math.min(width, height) / 2)}',
      'const strokeWidth = layer.style?.strokeWidth ?? borderWidth ?? 0',
      'const width = Math.max(10, layer.size?.width ?? 0)',
    ]) expect(fonte).toContain(trecho)
  })

  it('a camada é a do construtor: cor de teste no canal do slot, transparente no outro, raio de pílula', () => {
    expect(casos.map((c) => [c.nome, c.camada.style!.shapeType, c.camada.style!.fill, c.camada.style!.strokeColor ?? null])).toEqual([
      ['fio-fino 300x100', 'line', 'rgba(26, 57, 135, 1)', null],
      ['fio-fino 100x300', 'line', 'rgba(26, 57, 135, 1)', null],
      ['moldura-fina 300x100', 'rectangle', 'transparent', 'rgba(26, 57, 135, 1)'],
      ['moldura-fina 100x300', 'rectangle', 'transparent', 'rgba(26, 57, 135, 1)'],
      ['pilula-contorno 300x100', 'rounded-rectangle', 'transparent', 'rgba(26, 57, 135, 1)'],
      ['pilula-contorno 100x300', 'rounded-rectangle', 'transparent', 'rgba(26, 57, 135, 1)'],
    ])
  })

  it.each(casos.map((c) => [c.nome, c] as const))('%s — dentro da tolerância medida, e desenha algo', async (nome, c) => {
    const { largura, altura } = c.canvas
    const servidor = await pixelsDoServidor(largura, altura, FUNDO, [c.camada])
    const editor = pixelsDoNoKonva(largura, altura, FUNDO, () => noDoEditor(c.camada))
    const vazio = pixelsDoNoKonva(largura, altura, FUNDO, () => new Rect({ width: 0, height: 0 }))
    const r = comparar(servidor, editor)
    const desenhado = comparar(servidor, vazio).diferentes
    medidas[nome] = { ...r, pixelsDesenhados: desenhado, desenhadosNoEditor: comparar(editor, vazio).diferentes }
    if (saida) {
      mkdirSync(saida, { recursive: true })
      const arquivo = nome.replace(' ', '-')
      writeFileSync(join(saida, `${arquivo}.servidor.png`), pngDe(servidor))
      writeFileSync(join(saida, `${arquivo}.editor.png`), pngDe(editor))
      writeFileSync(join(saida, 'medidas.json'), JSON.stringify(medidas, null, 2))
    }
    expect({ diferentes: r.diferentes, maxDelta: r.maxDelta }).toEqual(TOLERANCIA[nome])
    // fora dos cantos (raio + 2 px de traço e antisserrilhado), a forma é a mesma pixel a pixel
    const { width: w, height: h } = c.camada.size
    const margem = Math.min(w, h) / 2 + 2
    const faixa = w >= h ? [20 + margem, 0, 20 + w - margem, altura] : [0, 20 + margem, largura, 20 + h - margem]
    expect(diferentesNaFaixa(servidor, editor, ...(faixa as [number, number, number, number]))).toBe(0)
    expect(desenhado).toBeGreaterThan(0) // um caso que não desenha nada passaria a comparação sozinho
  })
})
