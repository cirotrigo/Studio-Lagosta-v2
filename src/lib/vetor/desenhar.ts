/**
 * Desenho ÚNICO da camada `shape` + `svg-path` (CP-V0): o editor e o servidor
 * traçam pela mesma função e pintam com a mesma semântica.
 *
 * - `fillRule` (`style.pathFillRule`) respeitado nos dois lados;
 * - contorno em px da camada nos dois eixos (o path é traçado escalado e o
 *   transform é restaurado antes de pintar);
 * - junção redonda; pontas por `style.tracoPontas` (padrão `butt`, o do canvas);
 * - espelho por `style.flipH`/`style.flipV` (CP-V1), só com `true` literal: dentro da
 *   caixa, nos dois renderers.
 *
 * As cores (já com a opacidade do canal) continuam vindo de cada renderer.
 *
 * Multicor (CP-V5): quando `style.vetor` tem partes pintáveis (`partesParaPintar`), a pintura as leva e os dois lados
 * pintam cada parte, em ordem, pela MESMA função (`pintarPartes`), com a cor congelada do slot e "meet" no viewBox. A
 * opacidade da camada vem do contexto (o nó Konva e o `renderLayer` do servidor põem o `globalAlpha`) e vale para o
 * GRUPO: com alfa < 1 ou sombra ligada, as partes vão a alfa 1 num canvas auxiliar e são compostas UMA vez — a mesma
 * mistura do caminho com blur (cache do Konva / offscreen do servidor), então ligar o blur não troca o interior.
 * Partes ruins → a silhueta (`pathData` + `fill`), como o leitor antigo.
 */
import type Konva from 'konva'
import type { LayerStyle } from '@/types/template'
import { segmentosDoPath, tracarSvgPathNaCaixa, type CtxDeTraco, type Espelho, type ViewBox } from './tracar'
import { partesParaPintar, type ParteParaPintar } from './partes'
import { Util } from 'konva/lib/Util'

export interface PinturaDoSvgPath {
  fill: string
  stroke?: string
  strokeWidth: number
  fillRule: 'nonzero' | 'evenodd'
  lineJoin: 'round'
  lineCap: 'butt' | 'round'
  espelho: Espelho
  /** Multicor: as partes a pintar no lugar do `d` (a silhueta). */
  partes?: ParteParaPintar[]
}

export function pinturaDoSvgPath(
  style: Pick<LayerStyle, 'pathFillRule' | 'tracoPontas' | 'flipH' | 'flipV' | 'vetor'>,
  cores: { fill: string; stroke?: string; strokeWidth: number },
): PinturaDoSvgPath {
  return {
    fill: cores.fill,
    stroke: cores.stroke,
    strokeWidth: cores.strokeWidth,
    fillRule: style.pathFillRule === 'evenodd' ? 'evenodd' : 'nonzero',
    lineJoin: 'round',
    lineCap: style.tracoPontas === 'round' ? 'round' : 'butt',
    espelho: { h: style.flipH === true, v: style.flipV === true },
    ...partesDa(style.vetor),
  }
}

function partesDa(vetor: unknown): { partes?: ParteParaPintar[] } {
  const partes = partesParaPintar(vetor)
  return partes ? { partes } : {}
}

export interface CtxDePintura extends CtxDeTraco {
  fillStyle: unknown
  strokeStyle: unknown
  lineWidth: number
  lineJoin: string
  lineCap: string
  fill(regra?: 'nonzero' | 'evenodd'): void
  stroke(): void
}

/** O que a composição em grupo usa do contexto (nativo do navegador ou do napi). */
interface CtxDeGrupo extends CtxDePintura {
  globalAlpha: number
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  canvas: { width: number; height: number }
  getTransform(): { a: number; b: number; c: number; d: number; e: number; f: number }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  drawImage(imagem: unknown, x: number, y: number): void
  fillRect(x: number, y: number, w: number, h: number): void
  globalCompositeOperation: string
  filter?: string
}
/**
 * Canvas auxiliar do grupo: `document`/Konva no editor, o offscreen do RenderEngine no servidor. `qual` separa os dois
 * que existem ao mesmo tempo (0 = as partes, 1 = a máscara da sombra) para quem reaproveita.
 */
export type CriarCanvas = (largura: number, altura: number, qual?: 0 | 1) => { getContext(tipo: '2d'): unknown } | null | undefined

/** Servidor: traça e pinta direto no contexto (preenche, depois contorna — a ordem do Konva). */
export function desenharSvgPath(
  ctx: CtxDePintura,
  d: string,
  viewBox: ViewBox | undefined,
  largura: number,
  altura: number,
  pintura: PinturaDoSvgPath,
  criarCanvas?: CriarCanvas,
): void {
  if (pintura.partes) {
    pintarPartes(ctx, pintura.partes, viewBox, largura, altura, pintura, criarCanvas)
    return
  }
  tracarSvgPathNaCaixa(ctx, d, viewBox, largura, altura, pintura.espelho)
  ctx.fillStyle = pintura.fill
  ctx.fill(pintura.fillRule)
  if (pintura.stroke && pintura.strokeWidth > 0) {
    ctx.strokeStyle = pintura.stroke
    ctx.lineWidth = pintura.strokeWidth
    ctx.lineJoin = pintura.lineJoin
    ctx.lineCap = pintura.lineCap
    ctx.stroke()
  }
}

/**
 * As partes do multicor, em ordem (a de cima pinta por último): cada uma traçada com "meet" e pintada com a cor do slot —
 * preenchimento com o `fillRule` da parte, contorno com a espessura da camada (px da camada nos dois eixos). Editor
 * (`sceneFunc`) e servidor passam por aqui.
 */
export function pintarPartes(
  ctx: CtxDePintura,
  partes: readonly ParteParaPintar[],
  viewBox: ViewBox | undefined,
  largura: number,
  altura: number,
  pintura: Pick<PinturaDoSvgPath, 'espelho' | 'strokeWidth' | 'lineJoin' | 'lineCap'>,
  criarCanvas?: CriarCanvas,
): void {
  const g = ctx as CtxDeGrupo
  if (criarCanvas && (g.globalAlpha < 1 || temSombra(g)) && pintarEmGrupo(g, partes, viewBox, largura, altura, pintura, criarCanvas)) return
  pintarDireto(ctx, partes, viewBox, largura, altura, pintura)
}

function temSombra(g: CtxDeGrupo): boolean {
  return typeof g.shadowColor === 'string' && !/^(transparent|rgba\([^)]*,\s*0\)|#0{8})$/i.test(g.shadowColor.trim()) && (g.shadowBlur > 0 || g.shadowOffsetX !== 0 || g.shadowOffsetY !== 0)
}

function pintarDireto(
  ctx: CtxDePintura,
  partes: readonly ParteParaPintar[],
  viewBox: ViewBox | undefined,
  largura: number,
  altura: number,
  pintura: Pick<PinturaDoSvgPath, 'espelho' | 'strokeWidth' | 'lineJoin' | 'lineCap'>,
): void {
  for (const parte of partes) {
    if (parte.alvo === 'stroke' && !(pintura.strokeWidth > 0)) continue
    tracarSvgPathNaCaixa(ctx, parte.d, viewBox, largura, altura, pintura.espelho, 'meet')
    if (parte.alvo === 'fill') {
      ctx.fillStyle = parte.cor
      ctx.fill(parte.fillRule)
    } else {
      ctx.strokeStyle = parte.cor
      ctx.lineWidth = pintura.strokeWidth
      ctx.lineJoin = pintura.lineJoin
      ctx.lineCap = pintura.lineCap
      ctx.stroke()
    }
  }
}

/**
 * Limites CONSERVADORES das partes em px da camada, depois do "meet" e do espelho — o mesmo transform do
 * `tracarSvgPathNaCaixa`. Todo ponto dos segmentos conta (inclusive controles de Bézier: a curva fica no fecho deles) e
 * o arco entra pelo quadrado do maior raio em volta do centro. O contorno soma metade da espessura (junção redonda).
 * O path pode passar do viewBox (o contrato aceita): é isso que a caixa auxiliar tem de cobrir. `null` = nada a pintar.
 */
function limitesDasPartes(
  partes: readonly ParteParaPintar[],
  viewBox: ViewBox | undefined,
  largura: number,
  altura: number,
  pintura: Pick<PinturaDoSvgPath, 'espelho' | 'strokeWidth'>,
): [number, number, number, number] | null {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  let traco = 0
  const ver = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
  }
  for (const parte of partes) {
    if (parte.alvo === 'stroke') traco = Math.max(traco, pintura.strokeWidth / 2)
    for (const { command, points: p } of segmentosDoPath(parte.d)) {
      if (command === 'A') {
        const r = Math.max(p[2], p[3])
        ver(p[0] - r, p[1] - r)
        ver(p[0] + r, p[1] + r)
      } else for (let i = 0; i + 1 < p.length; i += 2) ver(p[i], p[i + 1])
    }
  }
  if (x0 > x1) return null
  const [vx, vy, vw, vh] = viewBox ?? [0, 0, 100, 100]
  const s = Math.min(largura / (vw || 1), altura / (vh || 1))
  const tx = (largura - (vw || 1) * s) / 2, ty = (altura - (vh || 1) * s) / 2
  let [a, b] = [tx + (x0 - vx) * s, tx + (x1 - vx) * s]
  let [c, d] = [ty + (y0 - vy) * s, ty + (y1 - vy) * s]
  if (pintura.espelho.h) [a, b] = [largura - b, largura - a]
  if (pintura.espelho.v) [c, d] = [altura - d, altura - c]
  return [a - traco, c - traco, b + traco, d + traco]
}

/**
 * O grupo: as partes a alfa 1 num canvas auxiliar que cobre os LIMITES REAIS das partes (em pixels do DISPOSITIVO,
 * recortados ao que chega ao destino — direto ou pela sombra) e um único `drawImage` 1:1 com o `globalAlpha` e a sombra
 * do contexto. Opacidade e sombra nunca mudam a geometria pintada nem a sombra projetada. `false` = sem canvas auxiliar (o chamador pinta direto).
 */
function pintarEmGrupo(
  ctx: CtxDeGrupo,
  partes: readonly ParteParaPintar[],
  viewBox: ViewBox | undefined,
  largura: number,
  altura: number,
  pintura: Pick<PinturaDoSvgPath, 'espelho' | 'strokeWidth' | 'lineJoin' | 'lineCap'>,
  criarCanvas: CriarCanvas,
): boolean {
  if (!ctx.canvas || typeof ctx.getTransform !== 'function') return false
  const lim = limitesDasPartes(partes, viewBox, largura, altura, pintura)
  if (!lim) return true
  const m = ctx.getTransform()
  const [la, lb, lc, ld] = lim
  const cantos = [[la, lb], [lc, lb], [la, ld], [lc, ld]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f])
  // A fonte que importa: o canvas de destino e, com sombra, também o que a SOMBRA leva para dentro dele — o canvas
  // deslocado pelo inverso do offset, com o alcance do blur (desvio shadowBlur/√2, ver abaixo; 3× cobre > 4 desvios).
  // Offset e blur da sombra são px do dispositivo (o transform não os afeta). Geometria que não chega ao destino nem
  // pela sombra fica fora: o auxiliar nunca passa de canvas + offset + alcance.
  const W = ctx.canvas.width, H = ctx.canvas.height
  const comSombra = temSombra(ctx)
  const ox = comSombra ? ctx.shadowOffsetX || 0 : 0, oy = comSombra ? ctx.shadowOffsetY || 0 : 0
  const blur = comSombra ? ctx.shadowBlur || 0 : 0
  const alcance = Math.ceil(3 * blur)
  const fonte = [Math.min(0, -ox) - alcance, Math.min(0, -oy) - alcance, Math.max(W, W - ox) + alcance, Math.max(H, H - oy) + alcance]
  // 2 px do dispositivo de antisserrilhado em volta dos limites das partes, recortados à fonte acima
  const x0 = Math.max(fonte[0], Math.floor(Math.min(...cantos.map((c) => c[0]))) - 2)
  const y0 = Math.max(fonte[1], Math.floor(Math.min(...cantos.map((c) => c[1]))) - 2)
  const x1 = Math.min(fonte[2], Math.ceil(Math.max(...cantos.map((c) => c[0]))) + 2)
  const y1 = Math.min(fonte[3], Math.ceil(Math.max(...cantos.map((c) => c[1]))) + 2)
  if (x1 <= x0 || y1 <= y0) return true // nem a geometria nem a sombra dela chegam ao destino
  const aux = criarCanvas(x1 - x0, y1 - y0, 0)
  const actx = aux?.getContext('2d') as CtxDeGrupo | null | undefined
  if (!aux || !actx) return false
  actx.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0)
  pintarDireto(actx, partes, viewBox, largura, altura, pintura)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  // A sombra do GRUPO desenhada explicitamente: o `drawImage` do @napi-rs/canvas ignora a sombra (e o padrão a tinge com
  // a cor da imagem), então o servidor a perdia. Máscara do auxiliar na cor da sombra (com o alfa dela), desfocada por
  // `filter: blur(shadowBlur/√2)` — medido contra a sombra nativa do Skia: ≤ 3 de diferença com blur 8 e 20 —,
  // deslocada pelo offset e composta com o MESMO `globalAlpha`. Sem `ctx.filter` (Safari antigo) e com blur, fica a
  // sombra nativa do `drawImage`, que o navegador aplica.
  if (comSombra && (blur === 0 || typeof ctx.filter === 'string')) {
    const aw = x1 - x0, ah = y1 - y0
    const mascara = criarCanvas(aw + 2 * alcance, ah + 2 * alcance, 1)
    const mctx = mascara?.getContext('2d') as CtxDeGrupo | null | undefined
    if (mascara && mctx) {
      mctx.globalCompositeOperation = 'source-over'
      mctx.drawImage(aux, alcance, alcance)
      mctx.globalCompositeOperation = 'source-in'
      mctx.fillStyle = ctx.shadowColor
      mctx.fillRect(0, 0, aw + 2 * alcance, ah + 2 * alcance)
      mctx.globalCompositeOperation = 'source-over'
      ctx.shadowColor = 'rgba(0, 0, 0, 0)'
      if (blur > 0) ctx.filter = `blur(${blur / Math.SQRT2}px)`
      ctx.drawImage(mascara, x0 - alcance + ox, y0 - alcance + oy)
      if (blur > 0) ctx.filter = 'none'
    }
  }
  ctx.drawImage(aux, x0, y0)
  ctx.restore()
  return true
}

/**
 * Editor: atributos e `sceneFunc` do `Konva.Shape`. A pintura fica com o Konva
 * (`fillStrokeShape`), que também desenha o canvas de hit com a mesma regra de
 * preenchimento — pintar direto no ctx sujaria o colorKey e quebraria a seleção.
 */
export function shapeKonvaDoSvgPath(d: string, viewBox: ViewBox | undefined, pintura: PinturaDoSvgPath) {
  const partes = pintura.partes
  if (partes) {
    // Multicor: a cena pinta as partes por `pintarPartes` (a sombra e a opacidade do nó o Konva já pôs no contexto),
    // e o HIT é o retângulo da caixa com o colorKey do nó — sem `hitFunc` o Konva usaria o sceneFunc e as cores das
    // partes sujariam o canvas de hit. `fill` (a silhueta) só existe para o `hasFill` do hit; sem `stroke` e com
    // `perfectDrawEnabled: false` o nó nunca usa o buffer canvas do Konva: a opacidade de GRUPO é a de `pintarPartes`
    // (canvas auxiliar), a mesma do servidor.
    return {
      fill: pintura.fill || '#000000',
      stroke: undefined,
      strokeWidth: 0,
      perfectDrawEnabled: false,
      sceneFunc: (ctx: Konva.Context, shape: Konva.Shape) => {
        // o contexto NATIVO: a composição em grupo lê o transform e o globalAlpha que o Konva já pôs nele
        const nativo = (ctx as unknown as { _context?: CtxDePintura })._context ?? (ctx as unknown as CtxDePintura)
        pintarPartes(nativo, partes, viewBox, shape.width(), shape.height(), pintura, criarCanvasDoKonva)
      },
      hitFunc: (ctx: Konva.Context, shape: Konva.Shape) => {
        ctx.beginPath()
        ctx.rect(0, 0, shape.width(), shape.height())
        ctx.closePath()
        ctx.fillStrokeShape(shape)
      },
    }
  }
  return {
    fill: pintura.fill,
    stroke: pintura.stroke,
    strokeWidth: pintura.strokeWidth,
    fillRule: pintura.fillRule,
    lineJoin: pintura.lineJoin,
    lineCap: pintura.lineCap,
    sceneFunc: (ctx: Konva.Context, shape: Konva.Shape) => {
      tracarSvgPathNaCaixa(ctx as unknown as CtxDeTraco, d, viewBox, shape.width(), shape.height(), pintura.espelho)
      ctx.fillStrokeShape(shape)
    },
  }
}

/**
 * No editor (e no Konva do Node dos testes) os canvas auxiliares vêm do próprio Konva, DOIS reaproveitados (partes e
 * máscara da sombra): o grupo é pintado e composto de forma síncrona, um vetor por vez (alocar por vetor a cada quadro
 * custava ~16× no celular).
 */
const auxiliaresDoKonva: Array<HTMLCanvasElement | undefined> = []
const criarCanvasDoKonva: CriarCanvas = (largura, altura, qual = 0) => {
  const c = (auxiliaresDoKonva[qual] ??= Util.createCanvasElement())
  if (c.width !== largura || c.height !== altura) {
    c.width = largura // redimensionar já limpa
    c.height = altura
  } else {
    const ctx = c.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, largura, altura)
  }
  return c
}
