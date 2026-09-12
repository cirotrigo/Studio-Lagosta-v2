/**
 * A RÉGUA — o contraste medido na peça RENDERIZADA (F2 do plano).
 *
 * O compositor calibra o gradiente de leitura pela luz da foto ESTIMADA sob o
 * bloco; a régua confere o que de fato ficou atrás da letra: renderiza a peça
 * sem os textos (com e sem o gradiente), lê o p98 da luminância sob o
 * retângulo de cada bloco e compara com o alvo da cor do texto. É o
 * `aferir.py` do canvas, com uma vantagem: o render é em processo, sem
 * Chrome, então cabe na mesma chamada.
 *
 * Fora do alvo e com folga na faixa → UMA correção da FORÇA do gradiente
 * daquela borda (pelo `cob`, quanto da força chegou ao ponto da letra) e nova
 * medida. Ainda fora → a peça SAI com o aviso (regra da casa: reprova avisa,
 * nunca veta) e a medida fica em `fieldValues.composicao.contraste`.
 *
 * Até 11/09/2026 a régua corrigia a opacidade do HALO; o halo saiu do
 * compositor e a mesma conta passou para a força do gradiente.
 */

import type { Layer } from '@/types/template'
import { alvoPorContraste, luminanciaRelativa, luzDaCor, uniao, type Rect } from '@/lib/creatives/halo/halo'
import { bordaDoGrupo, comForca, ehGradienteDeLeitura, forcaDaCamada, type Borda } from './gradiente-de-leitura'

/**
 * Para TEXTO ESCURO a pergunta se inverte: o fundo precisa ser CLARO o
 * bastante. Luminância mínima do fundo (0..255) para 3:1 com a cor dada.
 */
export function alvoClaroPorContraste(corHex: string, ratio = 3): number {
  const lt = luminanciaRelativa(corHex)
  const lbg = Math.min(1, ratio * (lt + 0.05) - 0.05)
  const srgb = lbg <= 0.0031308 ? lbg * 12.92 : 1.055 * Math.pow(lbg, 1 / 2.4) - 0.055
  return Math.round(Math.max(0, Math.min(1, srgb)) * 255)
}

export function textoEscuro(corHex: string): boolean {
  return luzDaCor(corHex) < 128
}

/**
 * Folga entre o p98 medido e o alvo antes de virar aviso. A faixa de força
 * da marca é deliberadamente contida (o gradiente não pode virar véu), e a
 * sombra presa ao glifo cobre o que falta; um ponto acima do alvo não é
 * defeito visível — 12 já é.
 */
export const TOLERANCIA_DO_ALVO = 12

export interface ContrasteMedido {
  grupo: string
  camadas: string[]
  /** `claro` = texto claro sobre gradiente escuro (p98 ≤ alvo); `escuro` = texto escuro, o fundo tem de ser claro (p02 ≥ alvo). */
  sentido: 'claro' | 'escuro'
  alvo: number
  /** Medido sem o gradiente de leitura (o nome é histórico: era "sem halo"). */
  p98SemHalo: number
  /** Medido com o gradiente de leitura. */
  p98ComHalo: number
  /** A força do gradiente da borda do bloco (0 quando nenhum o cobre). */
  tinta: number
  tintaCorrigida: number | null
  /** O id da camada de gradiente que cobre o bloco (ausente em medidas anteriores a 11/09/2026). */
  gradiente?: string | null
  ok: boolean
  /**
   * A medida ANTES da correção desta chamada — presente só quando a régua
   * corrigiu a força. É o que deixa o revisor dizer "não dava leitura, e com a
   * força X passa a dar" a partir de UMA rodada de render.
   */
  antesDaCorrecao?: { p98: number; ok: boolean; tinta: number }
}

export interface IntervencaoDeTexto {
  /** Frações 0..1, medidas na imagem inteira reduzida a 180px. */
  alteracaoMedia: number
  escurecimentoMedio: number
}

export interface ReguaResultado {
  intervencao?: IntervencaoDeTexto
  layers: Layer[]
  medidas: ContrasteMedido[]
  avisos: string[]
}

interface Canvas {
  width: number
  height: number
}

function ehTexto(camada: Layer): boolean {
  return camada.type === 'text' || camada.type === 'rich-text'
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

/** Percentil da luminância de cada retângulo, lido de um PNG renderizado. */
async function percentilSob(png: Buffer, canvas: Canvas, rects: Rect[], q = 0.98): Promise<number[]> {
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
      if (acc >= q * n) return v
    }
    return 255
  })
}

const TRANSPARENTE = 'rgba(0,0,0,0)'

/**
 * Esconde a TINTA dos textos: a régua mede o FUNDO sob a letra, e a letra
 * dentro do percentil mentiria (armadilha 4.5 do `medir.py`). No rich text a
 * cor mora também em cada trecho — sem apagá-los, o destaque continuava
 * desenhado e contava como fundo.
 */
function semTinta(layers: Layer[]): Layer[] {
  return layers.map((l) => {
    if (!ehTexto(l)) return l
    const apagada: Layer = {
      ...l,
      style: { ...(l.style ?? {}), color: TRANSPARENTE },
      effects: { ...(l.effects ?? {}), shadow: { enabled: false, shadowColor: '#000', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, shadowOpacity: 0 }, stroke: undefined },
    }
    if (l.type === 'rich-text' && Array.isArray(l.richTextStyles)) {
      apagada.richTextStyles = l.richTextStyles.map((s) => ({ ...s, fill: TRANSPARENTE, shadow: undefined, stroke: undefined }))
    }
    return apagada
  })
}

/** A peça sem nenhum tratamento de leitura: sem gradiente de leitura e sem fundo de texto. */
function semTratamento(layers: Layer[]): Layer[] {
  return semTinta(layers)
    .filter((l) => !ehGradienteDeLeitura(l))
    .map((l) => (ehTexto(l) ? { ...l, effects: { ...(l.effects ?? {}), background: undefined } } : l))
}

function bordaDaCamada(l: Layer, H: number): Borda {
  const b = l.metadata?.borda
  if (b === 'topo' || b === 'rodape') return b
  return (l.position?.y ?? 0) <= 1 && (l.size?.height ?? 0) < H ? 'topo' : 'rodape'
}

function corDaCamada(l: Layer): string {
  const stops = (l.style as { gradientStops?: Array<{ color?: string }> } | undefined)?.gradientStops ?? []
  return stops.find((s) => typeof s.color === 'string')?.color ?? '#111111'
}

export async function medirContrasteDaPeca(args: {
  layers: Layer[]
  canvas: Canvas
  background: string
  /** A faixa de FORÇA do gradiente da marca — a correção nunca sai dela. */
  faixa: [number, number]
  /** `false` = só medir e avisar. */
  corrigir?: boolean
  medirIntervencao?: boolean
}): Promise<ReguaResultado> {
  const avisos: string[] = []
  const textos = args.layers.filter((l) => ehTexto(l) && l.visible !== false)
  if (textos.length === 0) return { layers: args.layers, medidas: [], avisos }
  const gradientes = args.layers.filter((l) => (l.type === 'gradient' || l.type === 'gradient2') && l.visible !== false && ehGradienteDeLeitura(l))

  const grupos = new Map<string, Layer[]>()
  for (const t of textos) {
    const g = grupoDe(t)
    grupos.set(g, [...(grupos.get(g) ?? []), t])
  }
  const entradas = [...grupos.entries()].map(([grupo, camadas]) => {
    const rect = uniao(camadas.map(rectDe))!
    const borda = bordaDoGrupo(rect, null, args.canvas.height)
    const gradiente = gradientes.find((g) => bordaDaCamada(g, args.canvas.height) === borda) ?? null
    const mancha = gradiente ? corDaCamada(gradiente) : String(camadas[0].effects?.background?.backgroundColor ?? '#111111')
    // "Escuro" é texto escuro SOBRE GRADIENTE CLARO (Real: verde sobre creme).
    // Vermelho ou amarelo saturado sobre gradiente escuro (Espeto, By Rock)
    // têm luz baixa mas leem pelo contraste de cor — medi-los como escuros
    // acusava 'fundo escuro demais' em toda peça.
    const escuro = camadas.every((c) => textoEscuro(String(c.style?.color ?? '#FFFFFF'))) && luzDaCor(mancha) >= 128
    return {
      grupo,
      camadas,
      rect,
      escuro,
      alvo: escuro
        ? Math.max(...camadas.map((c) => alvoClaroPorContraste(String(c.style?.color ?? '#000000'), 3)))
        : Math.min(...camadas.map((c) => alvoPorContraste(String(c.style?.color ?? '#FFFFFF'), 3))),
      gradiente,
      tinta: gradiente ? forcaDaCamada(gradiente) : 0,
      mancha,
    }
  })
  const rects = entradas.map((e) => e.rect)

  const [pngSem, pngCom] = await Promise.all([
    renderizar(semTratamento(args.layers), args.canvas, args.background),
    renderizar(semTinta(args.layers), args.canvas, args.background),
  ])
  let pngFinal = pngCom
  const qs = entradas.map((e) => (e.escuro ? 0.02 : 0.98))
  const medirTodos = async (png: Buffer) => {
    const claros = await percentilSob(png, args.canvas, rects, 0.98)
    const escuros = await percentilSob(png, args.canvas, rects, 0.02)
    return rects.map((_, i) => (qs[i] === 0.02 ? escuros[i] : claros[i]))
  }
  const [semP98, comP98] = await Promise.all([medirTodos(pngSem), medirTodos(pngCom)])

  let layers = args.layers
  const medidas: ContrasteMedido[] = []
  /** Força corrigida por camada de gradiente — a borda serve vários blocos, vale o mais exigente. */
  const correcoes = new Map<string, number>()
  entradas.forEach((e, i) => {
    const sem = semP98[i]
    const com = comP98[i]
    let tintaCorrigida: number | null = null
    // Texto escuro: a régua só CONFERE (o gradiente claro é desenho da equipe).
    if (args.corrigir !== false && !e.escuro && e.gradiente && com > e.alvo && e.tinta > 0 && e.tinta < args.faixa[1]) {
      // cob = quanto da força chegou ao ponto da letra (a curva enfraquece
      // longe da borda); a força que atinge o alvo é a bruta dividida por ele.
      const luzTinta = luzDaCor(e.mancha)
      const cob = sem > luzTinta ? Math.max(0.05, (sem - com) / (sem - luzTinta) / Math.max(0.01, e.tinta)) : 1
      const necessaria = sem > luzTinta ? (sem - e.alvo) / (sem - luzTinta) / cob : 0
      tintaCorrigida = Number(Math.min(args.faixa[1], Math.max(e.tinta, necessaria)).toFixed(3))
      if (tintaCorrigida > e.tinta + 0.01) correcoes.set(e.gradiente.id, Math.max(correcoes.get(e.gradiente.id) ?? 0, tintaCorrigida))
      else tintaCorrigida = null
    }
    const ok = e.escuro ? com >= e.alvo - TOLERANCIA_DO_ALVO : com <= e.alvo + TOLERANCIA_DO_ALVO
    medidas.push({
      grupo: e.grupo,
      camadas: e.camadas.map((c) => c.id),
      sentido: e.escuro ? 'escuro' : 'claro',
      alvo: Math.round(e.alvo),
      p98SemHalo: sem,
      p98ComHalo: com,
      tinta: e.tinta,
      tintaCorrigida,
      gradiente: e.gradiente?.id ?? null,
      ok,
    })
  })

  if (correcoes.size > 0) {
    layers = layers.map((l) => (correcoes.has(l.id) ? comForca(l, correcoes.get(l.id)!) : l))
    const pngCorrigido = await renderizar(semTinta(layers), args.canvas, args.background)
    pngFinal = pngCorrigido
    const depois = await medirTodos(pngCorrigido)
    medidas.forEach((m, i) => {
      if (m.gradiente && correcoes.has(m.gradiente)) {
        m.antesDaCorrecao = { p98: m.p98ComHalo, ok: m.ok, tinta: m.tinta }
        m.p98ComHalo = depois[i]
        m.tinta = correcoes.get(m.gradiente)!
        m.ok = m.sentido === 'escuro' ? depois[i] >= m.alvo - TOLERANCIA_DO_ALVO : depois[i] <= m.alvo + TOLERANCIA_DO_ALVO
      }
    })
  }

  for (const m of medidas) {
    if (!m.ok) {
      avisos.push(
        m.sentido === 'escuro'
          ? `${m.grupo}: o fundo está escuro demais para o texto escuro (p2 ${m.p98ComHalo} contra alvo ${m.alvo}) — confira a leitura.`
          : `${m.grupo}: a foto está clara demais sob o texto (p98 ${m.p98ComHalo} contra alvo ${m.alvo}, força do gradiente ${m.tinta}) — confira a leitura ou troque a posição/foto.`,
      )
    }
  }
  let intervencao: IntervencaoDeTexto | undefined
  if (args.medirIntervencao) {
    const sharp = (await import('sharp')).default
    const { compararTons } = await import('./comparar-baseline')
    const cinza = (png: Buffer) => sharp(png).resize(180).removeAlpha().grayscale().toColourspace('b-w').raw().toBuffer()
    const [antes, depois] = await Promise.all([cinza(pngSem), cinza(pngFinal)])
    intervencao = compararTons(antes, depois)
  }
  return { layers, medidas, avisos, ...(intervencao ? { intervencao } : {}) }
}
