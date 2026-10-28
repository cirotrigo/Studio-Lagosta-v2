/**
 * G4.7 · paridade editor × servidor da GRADE em pixels. Editor = Konva REAL no Node (`konva-no-node`): um `Konva.Group`
 * com as células montadas pelos atributos que o `ImageNode` do editor usa — `ladoMinimoNoEditor` (8 px na célula),
 * `resolveImageSourceRect` (recorte/cover), `cornerRadius = border.radius`, espelho por escala negativa da imagem
 * dentro de um grupo — e, ao lado, a prévia nova do /gerar-criativo (`desenhoDaImagemNaPrevia`, G4.2). Servidor =
 * `CanvasRenderer` → `RenderEngine` → PNG. Fotos sintéticas locais: R = x, G = y, B = 128 com faixas (B 255 numa
 * coluna, 0 numa linha) — dá para ver deslocamento, espelho e deformação.
 *
 * Tolerância: o precedente do Quadrado (`paridade-mascara-quadrada`): nenhum canal RGB com diferença > 8 entre os
 * dois lados (os dois rasterizam no Skia, mas por caminhos diferentes de recorte arredondado e reamostragem) e a cor
 * de amostras internas a < 4 da origem prevista pelo recorte. A célula 8×8 é conferida na região LOCAL dela e pela
 * caixa ocupada (um percentual global esconderia 20 px de erro). Sensibilidade: sem o recorte, sem o raio ou no piso
 * antigo de 20 px, a mesma conta acusa a diferença. Limite: napi × napi no Node — não é o Konva do navegador, nem o
 * componente React montado, nem o devicePixelRatio da tela.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { loadImage, type Image as ImagemNapi } from '@napi-rs/canvas'
import { Group } from 'konva/lib/Group'
import { Image as KonvaImage } from 'konva/lib/shapes/Image'
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect'
import type { Shape } from 'konva/lib/Shape'
import type { Layer } from '@/types/template'
import { resolveImageSourceRect } from '@/lib/image-fit'
import { desenhoDaImagemNaPrevia } from '@/lib/gerar-criativo/previa-da-imagem'
import { pixelsDoNoKonva, pixelsDoServidor, pngDe, type Pixels } from '@/lib/vetor/__tests__/suporte/konva-no-node'
import { ladoMinimoNoEditor } from '../ajustes'
import { celulaVazia, conferirGrade, metadadoDeGrade } from '../conferir'
import { criarGrade, preencherCelula, refazerGrade } from '../operacoes'
import { BLOB } from './fixtures'

const FUNDO = '#000000'
const LIMITE_POR_CANAL = 8
const LIMITE_DA_AMOSTRA = 4

// ── Fotos sintéticas ───────────────────────────────────────────────────────
const NATURAIS: Record<string, { width: number; height: number }> = {
  horizontal: { width: 1600, height: 1000 },
  vertical: { width: 900, height: 1500 },
  quadrada: { width: 1200, height: 1200 },
}
const url = (nome: string) => `${BLOB}/sinteticas/${nome}.png`
const nomeDa = (u: string) => u.slice(u.lastIndexOf('/') + 1, -4)
const png: Record<string, Buffer> = {}
const img: Record<string, ImagemNapi> = {}
async function foto(W: number, H: number) {
  const raw = Buffer.alloc(W * H * 3)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      raw[i] = Math.round((x / (W - 1)) * 255)
      raw[i + 1] = Math.round((y / (H - 1)) * 255)
      raw[i + 2] = x >= 0.1 * W && x < 0.14 * W ? 255 : y >= 0.8 * H && y < 0.84 * H ? 0 : 128
    }
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer()
}
beforeAll(async () => {
  for (const [nome, n] of Object.entries(NATURAIS)) {
    png[nome] = await foto(n.width, n.height)
    img[nome] = await loadImage(png[nome])
  }
}, 60_000)

// ── Estados (motor real do G0–G3) ──────────────────────────────────────────
/** Recorte manual descentralizado com a proporção da caixa (o que o recorte in-canvas grava), a partir de x, y e altura */
const recorte = (x: number, y: number, altura: number) => ({ recorte: { x, y, altura } })
function preenchida(r: ReturnType<typeof criarGrade>, fotos: Array<string | null>, estilo: Record<number, Partial<NonNullable<Layer['style']>> & { recorte?: { x: number; y: number; altura: number } }> = {}) {
  if (!r.ok) throw new Error(JSON.stringify(r.diagnosticos))
  return r.valor.map((c, i) => {
    if (!fotos[i]) return c
    const p = preencherCelula(c, url(fotos[i]!))
    if (!p.ok) throw new Error(JSON.stringify(p.diagnosticos))
    const { recorte: rc, ...resto } = estilo[i] ?? {}
    const n = NATURAIS[fotos[i]!]
    const crop = rc ? { crop: { x: rc.x, y: rc.y, height: rc.altura, width: (rc.altura * n.height * c.size!.width) / c.size!.height / n.width } } : {}
    return { ...p.valor, style: { ...p.valor.style, ...resto, ...crop } }
  })
}
const ESTADOS = {
  /** Story 2/1/2: recorte descentralizado, vazia, espelho H, espelho V, cover simples; raio 30 */
  'Story 2/1/2': () => ({
    canvas: { width: 1080, height: 1920 },
    layers: preenchida(criarGrade({ layout: '2-1-2', caixa: { x: 40, y: 520, w: 1000, h: 1340 }, espacamento: 12, raio: 30, idDaGrade: 'gs', idsDasCelulas: ['s0', 's1', 's2', 's3', 's4'] }), ['horizontal', null, 'vertical', 'quadrada', 'horizontal'], {
      0: recorte(0.37, 0.11, 0.5),
      2: { flipH: true },
      3: { flipV: true },
    }),
  }),
  /** Feed 2×3 com raio acima do possível: cada célula vira cápsula (clamp na meia célula) */
  'Feed 2×3 cápsula': () => ({
    canvas: { width: 1080, height: 1350 },
    layers: preenchida(criarGrade({ layout: '2x3', caixa: { x: 0, y: 0, w: 1080, h: 1350 }, espacamento: 10, raio: 9999, idDaGrade: 'gf', idsDasCelulas: ['f0', 'f1', 'f2', 'f3', 'f4', 'f5'] }), ['vertical', 'horizontal', 'quadrada', null, 'horizontal', 'vertical'], {
      1: { flipH: true, flipV: true },
      4: recorte(0.05, 0.4, 0.55),
    }),
  }),
  /** Feed 2 colunas, raio 0, depois REDIMENSIONADA pelo `refazerGrade` (recorte refeito pelo cropForResizedBox) */
  'Feed 2 colunas raio 0 redimensionada': () => {
    const base = preenchida(criarGrade({ layout: '2-colunas', caixa: { x: 60, y: 100, w: 960, h: 900 }, espacamento: 20, raio: 0, idDaGrade: 'gr', idsDasCelulas: ['r0', 'r1'] }), ['horizontal', 'vertical'], {
      0: recorte(0.2, 0.15, 0.7),
    })
    const dimensoes = new Map(base.map((c) => [c.fileUrl!, NATURAIS[nomeDa(c.fileUrl!)]]))
    const r = refazerGrade(base, { caixa: { x: 60, y: 100, w: 700, h: 1100 } }, dimensoes)
    if (!r.ok) throw new Error(JSON.stringify(r.diagnosticos))
    expect(r.valor.avulsas).toEqual([])
    return { canvas: { width: 1080, height: 1350 }, layers: r.valor.celulas }
  },
  /** A célula mínima do G0: 8×8 px (2 colunas de 26×8 com espaçamento 10) */
  'célula 8×8': () => ({
    canvas: { width: 240, height: 120 },
    layers: preenchida(criarGrade({ layout: '2-colunas', caixa: { x: 101, y: 53, w: 26, h: 8 }, espacamento: 10, raio: 0, idDaGrade: 'g8', idsDasCelulas: ['m0', 'm1'] }), ['quadrada', 'horizontal']),
  }),
  /** Q2 · Story 4×7 com o espaçamento inicial (0): 28 quadrados de 270 e a margem de 15 em cima e embaixo */
  'Story 4×7 quadrada (28)': () => ({
    canvas: { width: 1080, height: 1920 },
    layers: preenchida(criarGrade({ layout: '4x7-quadrada', caixa: { x: 0, y: 0, w: 1080, h: 1920 }, idDaGrade: 'gq7', idsDasCelulas: Array.from({ length: 28 }, (_, i) => `q${i}`) }), Array.from({ length: 28 }, (_, i) => ['horizontal', 'vertical', 'quadrada'][i % 3]), {
      0: recorte(0.2, 0.1, 0.6),
      5: { flipH: true },
    }),
  }),
  /** Q2 · Feed 4×5 com calha 10 e raio 12: quadrados de 262 e a margem lateral de 1 */
  'Feed 4×5 quadrada (20)': () => ({
    canvas: { width: 1080, height: 1350 },
    layers: preenchida(criarGrade({ layout: '4x5-quadrada', caixa: { x: 0, y: 0, w: 1080, h: 1350 }, espacamento: 10, raio: 12, idDaGrade: 'gq5', idsDasCelulas: Array.from({ length: 20 }, (_, i) => `r${i}`) }), Array.from({ length: 20 }, (_, i) => ['vertical', 'quadrada', 'horizontal'][i % 3]), {
      3: recorte(0.05, 0.3, 0.5),
      7: { flipV: true },
    }),
  }),
  /** Q3 · Story 4×7 com calha 40: quadrados de 240 e encaixe exato nos dois eixos */
  'Story 4×7 quadrada calha 40 (28)': () => ({
    canvas: { width: 1080, height: 1920 },
    layers: preenchida(criarGrade({ layout: '4x7-quadrada', caixa: { x: 0, y: 0, w: 1080, h: 1920 }, espacamento: 40, idDaGrade: 'gq7b', idsDasCelulas: Array.from({ length: 28 }, (_, i) => `t${i}`) }), Array.from({ length: 28 }, (_, i) => ['quadrada', 'horizontal', 'vertical'][i % 3]), {
      9: recorte(0.3, 0.2, 0.5),
      14: { flipH: true, flipV: true },
    }),
  }),
  /** Q3 · Feed 4×5 com o espaçamento inicial (0): quadrados de 270, encaixe exato */
  'Feed 4×5 quadrada calha 0 (20)': () => ({
    canvas: { width: 1080, height: 1350 },
    layers: preenchida(criarGrade({ layout: '4x5-quadrada', caixa: { x: 0, y: 0, w: 1080, h: 1350 }, idDaGrade: 'gq5b', idsDasCelulas: Array.from({ length: 20 }, (_, i) => `u${i}`) }), Array.from({ length: 20 }, (_, i) => ['horizontal', 'quadrada', 'vertical'][i % 3]), {
      6: recorte(0.1, 0.05, 0.6),
      11: { flipH: true },
    }),
  }),
}
/** Pasta opcional para guardar o PNG do servidor das grades quadradas (amostra visual; não é QA de navegador) */
const AMOSTRAS = process.env.GRADES_AMOSTRAS_PNG

// ── Os três desenhos ───────────────────────────────────────────────────────
type Opcoes = { semRecorte?: boolean; semRaio?: boolean; pisoAntigo?: boolean }
/** Editor: os atributos que o `ImageNode` usa (piso, recorte, raio, espelho no grupo; vazia = o marcador da célula) */
function noDoEditor(c: Layer, o: Opcoes = {}) {
  const piso = o.pisoAntigo ? 20 : ladoMinimoNoEditor(c)
  const width = Math.max(piso, c.size!.width)
  const height = Math.max(piso, c.size!.height)
  const raio = o.semRaio ? 0 : (c.style?.border?.radius ?? 0)
  if (celulaVazia(c.fileUrl)) return new KonvaRect({ x: c.position!.x, y: c.position!.y, width, height, cornerRadius: raio, fill: '#f5f5f5', stroke: '#d4d4d8', dash: [8, 4] })
  const nome = nomeDa(c.fileUrl!)
  const src = o.semRecorte ? undefined : resolveImageSourceRect(NATURAIS[nome], { width, height }, c.style)
  const flipH = c.style?.flipH === true
  const flipV = c.style?.flipV === true
  const imagem = new KonvaImage({
    image: img[nome] as unknown as HTMLImageElement, width, height, cornerRadius: raio,
    ...(src ? { crop: { x: src.cropX, y: src.cropY, width: src.cropWidth, height: src.cropHeight } } : {}),
    ...(flipH || flipV ? { x: flipH ? width : 0, y: flipV ? height : 0, scaleX: flipH ? -1 : 1, scaleY: flipV ? -1 : 1 } : { x: c.position!.x, y: c.position!.y }),
  })
  if (!flipH && !flipV) return imagem
  const g = new Group({ x: c.position!.x, y: c.position!.y })
  g.add(imagem)
  return g
}
/** Prévia nova do /gerar-criativo: o helper real (sem o marcador da vazia, que a prévia não desenha) */
function noDaPrevia(c: Layer) {
  if (celulaVazia(c.fileUrl)) return null
  const nome = nomeDa(c.fileUrl!)
  const d = desenhoDaImagemNaPrevia(c, NATURAIS[nome])
  const imagem = new KonvaImage({ image: img[nome] as unknown as HTMLImageElement, width: d.largura, height: d.altura, cornerRadius: d.cornerRadius, ...(d.crop ? { crop: d.crop } : {}), ...(d.espelho ?? { x: c.position!.x, y: c.position!.y }) })
  if (!d.espelho) return imagem
  const g = new Group({ x: c.position!.x, y: c.position!.y })
  g.add(imagem)
  return g
}
function konva(canvas: { width: number; height: number }, layers: Layer[], criar: (c: Layer) => unknown) {
  return pixelsDoNoKonva(canvas.width, canvas.height, FUNDO, () => {
    const raiz = new Group()
    for (const c of layers) {
      const no = criar(c)
      if (no) raiz.add(no as Group)
    }
    return raiz as unknown as Shape
  })
}
const servidor = (canvas: { width: number; height: number }, layers: Layer[]) =>
  pixelsDoServidor(canvas.width, canvas.height, FUNDO, layers.map((c) => (celulaVazia(c.fileUrl) ? c : { ...c, fileUrl: `data:image/png;base64,${png[nomeDa(c.fileUrl!)].toString('base64')}` })))

// ── Medidas ────────────────────────────────────────────────────────────────
type Regiao = { x0: number; y0: number; x1: number; y1: number }
const toda = (p: Pixels): Regiao => ({ x0: 0, y0: 0, x1: p.largura, y1: p.altura })
const dentro = (r: Regiao, x: number, y: number) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1
/** Canais RGB acima do limite e a maior diferença, na região, fora das regiões excluídas */
function diferenca(a: Pixels, b: Pixels, regiao: Regiao, fora: Regiao[] = []) {
  let acima = 0
  let maior = 0
  for (let y = regiao.y0; y < regiao.y1; y++)
    for (let x = regiao.x0; x < regiao.x1; x++) {
      if (fora.some((f) => dentro(f, x, y))) continue
      const i = (y * a.largura + x) * 4
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(a.dados[i + k] - b.dados[i + k])
        if (d > LIMITE_POR_CANAL) acima++
        if (d > maior) maior = d
      }
    }
  return { acima, maior }
}
/** A caixa da célula em px inteiros, com folga do antialias da borda */
const caixaDe = (c: Layer, folga = 0): Regiao => ({
  x0: Math.floor(c.position!.x) - folga,
  y0: Math.floor(c.position!.y) - folga,
  x1: Math.ceil(c.position!.x + c.size!.width) + folga,
  y1: Math.ceil(c.position!.y + c.size!.height) + folga,
})
/** Onde há foto (B ≥ 64 só na foto) numa região */
function ocupada(p: Pixels, r: Regiao) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
  for (let y = r.y0; y < r.y1; y++)
    for (let x = r.x0; x < r.x1; x++) {
      const i = (y * p.largura + x) * 4
      if (p.dados[i + 2] >= 64 || p.dados[i] >= 64 || p.dados[i + 1] >= 64) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1)
      }
    }
  return { x0, y0, x1, y1 }
}
/** A cor que o servidor mostra numa amostra interna bate com a origem prevista pelo recorte (sem espelho) */
function amostraBate(s: Pixels, c: Layer, fx: number, fy: number) {
  const nome = nomeDa(c.fileUrl!)
  const n = NATURAIS[nome]
  const src = resolveImageSourceRect(n, { width: c.size!.width, height: c.size!.height }, c.style)!
  const px = Math.floor(c.position!.x + fx * c.size!.width)
  const py = Math.floor(c.position!.y + fy * c.size!.height)
  let ox = src.cropX + (px + 0.5 - c.position!.x) * (src.cropWidth / c.size!.width)
  let oy = src.cropY + (py + 0.5 - c.position!.y) * (src.cropHeight / c.size!.height)
  if (c.style?.flipH) ox = src.cropX + src.cropWidth - (ox - src.cropX)
  if (c.style?.flipV) oy = src.cropY + src.cropHeight - (oy - src.cropY)
  const i = (py * s.largura + px) * 4
  return [Math.abs(s.dados[i] - (ox / (n.width - 1)) * 255), Math.abs(s.dados[i + 1] - (oy / (n.height - 1)) * 255)]
}

describe('G4.7 · paridade editor × servidor da grade (Konva real no Node × RenderEngine)', () => {
  for (const [nome, criar] of Object.entries(ESTADOS)) {
    it(`${nome}: editor e prévia = servidor (nenhum canal > ${LIMITE_POR_CANAL}), amostras internas na origem do recorte`, async () => {
      const { canvas, layers } = criar()
      expect(conferirGrade(layers)).toEqual([])
      const s = await servidor(canvas, layers)
      if (AMOSTRAS && nome.includes('quadrada')) {
        mkdirSync(AMOSTRAS, { recursive: true })
        writeFileSync(join(AMOSTRAS, `${nome.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/-+$/, '')}.png`), pngDe(s))
      }
      const vazias = layers.filter((c) => celulaVazia(c.fileUrl)).map((c) => caixaDe(c, 1))

      const e = konva(canvas, layers, (c) => noDoEditor(c))
      const doEditor = diferenca(s, e, toda(s), vazias)
      expect(doEditor.acima, `editor: maior delta ${doEditor.maior}`).toBe(0)
      const p = konva(canvas, layers, noDaPrevia)
      const daPrevia = diferenca(s, p, toda(s))
      expect(daPrevia.acima, `prévia: maior delta ${daPrevia.maior}`).toBe(0)
      console.log(`[paridade] ${nome}: maior delta por canal — editor ${doEditor.maior}, prévia ${daPrevia.maior}`)

      for (const c of layers.filter((x) => !celulaVazia(x.fileUrl) && x.size!.width > 40)) {
        for (const [fx, fy] of [[0.3, 0.3], [0.5, 0.5], [0.7, 0.6]]) {
          const [dr, dg] = amostraBate(s, c, fx, fy)
          expect(Math.max(dr, dg), `${c.id} (${fx}, ${fy})`).toBeLessThan(LIMITE_DA_AMOSTRA)
        }
      }
      // célula vazia: a arte publicada deixa o fundo; o editor desenha o marcador (por isso o aviso ao agendar, G4.6)
      for (const c of layers.filter((x) => celulaVazia(x.fileUrl))) {
        const r = caixaDe(c, -2)
        const fundo = { largura: s.largura, altura: s.altura, dados: new Uint8ClampedArray(s.dados.length).fill(0).map((_, i) => (i % 4 === 3 ? 255 : 0)) }
        expect(diferenca(s, fundo, r).maior, `${c.id} no servidor`).toBe(0)
        expect(diferenca(e, fundo, r).acima, `${c.id} no editor`).toBeGreaterThan(0)
      }
    }, 60_000)
  }

  it('célula 8×8: região LOCAL igual e caixa ocupada exatamente a da célula nos três desenhos', async () => {
    const { canvas, layers } = ESTADOS['célula 8×8']()
    const s = await servidor(canvas, layers)
    const e = konva(canvas, layers, (c) => noDoEditor(c))
    const p = konva(canvas, layers, noDaPrevia)
    for (const c of layers) {
      expect(c.size).toEqual({ width: 8, height: 8 })
      const local = caixaDe(c, 4)
      expect(diferenca(s, e, local).acima, c.id).toBe(0)
      expect(diferenca(s, p, local).acima, c.id).toBe(0)
      const caixa = caixaDe(c)
      for (const desenho of [s, e, p]) expect(ocupada(desenho, local)).toEqual(caixa)
    }
  })

  it('sensibilidade: sem o recorte, sem o raio ou no piso antigo de 20 px a mesma conta acusa a diferença', async () => {
    const story = ESTADOS['Story 2/1/2']()
    const s = await servidor(story.canvas, story.layers)
    const vazias = story.layers.filter((c) => celulaVazia(c.fileUrl)).map((c) => caixaDe(c, 1))
    const recortada = story.layers.find((c) => c.id === 's0')!
    const semRecorte = konva(story.canvas, story.layers, (c) => noDoEditor(c, { semRecorte: c.id === 's0' }))
    const dRecorte = diferenca(s, semRecorte, caixaDe(recortada))
    expect(dRecorte.acima).toBeGreaterThan(1000)
    const semRaio = konva(story.canvas, story.layers, (c) => noDoEditor(c, { semRaio: true }))
    const dRaio = diferenca(s, semRaio, toda(s), vazias)
    expect(dRaio.acima).toBeGreaterThan(0)

    const minima = ESTADOS['célula 8×8']()
    const s8 = await servidor(minima.canvas, minima.layers)
    const piso20 = konva(minima.canvas, minima.layers, (c) => noDoEditor(c, { pisoAntigo: true }))
    const m0 = minima.layers[0]
    const dPiso = diferenca(s8, piso20, caixaDe(m0, 14))
    expect(dPiso.acima).toBeGreaterThan(0)
    expect(ocupada(piso20, caixaDe(m0, 14))).not.toEqual(caixaDe(m0))
    console.log(`[sensibilidade] sem recorte: ${dRecorte.acima} canais > ${LIMITE_POR_CANAL} (maior ${dRecorte.maior}); sem raio: ${dRaio.acima} (maior ${dRaio.maior}); piso de 20 px na célula 8×8: ${dPiso.acima} (maior ${dPiso.maior}), caixa ${JSON.stringify(ocupada(piso20, caixaDe(m0, 14)))} × ${JSON.stringify(caixaDe(m0))}`)
  })

  it('os estados são os do motor: grade coerente, metadados exatos e geometria a 1e-6', () => {
    for (const criar of Object.values(ESTADOS)) {
      const { layers } = criar()
      expect(conferirGrade(layers)).toEqual([])
      expect(new Set(layers.map((c) => metadadoDeGrade(c)!.id)).size).toBe(1)
    }
  })
})
