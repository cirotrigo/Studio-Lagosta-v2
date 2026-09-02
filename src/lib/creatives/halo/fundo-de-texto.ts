/**
 * FUNDO DE TEXTO — o halo como efeito do editor, em contrato PURO.
 *
 * O halo do canvas de design (`design-canvas/_halo.py`) é uma caixa escura
 * atrás do BLOCO de texto, com `filter: blur()` nela mesma, que desmancha nas
 * bordas e escurece só onde a letra cai. Aqui ele vira o efeito `background`
 * da camada de texto, estendido: `fit: 'texto'` cobre a TINTA das linhas em
 * vez da caixa inteira (o `width: fit-content` do `_halo.py`), e `blur` borra
 * a mancha nos próprios pixels — nunca a foto atrás.
 *
 * Este módulo não importa Konva, sharp nem Prisma: é consumido pelo editor
 * (client), pelo render server-side e pelos testes. As duas contas que
 * PRECISAM ser idênticas nos dois motores moram aqui:
 *
 *  - `retanguloDasLinhas`: o retângulo da tinta, pela geometria que o
 *    `_sceneFunc` do Konva.Text usa para posicionar as linhas (e que o
 *    `renderLines` do servidor já reproduz);
 *  - `escalaDoBlur`: em que escala a mancha é borrada. 🔴 O stack blur do
 *    Konva tem tabelas de 256 entradas — raio ≥ 256 quebra a imagem (NaN) no
 *    editor e satura em 254 no port do servidor. Acima de 200 o blur roda
 *    num buffer reduzido por `k` e é ampliado de volta: a mancha é lisa por
 *    natureza, então a redução não custa nada visual, e o custo fica LIMITADO.
 */

import type { Layer } from '@/types/template'

import type { Rect } from './halo'

export type AjusteDoFundo = 'caixa' | 'texto'

/** O que fica gravado em `layer.effects.background`. */
export type FundoDeTexto = NonNullable<NonNullable<Layer['effects']>['background']>

/** O fundo com todos os defaults aplicados — o que os motores desenham. */
export interface FundoResolvido {
  fit: AjusteDoFundo
  color: string
  /** 0..1 */
  opacity: number
  paddingX: number
  paddingY: number
  borderRadius: number
  /** Raio VISUAL em px da peça (antes de qualquer scaleFactor). */
  blur: number
  offsetX: number
  offsetY: number
}

/** Padding interno do desenho de texto (Konva.Text `padding={6}` e o `pad` do render). */
export const PADDING_DE_DESENHO = 6

/** Teto do raio visual que o controle oferece. */
export const RAIO_MAXIMO_DO_FUNDO = 600

/**
 * Teto do raio POR BUFFER. A tabela do stack blur vai a 255; 200 deixa folga
 * e faz `k` subir em degraus redondos (201..400 → 2, 401..600 → 3).
 */
export const RAIO_MAXIMO_DO_STACK_BLUR = 200

export const BORDA_MAXIMA = 200
export const DESLOCAMENTO_MAXIMO = 200
export const CANTOS_MAXIMOS = 300

/** Quase-preto do By Rock — o default do `_halo.py` quando a marca não tem escuro. */
export const COR_DA_MANCHA_PADRAO = '#111111'

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function numero(valor: unknown, minimo: number, maximo: number, fallback: number): number {
  const n = typeof valor === 'number' && Number.isFinite(valor) ? valor : fallback
  return Math.min(maximo, Math.max(minimo, n))
}

/** Cor hex normalizada (6 dígitos, minúscula) ou null. */
export function hexValido(cor: unknown): string | null {
  if (typeof cor !== 'string') return null
  const c = cor.trim()
  if (!HEX.test(c)) return null
  const h = c.slice(1)
  const seis = h.length === 3 ? h.split('').map((x) => x + x).join('') : h
  return `#${seis.toLowerCase()}`
}

/**
 * Aplica os defaults. `null` quando o efeito está desligado ou ausente.
 * Fundo antigo (só `backgroundColor` + `padding`) resolve para caixa inteira,
 * nítido e opaco — exatamente o que ele sempre desenhou.
 */
export function resolverFundo(cfg: FundoDeTexto | null | undefined): FundoResolvido | null {
  if (!cfg?.enabled) return null
  const padding = numero(cfg.padding, 0, BORDA_MAXIMA, 10)
  return {
    fit: cfg.fit === 'texto' ? 'texto' : 'caixa',
    color: hexValido(cfg.backgroundColor) ?? (typeof cfg.backgroundColor === 'string' && cfg.backgroundColor.trim() ? cfg.backgroundColor.trim() : '#ffffff'),
    opacity: numero(cfg.opacity, 0, 1, 1),
    paddingX: numero(cfg.paddingX, 0, BORDA_MAXIMA, padding),
    paddingY: numero(cfg.paddingY, 0, BORDA_MAXIMA, padding),
    borderRadius: numero(cfg.borderRadius, 0, CANTOS_MAXIMOS, 0),
    blur: Math.round(numero(cfg.blur, 0, RAIO_MAXIMO_DO_FUNDO, 0)),
    offsetX: numero(cfg.offsetX, -DESLOCAMENTO_MAXIMO, DESLOCAMENTO_MAXIMO, 0),
    offsetY: numero(cfg.offsetY, -DESLOCAMENTO_MAXIMO, DESLOCAMENTO_MAXIMO, 0),
  }
}

// ---------------------------------------------------------------------------
// A tinta das linhas
// ---------------------------------------------------------------------------

export interface LinhaDesenhada {
  /** Largura medida da linha, com letterSpacing (Konva `textArr[i].width`; servidor `measureText` com `ctx.letterSpacing`). */
  largura: number
  /** Última linha do parágrafo — em `justify` ela NÃO é esticada. */
  ultimaDoParagrafo?: boolean
}

export interface GeometriaDasLinhas {
  /** As linhas DESENHADAS (já truncadas pela altura quando não há autoExpand). */
  linhas: LinhaDesenhada[]
  /** `layer.size` — a caixa da camada. */
  caixa: { width: number; height: number }
  align?: 'left' | 'center' | 'right' | 'justify' | string
  anchor?: 'top' | 'middle' | 'bottom' | string
  fontSize: number
  /** Multiplicador da entrelinha (default 1.2). */
  lineHeight?: number
  /** Padding interno do desenho (default 6). */
  padding?: number
}

/**
 * Retângulo da TINTA em coordenadas locais da camada (origem = `position`,
 * antes da rotação). É a conta do `_sceneFunc` do Konva.Text:
 *
 *   alignY = 0 | (H − n·lh − 2·pad)/2 | H − n·lh − 2·pad
 *   y0 = pad + alignY;  altura = n·lh
 *   x  = pad + (0 | (W − w − 2·pad)/2 | W − w − 2·pad)  por linha
 *
 * A altura é a das line-boxes (fontSize × lineHeight), não a dos glifos — é
 * o que os dois motores usam para POSICIONAR, então casa sem ajuste.
 * Devolve `null` quando não há linha com largura (texto vazio).
 */
export function retanguloDasLinhas(g: GeometriaDasLinhas): Rect | null {
  const pad = g.padding ?? PADDING_DE_DESENHO
  const lineHeight = g.lineHeight ?? 1.2
  const lh = Math.max(0, g.fontSize) * lineHeight
  const n = g.linhas.length
  if (n === 0 || lh <= 0) return null

  const W = Math.max(0, g.caixa.width)
  const H = Math.max(0, g.caixa.height)
  const larguraUtil = Math.max(0, W - pad * 2)
  const total = n * lh

  let alignY = 0
  if (g.anchor === 'middle') alignY = (H - total - pad * 2) / 2
  else if (g.anchor === 'bottom') alignY = H - total - pad * 2

  let x0 = Number.POSITIVE_INFINITY
  let x1 = Number.NEGATIVE_INFINITY
  let algumaTinta = false
  for (const linha of g.linhas) {
    const medida = Math.max(0, linha.largura)
    const esticada = g.align === 'justify' && !linha.ultimaDoParagrafo && medida > 0
    const w = esticada ? larguraUtil : medida
    if (w <= 0) continue
    algumaTinta = true
    let dx = 0
    if (!esticada) {
      if (g.align === 'right') dx = larguraUtil - w
      else if (g.align === 'center') dx = (larguraUtil - w) / 2
    }
    const x = pad + dx
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x + w)
  }
  if (!algumaTinta) return null

  return { x: x0, y: pad + alignY, width: x1 - x0, height: total }
}

/**
 * O retângulo da MANCHA, em coordenadas locais: a caixa inteira ou a tinta,
 * crescida pela borda e deslocada. Com `fit: 'texto'` e sem tinta (texto
 * vazio) devolve `null` — não há o que desenhar.
 */
export function retanguloDoFundo(
  fundo: FundoResolvido,
  caixa: { width: number; height: number },
  tinta: Rect | null,
): Rect | null {
  let base: Rect
  if (fundo.fit === 'texto') {
    if (!tinta) return null
    base = tinta
  } else {
    base = { x: 0, y: 0, width: Math.max(0, caixa.width), height: Math.max(0, caixa.height) }
  }
  return {
    x: base.x - fundo.paddingX + fundo.offsetX,
    y: base.y - fundo.paddingY + fundo.offsetY,
    width: base.width + fundo.paddingX * 2,
    height: base.height + fundo.paddingY * 2,
  }
}

/** Raio dos cantos que cabe no retângulo (o Konva e o canvas rejeitam raio > metade do lado). */
export function raioDosCantos(fundo: FundoResolvido, rect: Rect): number {
  return Math.max(0, Math.min(fundo.borderRadius, Math.min(rect.width, rect.height) / 2))
}

// ---------------------------------------------------------------------------
// O desfoque
// ---------------------------------------------------------------------------

export interface EscalaDoBlur {
  /** Fator de redução do buffer (1 = escala cheia). */
  k: number
  /** Raio a passar ao stack blur, em pixels do BUFFER reduzido. */
  raioNoBuffer: number
}

/**
 * Em que escala borrar um raio visual `raio`. `k = ceil(raio / 200)`; o raio
 * no buffer é `raio / k` (nunca acima de 200, então a tabela do stack blur
 * sempre alcança). `k · raioNoBuffer` recompõe o raio visual a ±k/2.
 */
export function escalaDoBlur(raio: number): EscalaDoBlur {
  const r = Math.max(0, Math.round(raio))
  if (r === 0) return { k: 1, raioNoBuffer: 0 }
  const k = Math.max(1, Math.ceil(r / RAIO_MAXIMO_DO_STACK_BLUR))
  return { k, raioNoBuffer: Math.max(1, Math.round(r / k)) }
}

/**
 * Folga em volta do retângulo que o buffer do blur precisa ter — 3× o raio,
 * a mesma do `ShapeNode` e do `renderShapeBlurred`. É o que deixa a mancha
 * DESMANCHAR para fora do retângulo em vez de ser cortada na borda do cache.
 */
export function folgaDoBlur(raio: number): number {
  return Math.ceil(Math.max(0, raio) * 3)
}

/**
 * Posição do slider (0..100) ↔ raio visual, em escala quadrática: fino
 * embaixo (0..100 ocupa metade do curso), largo em cima (até 600).
 */
export function raioDoControle(valor: number): number {
  const t = Math.min(1, Math.max(0, valor / 100))
  return Math.round(RAIO_MAXIMO_DO_FUNDO * t * t)
}

export function controleDoRaio(raio: number): number {
  const r = Math.min(RAIO_MAXIMO_DO_FUNDO, Math.max(0, raio))
  return Math.round(100 * Math.sqrt(r / RAIO_MAXIMO_DO_FUNDO))
}

// ---------------------------------------------------------------------------
// A cor
// ---------------------------------------------------------------------------

function hexParaRgb(hex: string): [number, number, number] {
  const h = hex.slice(1)
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function rgbParaHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function rgbParaHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0)
  else if (max === G) h = (B - R) / d + 2
  else h = (R - G) / d + 4
  return [h / 6, s, l]
}

function hslParaRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const canal = (t: number) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return [canal(h + 1 / 3) * 255, canal(h) * 255, canal(h - 1 / 3) * 255]
}

/** Luminância aproximada 0..255 (Rec. 601 — a mesma de `luzDaCor` do halo). */
export function luminanciaDaCor(hex: string): number {
  const v = hexValido(hex)
  if (!v) return 0
  const [r, g, b] = hexParaRgb(v)
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/**
 * Ajuste fino de TOM: desloca a luminosidade (HSL) em `tone/100`, preservando
 * a matiz e a saturação da cor da marca. `tone` 0 devolve a própria cor
 * (sem ida e volta pelo HSL, que arredonda). Faixa útil: −40…+40.
 */
export function ajustarTom(hex: string, tone: number): string {
  const base = hexValido(hex) ?? COR_DA_MANCHA_PADRAO
  const t = Math.min(100, Math.max(-100, Number.isFinite(tone) ? tone : 0))
  if (t === 0) return base
  const [r, g, b] = hexParaRgb(base)
  const [h, s, l] = rgbParaHsl(r, g, b)
  const l2 = Math.min(1, Math.max(0, l + t / 100))
  const [r2, g2, b2] = hslParaRgb(h, s, l2)
  return rgbParaHex(r2, g2, b2)
}

export interface CorDaMarca {
  name: string
  hexCode: string
}

/**
 * A cor ESCURA da marca, na ordem do `_halo.py` ("quem porta escolhe a cor
 * do véu que o cliente já usava"): 1) a cor do véu da própria página (gradiente
 * cujo id começa com `veu` ou cujo nome diz véu); 2) a cor cadastrada com nome
 * de fundo/escuro; 3) o quase-preto. Espelho client-side de
 * `corDaManchaDoProjeto` (que consulta o banco) — mantenha os dois iguais.
 */
export function corEscuraDaMarca(cores: CorDaMarca[], layers: Layer[]): string {
  for (const layer of layers) {
    if (layer.type !== 'gradient' && layer.type !== 'gradient2') continue
    const id = String(layer.id ?? '').toLowerCase()
    const nome = String(layer.name ?? '')
    if (!id.startsWith('veu') && !/v[eé]u/i.test(nome)) continue
    const stops = layer.style?.gradientStops
    if (!Array.isArray(stops)) continue
    for (const stop of stops) {
      const hex = hexValido((stop as { color?: unknown }).color)
      if (hex) return hex
    }
  }
  const escura = cores.find((c) => /dark|escur|fundo|preto|black|background/i.test(c.name))
  const hexEscura = escura ? hexValido(escura.hexCode) : null
  if (hexEscura) return hexEscura
  return COR_DA_MANCHA_PADRAO
}

/**
 * O preset "Halo": ajuste pela tinta, cor escura da marca, 70% de tinta,
 * borda 60, cantos 60, desfoque 110 — a calibragem média das levas do canvas
 * de design (By Rock 124–158, TERO 74–96, Quintal ~130).
 */
export function presetHalo(cor: string, atual?: FundoDeTexto | null): FundoDeTexto {
  const hex = hexValido(cor) ?? COR_DA_MANCHA_PADRAO
  return {
    ...(atual ?? {}),
    enabled: true,
    backgroundColor: hex,
    baseColor: hex,
    tone: 0,
    fit: 'texto',
    opacity: 0.7,
    padding: 60,
    paddingX: undefined,
    paddingY: undefined,
    borderRadius: 60,
    blur: 110,
    offsetX: 0,
    offsetY: 0,
  }
}
