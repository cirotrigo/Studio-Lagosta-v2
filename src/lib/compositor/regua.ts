/**
 * A RÉGUA — o contraste medido na peça RENDERIZADA (F2 do plano).
 *
 * O compositor calibra o halo pela luz da foto ESTIMADA sob o bloco; a
 * régua confere o que de fato ficou atrás da letra: renderiza a peça sem os
 * textos (o halo continua — ele mora no texto, então é redesenhado como
 * mancha sozinha), lê o p98 da luminância sob o retângulo de cada bloco e
 * compara com o alvo da cor do texto. É o `aferir.py` do canvas, com uma
 * vantagem: o render é em processo, sem Chrome, então cabe na mesma chamada.
 *
 * Fora do alvo e com folga na faixa → UMA correção da tinta (pelo `cob`,
 * quanto da tinta chegou ao ponto da letra) e nova medida. Ainda fora →
 * a peça SAI com o aviso (regra da casa: reprova avisa, nunca veta) e a
 * medida fica em `fieldValues.composicao.contraste` para quem for olhar.
 */

import type { Layer } from '@/types/template'
import { alvoPorContraste, luzDaCor, type Rect } from '@/lib/creatives/halo/halo'
import { uniao } from '@/lib/creatives/halo/halo'

/**
 * Folga entre o p98 medido e o alvo antes de virar aviso. A faixa de tinta
 * da marca é deliberadamente contida (a mancha não pode virar marcação), e a
 * sombra presa ao glifo cobre o que falta; um ponto acima do alvo não é
 * defeito visível — 12 já é.
 */
export const TOLERANCIA_DO_ALVO = 12

export interface ContrasteMedido {
  grupo: string
  camadas: string[]
  alvo: number
  p98SemHalo: number
  p98ComHalo: number
  tinta: number
  tintaCorrigida: number | null
  ok: boolean
}

export interface ReguaResultado {
  layers: Layer[]
  medidas: ContrasteMedido[]
  avisos: string[]
}

interface Canvas {
  width: number
  height: number
}

function grupoDe(camada: Layer): string {
  const g = camada.metadata?.groupId
  return typeof g === 'string' && g ? g : camada.id
}

function rectDe(camada: Layer): Rect {
  return { x: camada.position.x, y: camada.position.y, width: camada.size.width, height: camada.size.height }
}

async function renderizar(layers: Layer[], canvas: Canvas, background: string): Promise<Buffer> {
  const { CanvasRenderer } = await import('@/lib/canvas-renderer')
  const renderer = new CanvasRenderer(canvas.width, canvas.height)
  return renderer.renderDesign({ canvas: { ...canvas, backgroundColor: background }, layers }, {})
}

/** p98 da luminância de cada retângulo, lido de um PNG renderizado. */
async function p98Sob(png: Buffer, canvas: Canvas, rects: Rect[]): Promise<number[]> {
  const sharp = (await import('sharp')).default
  const largura = Math.min(540, canvas.width)
  const escala = largura / canvas.width
  const altura = Math.max(1, Math.round(canvas.height * escala))
  const { data, info } = await sharp(png).resize(largura, altura, { fit: 'fill' }).grayscale().toColourspace('b-w').raw().toBuffer({ resolveWithObject: true })
  return rects.map((r) => {
    const x0 = Math.max(0, Math.round(r.x * escala))
    const y0 = Math.max(0, Math.round(r.y * escala))
    const x1 = Math.min(info.width, Math.round((r.x + r.width) * escala))
    const y1 = Math.min(info.height, Math.round((r.y + r.height) * escala))
    if (x1 <= x0 || y1 <= y0) return 255
    const hist = new Array<number>(256).fill(0)
    let n = 0
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        hist[data[(y * info.width + x) * info.channels]]++
        n++
      }
    }
    let acc = 0
    for (let v = 0; v < 256; v++) {
      acc += hist[v]
      if (acc >= 0.98 * n) return v
    }
    return 255
  })
}

/**
 * Esconde os textos mantendo a mancha: a régua mede o FUNDO sob a letra, e a
 * letra dentro do percentil mentiria (armadilha 4.5 do `medir.py`). O truque
 * é o `color` transparente — o `effects.background` continua sendo desenhado.
 */
function semTinta(layers: Layer[]): Layer[] {
  return layers.map((l) =>
    l.type === 'text'
      ? { ...l, style: { ...(l.style ?? {}), color: 'rgba(0,0,0,0)' }, effects: { ...(l.effects ?? {}), shadow: { enabled: false, shadowColor: '#000', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, shadowOpacity: 0 }, stroke: undefined } }
      : l,
  )
}

function semHalo(layers: Layer[]): Layer[] {
  return semTinta(layers).map((l) => (l.type === 'text' ? { ...l, effects: { ...(l.effects ?? {}), background: undefined } } : l))
}

export async function medirContrasteDaPeca(args: {
  layers: Layer[]
  canvas: Canvas
  background: string
  /** A faixa de tinta da marca — a correção nunca sai dela. */
  faixa: [number, number]
}): Promise<ReguaResultado> {
  const avisos: string[] = []
  const textos = args.layers.filter((l) => l.type === 'text' && l.visible !== false)
  if (textos.length === 0) return { layers: args.layers, medidas: [], avisos }

  const grupos = new Map<string, Layer[]>()
  for (const t of textos) {
    const g = grupoDe(t)
    grupos.set(g, [...(grupos.get(g) ?? []), t])
  }
  const entradas = [...grupos.entries()].map(([grupo, camadas]) => ({
    grupo,
    camadas,
    rect: uniao(camadas.map(rectDe))!,
    alvo: Math.min(...camadas.map((c) => alvoPorContraste(String(c.style?.color ?? '#FFFFFF'), 3))),
    tinta: Number(camadas[0].effects?.background?.opacity ?? 0),
    mancha: String(camadas[0].effects?.background?.backgroundColor ?? '#111111'),
  }))
  const rects = entradas.map((e) => e.rect)

  const [pngSem, pngCom] = await Promise.all([
    renderizar(semHalo(args.layers), args.canvas, args.background),
    renderizar(semTinta(args.layers), args.canvas, args.background),
  ])
  const [semHaloP98, comHaloP98] = await Promise.all([p98Sob(pngSem, args.canvas, rects), p98Sob(pngCom, args.canvas, rects)])

  let layers = args.layers
  const medidas: ContrasteMedido[] = []
  const correcoes = new Map<string, number>()
  entradas.forEach((e, i) => {
    const sem = semHaloP98[i]
    const com = comHaloP98[i]
    let tintaCorrigida: number | null = null
    if (com > e.alvo && e.tinta > 0 && e.tinta < args.faixa[1]) {
      // cob = quanto da tinta chegou ao ponto da letra; a tinta que atinge o
      // alvo é a bruta dividida por ele — presa à faixa da marca.
      const luzTinta = luzDaCor(e.mancha)
      const cob = sem > luzTinta ? Math.max(0.05, (sem - com) / (sem - luzTinta) / Math.max(0.01, e.tinta)) : 1
      const necessaria = sem > luzTinta ? (sem - e.alvo) / (sem - luzTinta) / cob : 0
      tintaCorrigida = Number(Math.min(args.faixa[1], Math.max(e.tinta, necessaria)).toFixed(3))
      if (tintaCorrigida > e.tinta + 0.01) correcoes.set(e.grupo, tintaCorrigida)
      else tintaCorrigida = null
    }
    medidas.push({ grupo: e.grupo, camadas: e.camadas.map((c) => c.id), alvo: Math.round(e.alvo), p98SemHalo: sem, p98ComHalo: com, tinta: e.tinta, tintaCorrigida, ok: com <= e.alvo + TOLERANCIA_DO_ALVO })
  })

  if (correcoes.size > 0) {
    layers = layers.map((l) => {
      const corrigida = l.type === 'text' ? correcoes.get(grupoDe(l)) : undefined
      return corrigida !== undefined && l.effects?.background
        ? { ...l, effects: { ...l.effects, background: { ...l.effects.background, opacity: corrigida } } }
        : l
    })
    const pngCorrigido = await renderizar(semTinta(layers), args.canvas, args.background)
    const depois = await p98Sob(pngCorrigido, args.canvas, rects)
    medidas.forEach((m, i) => {
      if (correcoes.has(m.grupo)) {
        m.p98ComHalo = depois[i]
        m.tinta = correcoes.get(m.grupo)!
        m.ok = depois[i] <= m.alvo + TOLERANCIA_DO_ALVO
      }
    })
  }

  for (const m of medidas) {
    if (!m.ok) {
      avisos.push(
        `${m.grupo}: a foto está clara demais sob o texto (p98 ${m.p98ComHalo} contra alvo ${m.alvo}, tinta ${m.tinta}) — confira a leitura ou troque a posição/foto.`,
      )
    }
  }
  return { layers, medidas, avisos }
}
