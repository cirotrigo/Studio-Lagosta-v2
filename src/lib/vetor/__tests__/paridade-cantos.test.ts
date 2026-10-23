/**
 * Canto arredondado: servidor (RenderEngine) × editor (Konva real) no MESMO canvas de Node (@napi-rs/canvas).
 *
 * O servidor traçava o canto com `quadraticCurveTo` e o Konva com `arc` (preflight da pílula, 23/10/2026): o raio
 * era o mesmo e a curva não. Aqui:
 * 1. a sequência de chamadas do helper do servidor é a do `Konva.Util.drawRoundedRectPath` real (+ o `closePath` do
 *    `Konva.Rect`), e o contorno arredondado da imagem reutiliza o mesmo helper;
 * 2. pixel a pixel, com alvo 0, nos usos do mapa: `rounded-rectangle` (raio padrão 24 e limites), `rectangle` com raio
 *    (pequeno, meia caixa, maior que meia caixa, caixa quadrada), preenchimento com alfa, rotação, e o recorte da
 *    imagem sem borda contra o `Konva.Image` real;
 * 3. raio negativo no servidor não lança (vira retângulo); NÃO é paridade: o editor não desenha raio negativo;
 * 4. medições SEM alvo de paridade (gravadas com CPV2C_CANTOS_SAIDA=<dir>): a imagem com borda (a ordem foto/traço
 *    difere nos dois lados) e o halo borrado (o blur do editor não é reproduzido no Node).
 *
 * As props do Konva replicam as do `ShapeNode`/`ImageNode` (konva-layer-factory.tsx). Não prova o Konva do navegador
 * (outro rasterizador, devicePixelRatio) nem o React montado.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCanvas, loadImage, type Image as ImagemNapi } from '@napi-rs/canvas'
import { Util } from 'konva/lib/Util'
import { Image as KonvaImage } from 'konva/lib/shapes/Image'
import { Rect } from 'konva/lib/shapes/Rect'
import { beforeAll, describe, expect, it } from 'vitest'
import { RenderEngine } from '@/lib/render-engine'
import type { Layer, LayerStyle } from '@/types/template'
import { FUNDO } from './suporte/fixtures'
import { comparar, pixelsDoNoKonva, pixelsDoServidor, pngDe, type Pixels } from './suporte/konva-no-node'

type Chamada = [string, ...number[]]
/** Um contexto que só grava as chamadas de path (o helper do servidor e o do Konva recebem o mesmo objeto). */
function gravador() {
  const chamadas: Chamada[] = []
  const grava = (nome: string) => (...a: number[]) => void chamadas.push([nome, ...a.map((n) => Math.round(n * 1e9) / 1e9)])
  const ctx = { beginPath: grava('beginPath'), moveTo: grava('moveTo'), lineTo: grava('lineTo'), arc: grava('arc'), rect: grava('rect'), closePath: grava('closePath'), quadraticCurveTo: grava('quadraticCurveTo'), arcTo: grava('arcTo'), stroke: grava('stroke') }
  return { ctx, chamadas }
}
const motor = RenderEngine as unknown as {
  traceRoundedRectPath(ctx: unknown, w: number, h: number, r: number): void
  strokeRoundedRect(ctx: unknown, w: number, h: number, r: number): void
}

const COR = '#1a3987'
const camadaForma = (nome: string, w: number, h: number, style: LayerStyle, extra: Partial<Layer> = {}): Layer => ({
  id: nome, name: nome, type: 'shape', visible: true, locked: false, order: 0, position: { x: 20, y: 20 }, size: { width: w, height: h },
  style: { fillOpacity: 1, strokeOpacity: 1, opacity: 1, ...style }, ...extra,
})

/** As props do `ShapeNode` (konva-layer-factory.tsx) para rectangle e rounded-rectangle, cores sem opacidade de canal. */
function rectDoEditor(camada: Layer) {
  const style = camada.style ?? {}
  const width = Math.max(10, camada.size.width)
  const height = Math.max(10, camada.size.height)
  const borderColor = style.border?.color ?? '#000000'
  const borderWidth = style.border?.width ?? 0
  const borderRadius = style.border?.radius ?? 0
  const stroke = style.strokeColor ? style.strokeColor : borderWidth > 0 ? borderColor : undefined
  const cornerRadius = style.shapeType === 'rounded-rectangle' ? Math.min(borderRadius || 24, Math.min(width, height) / 2) : borderRadius
  return new Rect({ x: camada.position.x, y: camada.position.y, rotation: camada.rotation ?? 0, width, height, cornerRadius, fill: style.fill ?? '#2563eb', stroke, strokeWidth: style.strokeWidth ?? borderWidth ?? 0 })
}

const saida = process.env.CPV2C_CANTOS_SAIDA
const medidas: Record<string, unknown> = {}
function gravar(nome: string, imagens: Record<string, Pixels>, medida: unknown) {
  medidas[nome] = medida
  if (!saida) return
  mkdirSync(saida, { recursive: true })
  for (const [lado, p] of Object.entries(imagens)) writeFileSync(join(saida, `${nome}.${lado}.png`), pngDe(p))
  writeFileSync(join(saida, 'medidas.json'), JSON.stringify(medidas, null, 2))
}

describe('sequência: o helper do servidor faz as chamadas do Konva.Util.drawRoundedRectPath real', () => {
  const casos: Array<[number, number, number]> = [[300, 100, 50], [100, 300, 9999], [300, 100, 8], [300, 100, 24], [200, 200, 100], [200, 200, 9999]]

  it.each(casos)('%i×%i, raio %i: as mesmas chamadas, na mesma ordem, e o path fechado como no Konva.Rect', (w, h, r) => {
    const servidor = gravador()
    motor.traceRoundedRectPath(servidor.ctx, w, h, r)
    const konva = gravador()
    Util.drawRoundedRectPath(konva.ctx as never, w, h, r)
    konva.ctx.closePath() // Rect._sceneFunc fecha o path depois do helper
    expect(servidor.chamadas).toEqual(konva.chamadas)
    expect(servidor.chamadas.filter(([n]) => n === 'arc')).toHaveLength(4)
    expect(servidor.chamadas.some(([n]) => n === 'quadraticCurveTo' || n === 'beginPath')).toBe(false) // quem abre o path é o chamador
  })

  it('raio 0 e negativo: retângulo fechado, como o Konva.Rect sem cornerRadius (nada de arco com raio negativo)', () => {
    for (const r of [0, -5]) {
      const g = gravador()
      motor.traceRoundedRectPath(g.ctx, 300, 100, r)
      expect([r, g.chamadas]).toEqual([r, [['rect', 0, 0, 300, 100], ['closePath']]])
    }
  })

  it('o contorno arredondado da imagem abre o path, usa o MESMO helper e contorna', () => {
    const g = gravador()
    motor.strokeRoundedRect(g.ctx, 300, 200, 24)
    const h = gravador()
    motor.traceRoundedRectPath(h.ctx, 300, 200, 24)
    expect(g.chamadas).toEqual([['beginPath'], ...h.chamadas, ['stroke']])
  })
})

describe('pixel: servidor × Konva.Rect real, alvo 0 px / delta 0', () => {
  const contorno = { strokeColor: COR, strokeWidth: 4 }
  const casos: Array<[string, Layer]> = [
    ['rounded-rectangle sem border (raio 24), só preenchimento', camadaForma('rr-24', 300, 100, { shapeType: 'rounded-rectangle', fill: COR })],
    ['rounded-rectangle sem border (raio 24), com contorno', camadaForma('rr-24-c', 300, 100, { shapeType: 'rounded-rectangle', fill: '#e8590c', ...contorno })],
    ['rounded-rectangle com raio 0 (o chamador usa 24)', camadaForma('rr-0', 300, 100, { shapeType: 'rounded-rectangle', fill: '#e8590c', ...contorno, border: { width: 0, color: 'transparent', radius: 0 } })],
    ['rounded-rectangle quadrado 200×200, raio 9999 (vira círculo)', camadaForma('rr-circ', 200, 200, { shapeType: 'rounded-rectangle', fill: 'transparent', ...contorno, border: { width: 0, color: 'transparent', radius: 9999 } })],
    ['rectangle raio 8 (pequeno), com contorno', camadaForma('r-8', 300, 100, { shapeType: 'rectangle', fill: '#e8590c', ...contorno, border: { width: 0, color: 'transparent', radius: 8 } })],
    ['rectangle raio 50 (meia caixa), com contorno', camadaForma('r-50', 300, 100, { shapeType: 'rectangle', fill: '#e8590c', ...contorno, border: { width: 0, color: 'transparent', radius: 50 } })],
    ['rectangle raio 9999 (maior que meia caixa), 100×300', camadaForma('r-9999', 100, 300, { shapeType: 'rectangle', fill: '#e8590c', ...contorno, border: { width: 0, color: 'transparent', radius: 9999 } })],
    ['rectangle raio 50, preenchimento com alfa 0,5 e contorno opaco', camadaForma('r-alfa', 300, 100, { shapeType: 'rectangle', fill: 'rgba(232, 89, 12, 0.5)', ...contorno, border: { width: 0, color: 'transparent', radius: 50 } })],
    ['rectangle raio 0 (retângulo reto, controle)', camadaForma('r-0', 300, 100, { shapeType: 'rectangle', fill: '#e8590c', ...contorno, border: { width: 0, color: 'transparent', radius: 0 } })],
    ['pílula girada 30°', camadaForma('pilula-30', 300, 100, { shapeType: 'rounded-rectangle', fill: 'transparent', strokeColor: COR, strokeWidth: 2, border: { width: 0, color: 'transparent', radius: 9999 } }, { position: { x: 70, y: 20 }, rotation: 30 })],
  ]

  it.each(casos)('%s', async (nome, camada) => {
    const largura = camada.rotation ? 380 : camada.size.width + 40
    const altura = camada.rotation ? 300 : camada.size.height + 40
    const servidor = await pixelsDoServidor(largura, altura, FUNDO, [camada])
    const editor = pixelsDoNoKonva(largura, altura, FUNDO, () => rectDoEditor(camada))
    const vazio = pixelsDoNoKonva(largura, altura, FUNDO, () => new Rect({ width: 0, height: 0 }))
    const r = comparar(servidor, editor)
    gravar(camada.id, { servidor, editor }, { nome, ...r, pixelsDesenhados: comparar(servidor, vazio).diferentes })
    expect(comparar(servidor, vazio).diferentes).toBeGreaterThan(0)
    expect({ diferentes: r.diferentes, maxDelta: r.maxDelta }).toEqual({ diferentes: 0, maxDelta: 0 })
  })

  it('raio negativo: o servidor desenha um retângulo e não lança (sem paridade: o editor não desenha raio negativo)', async () => {
    for (const shapeType of ['rounded-rectangle', 'rectangle'] as const) {
      const negativo = camadaForma(`neg-${shapeType}`, 300, 100, { shapeType, fill: '#e8590c', ...contorno, border: { width: 0, color: 'transparent', radius: -5 } })
      const reto = camadaForma('reto', 300, 100, { shapeType: 'rectangle', fill: '#e8590c', ...contorno })
      const [a, b] = await Promise.all([pixelsDoServidor(340, 140, FUNDO, [negativo]), pixelsDoServidor(340, 140, FUNDO, [reto])])
      expect([shapeType, comparar(a, b).diferentes]).toEqual([shapeType, 0])
    }
  })
})

describe('imagem: recorte do canto sem borda, servidor × Konva.Image real', () => {
  let png: Buffer
  let imagem: ImagemNapi
  beforeAll(async () => {
    // imagem sintética 300×200 (o tamanho da caixa: qualquer encaixe é a identidade), com detalhe nos cantos
    const c = createCanvas(300, 200)
    const g = c.getContext('2d')
    const grad = g.createLinearGradient(0, 0, 300, 200)
    grad.addColorStop(0, '#0f2027')
    grad.addColorStop(1, '#e8590c')
    g.fillStyle = grad
    g.fillRect(0, 0, 300, 200)
    g.fillStyle = '#f5ebdc'
    for (let x = 0; x < 300; x += 20) g.fillRect(x, 0, 10, 200)
    png = c.toBuffer('image/png')
    imagem = await loadImage(png)
  })

  const camadaImagem = (raio: number, borda: number): Layer => ({
    id: 'img', name: 'img', type: 'image', visible: true, locked: false, order: 0, position: { x: 20, y: 20 }, size: { width: 300, height: 200 },
    fileUrl: `data:image/png;base64,${png.toString('base64')}`,
    style: { objectFit: 'cover', border: { width: borda, color: COR, radius: raio } },
  })
  /** As props do `ImageNode` sem filtro nem crop: `cornerRadius`, e o traço só com borda > 0. */
  const imagemDoEditor = (raio: number, borda: number) =>
    new KonvaImage({ x: 20, y: 20, width: 300, height: 200, image: imagem as never, cornerRadius: raio, stroke: borda > 0 ? COR : undefined, strokeWidth: borda > 0 ? borda : undefined })

  it.each([24, 100, 9999])('raio %i, borda 0: o recorte é o mesmo (alvo 0 px)', async (raio) => {
    const servidor = await pixelsDoServidor(340, 240, FUNDO, [camadaImagem(raio, 0)])
    const editor = pixelsDoNoKonva(340, 240, FUNDO, () => imagemDoEditor(raio, 0))
    const r = comparar(servidor, editor)
    gravar(`imagem-raio-${raio}`, { servidor, editor }, r)
    expect({ diferentes: r.diferentes, maxDelta: r.maxDelta }).toEqual({ diferentes: 0, maxDelta: 0 })
  })

  it('MEDIÇÃO sem alvo de paridade: raio 24 com borda 4 (o editor traça antes da foto, o servidor depois)', async () => {
    const servidor = await pixelsDoServidor(340, 240, FUNDO, [camadaImagem(24, 4)])
    const editor = pixelsDoNoKonva(340, 240, FUNDO, () => imagemDoEditor(24, 4))
    gravar('imagem-raio-24-borda-4', { servidor, editor }, comparar(servidor, editor))
    expect(comparar(servidor, pixelsDoNoKonva(340, 240, FUNDO, () => new Rect({ width: 0, height: 0 }))).diferentes).toBeGreaterThan(0)
  })
})

describe('MEDIÇÃO sem alvo de paridade: halo borrado (o retângulo com raio que aplicar-halo grava), só no servidor', () => {
  it('desenha; os PNGs de antes e depois da correção são comparados fora do teste', async () => {
    const halo = camadaForma('halo', 500, 300, { shapeType: 'rectangle', fill: '#0f2027', fillOpacity: 0.6, strokeWidth: 0, border: { width: 0, color: '#0f2027', radius: 150 } }, { position: { x: 150, y: 150 }, effects: { blur: { enabled: true, blurRadius: 100 } } })
    const servidor = await pixelsDoServidor(800, 600, FUNDO, [halo])
    gravar('halo-raio-150-blur-100', { servidor }, { pixelsDesenhados: comparar(servidor, await pixelsDoServidor(800, 600, FUNDO, [])).diferentes })
    expect(comparar(servidor, await pixelsDoServidor(800, 600, FUNDO, [])).diferentes).toBeGreaterThan(0)
  })
})
