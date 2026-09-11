/**
 * O GRADIENTE DE LEITURA — o contraste do texto da peça composta, no lugar do
 * halo (Ciro, 11/09/2026: "prefiro que deixe de usar o halo, e aprenda a usar
 * o gradiente de forma sutil").
 *
 * Uma camada por BORDA que tem texto. Texto no topo → nasce no topo; no
 * rodapé → nasce no rodapé; nos dois → DUAS camadas independentes (pedido
 * explícito do Ciro), cada uma editável sozinha no editor.
 *
 * Por que código e não os templates de gradiente: a usina compõe a semana
 * sem ninguém escolher camada, e o gradiente precisa nascer onde o texto
 * pousou — o que só se sabe depois de medir a foto. Os templates entram como
 * GABARITO: a curva é a que a Roberta mediu na arte aprovada da Real
 * (`CURVA_REAL`, gradients-library.ts), e uma camada de gradiente na página de
 * assinatura do cliente manda na cor e na curva (a equipe ajusta no editor,
 * como fazia com o halo).
 *
 * "Sutil" quer dizer duas coisas, e as duas vieram de reprovação: a faixa vai
 * da borda só até um pouco além do texto mais distante (o véu que escurecia a
 * faixa inteira foi reprovado duas vezes, 01/09/2026), e a força é só a que a
 * foto pede sob o texto, dentro de uma faixa.
 *
 * Módulo PURO.
 */

import type { Layer } from '@/types/template'
import { luzDaCor, type Rect } from '@/lib/creatives/halo/halo'
import type { Ancora } from './spec'

export const TRATAMENTO_GRADIENTE_DE_LEITURA = 'gradiente-de-leitura'
/** O preset do PR #115 (só topo) conta como gradiente de leitura: a régua o mede e a peça não ganha dois. */
const TRATAMENTOS_DE_GRADIENTE = [TRATAMENTO_GRADIENTE_DE_LEITURA, 'gradiente-suave-topo']

export type Borda = 'topo' | 'rodape'
/** Pares [posição na faixa 0..1 a partir da borda, opacidade relativa 0..1]. */
export type CurvaDoGradiente = Array<[number, number]>

/**
 * A curva da arte aprovada da Real, normalizada para a FAIXA: 0 é a borda,
 * 1 é onde o gradiente some. Sólida no pé, passa de metade da força perto do
 * meio da faixa e desaparece sem degrau.
 */
export const CURVA_DE_LEITURA: CurvaDoGradiente = [
  [0, 1],
  [0.1, 1],
  [0.21, 0.95],
  [0.32, 0.82],
  [0.44, 0.63],
  [0.55, 0.44],
  [0.66, 0.26],
  [0.77, 0.12],
  [0.89, 0.04],
  [1, 0],
]

export interface ConfigDoGradiente {
  /** A cor de TODAS as paradas — só a opacidade muda (cor diferente numa ponta acinzenta o meio). */
  cor: string
  curva: CurvaDoGradiente
  /** Força = opacidade na borda. A foto escolhe dentro da faixa. */
  forcaMinima: number
  forcaMaxima: number
  /** Altura da faixa = alcance do texto × fator, presa entre mínimo e máximo (frações da altura da peça). */
  fatorDeAlcance: number
  alturaMinima: number
  alturaMaxima: number
}

export type AjustesDoGradiente = Partial<ConfigDoGradiente>

export const GRADIENTE_PADRAO: Omit<ConfigDoGradiente, 'cor'> = {
  curva: CURVA_DE_LEITURA,
  forcaMinima: 0.45,
  forcaMaxima: 0.9,
  fatorDeAlcance: 1.9,
  alturaMinima: 0.3,
  alturaMaxima: 0.62,
}

const arred = (v: number, casas = 3) => Number(v.toFixed(casas))

/** Opacidade relativa da curva num ponto da faixa, por interpolação linear. */
export function opacidadeNaCurva(curva: CurvaDoGradiente, t: number): number {
  const x = Math.max(0, Math.min(1, t))
  const pontos = [...curva].sort((a, b) => a[0] - b[0])
  if (pontos.length === 0) return 0
  if (x <= pontos[0][0]) return pontos[0][1]
  for (let i = 1; i < pontos.length; i++) {
    const [p0, o0] = pontos[i - 1]
    const [p1, o1] = pontos[i]
    if (x <= p1) return p1 === p0 ? o1 : o0 + ((x - p0) / (p1 - p0)) * (o1 - o0)
  }
  return pontos[pontos.length - 1][1]
}

/** De que borda o gradiente de um grupo nasce: a âncora manda; sem ela, o lado do centro do texto. */
export function bordaDoGrupo(rect: Rect, ancora: Ancora | null | undefined, H: number): Borda {
  if (ancora === 'topo') return 'topo'
  if (ancora === 'rodape') return 'rodape'
  return rect.y + rect.height / 2 < H / 2 ? 'topo' : 'rodape'
}

/** Quanto o texto avança a partir da borda (px) — até a ponta mais distante dele. */
export function alcanceDoGrupo(rect: Rect, borda: Borda, H: number): number {
  return borda === 'topo' ? rect.y + rect.height : H - rect.y
}

export function alturaDaFaixa(alcance: number, H: number, cfg: Pick<ConfigDoGradiente, 'fatorDeAlcance' | 'alturaMinima' | 'alturaMaxima'>): number {
  const presa = Math.min(cfg.alturaMaxima * H, Math.max(cfg.alturaMinima * H, alcance * cfg.fatorDeAlcance))
  // A faixa nunca termina antes do texto: bloco que desce além do teto ganha folga própria.
  return Math.round(Math.min(H, Math.max(presa, alcance * 1.15)))
}

/** A força pela necessidade medida sob o texto (0..1), dentro da faixa da marca. */
export function forcaPelaNecessidade(necessidade: number, cfg: Pick<ConfigDoGradiente, 'forcaMinima' | 'forcaMaxima'>): number {
  const n = Math.max(0, Math.min(1, Number.isFinite(necessidade) ? necessidade : 0))
  return arred(cfg.forcaMinima + n * (cfg.forcaMaxima - cfg.forcaMinima))
}

export function camadaDeGradiente(args: {
  borda: Borda
  W: number
  H: number
  altura: number
  cor: string
  curva: CurvaDoGradiente
  forca: number
}): Layer {
  const curva = [...args.curva].sort((a, b) => a[0] - b[0])
  const noTopo = args.borda === 'topo'
  return {
    id: `gradiente-leitura-${args.borda}`,
    name: noTopo ? 'Gradiente de leitura (topo)' : 'Gradiente de leitura (rodapé)',
    type: 'gradient',
    visible: true,
    locked: false,
    order: 0,
    position: { x: 0, y: noTopo ? 0 : args.H - args.altura },
    size: { width: args.W, height: args.altura },
    rotation: 0,
    // Segmento explícito relativo à caixa, como o preset suave: a posição 0 de
    // cada parada é SEMPRE a borda, então topo e rodapé usam a mesma curva.
    style: {
      gradientType: 'linear',
      gradientStartX: 0,
      gradientStartY: noTopo ? 0 : 1,
      gradientEndX: 0,
      gradientEndY: noTopo ? 1 : 0,
      gradientStops: curva.map(([position, opacidade], i) => ({
        id: `leitura-${i}`,
        position,
        color: args.cor,
        opacity: arred(Math.max(0, Math.min(1, opacidade * args.forca))),
      })),
    },
    metadata: { tratamentoDeTexto: TRATAMENTO_GRADIENTE_DE_LEITURA, borda: args.borda, forca: arred(args.forca), curva },
  } as Layer
}

export interface GrupoParaGradiente {
  rect: Rect
  ancora?: Ancora | null
  /** 0..1 — quanto a foto pede de escurecimento sob este texto. */
  necessidade: number
}

export interface GradienteMontado {
  borda: Borda
  forca: number
  altura: number
  alcance: number
  layer: Layer
}

/**
 * Um gradiente por borda que tem texto. Grupos da mesma borda dividem a
 * camada: o alcance é o do texto mais distante e a força, a do mais exigente.
 */
export function montarGradientes(args: { W: number; H: number; grupos: GrupoParaGradiente[]; cfg: ConfigDoGradiente }): GradienteMontado[] {
  const porBorda = new Map<Borda, { alcance: number; necessidade: number }>()
  for (const g of args.grupos) {
    const borda = bordaDoGrupo(g.rect, g.ancora, args.H)
    const atual = porBorda.get(borda) ?? { alcance: 0, necessidade: 0 }
    porBorda.set(borda, {
      alcance: Math.max(atual.alcance, alcanceDoGrupo(g.rect, borda, args.H)),
      necessidade: Math.max(atual.necessidade, g.necessidade),
    })
  }
  return (['topo', 'rodape'] as const)
    .filter((b) => porBorda.has(b))
    .map((borda) => {
      const { alcance, necessidade } = porBorda.get(borda)!
      const altura = alturaDaFaixa(alcance, args.H, args.cfg)
      const forca = forcaPelaNecessidade(necessidade, args.cfg)
      return {
        borda,
        forca,
        altura,
        alcance: Math.round(alcance),
        layer: camadaDeGradiente({ borda, W: args.W, H: args.H, altura, cor: args.cfg.cor, curva: args.cfg.curva, forca }),
      }
    })
}

export function ehGradienteDeLeitura(l: Pick<Layer, 'metadata'>): boolean {
  return TRATAMENTOS_DE_GRADIENTE.includes(String(l.metadata?.tratamentoDeTexto ?? ''))
}

interface ParadaLida {
  position?: number
  opacity?: number
  color?: string
}

function paradasDe(l: Layer): ParadaLida[] {
  const stops = (l.style as { gradientStops?: unknown } | undefined)?.gradientStops
  return Array.isArray(stops) ? (stops as ParadaLida[]) : []
}

/** A força de uma camada de gradiente (a opacidade na borda). */
export function forcaDaCamada(l: Layer): number {
  const m = l.metadata?.forca
  if (typeof m === 'number' && Number.isFinite(m)) return m
  const ops = paradasDe(l).map((s) => (typeof s.opacity === 'number' ? s.opacity : 1))
  return ops.length > 0 ? Math.max(...ops) : 0
}

/** A camada com outra força, mantendo a curva. */
export function comForca(l: Layer, forca: number): Layer {
  const curva = Array.isArray(l.metadata?.curva) ? (l.metadata!.curva as CurvaDoGradiente) : null
  const atual = forcaDaCamada(l)
  const paradas = paradasDe(l)
  const stops = paradas.map((s, i) => {
    const base = curva && curva[i] ? curva[i][1] : atual > 0 ? (typeof s.opacity === 'number' ? s.opacity : 1) / atual : 1
    return { ...s, opacity: arred(Math.max(0, Math.min(1, base * forca))) }
  })
  return {
    ...l,
    style: { ...(l.style ?? {}), gradientStops: stops } as Layer['style'],
    metadata: { ...(l.metadata ?? {}), forca: arred(forca) },
  }
}

/**
 * A cor e a curva de uma camada de gradiente que a equipe desenhou na página
 * de assinatura. O lado forte é a borda; a curva termina onde a opacidade
 * chega a zero (os gradientes da Real somem perto do meio da camada inteira).
 */
export function configDaCamada(camada: Layer): AjustesDoGradiente | null {
  if ((camada.type !== 'gradient' && camada.type !== 'gradient2') || camada.visible === false) return null
  const paradas = paradasDe(camada)
    .filter((s) => typeof s.position === 'number')
    .map((s) => ({ p: Math.max(0, Math.min(1, s.position as number)), o: typeof s.opacity === 'number' ? s.opacity : 1, cor: s.color }))
    .sort((a, b) => a.p - b.p)
  if (paradas.length < 2) return null
  const forteNoFim = paradas[paradas.length - 1].o > paradas[0].o
  const doLadoForte = (forteNoFim ? [...paradas].reverse().map((s) => ({ ...s, p: 1 - s.p })) : paradas).sort((a, b) => a.p - b.p)
  const maxima = Math.max(...doLadoForte.map((s) => s.o))
  if (maxima <= 0) return null
  const zero = doLadoForte.find((s, i) => i > 0 && s.o <= 0.005)
  const fim = zero && zero.p > 0 ? zero.p : 1
  const curva: CurvaDoGradiente = doLadoForte
    .filter((s) => s.p <= fim + 1e-9)
    .map((s) => [arred(Math.min(1, s.p / fim), 4), arred(s.o / maxima)] as [number, number])
  if (curva[curva.length - 1][0] < 1) curva.push([1, 0])
  if (curva[0][0] > 0) curva.unshift([0, curva[0][1]])
  const cor = doLadoForte.find((s) => typeof s.cor === 'string' && s.o > 0)?.cor
  return { ...(cor ? { cor } : {}), curva, forcaMaxima: arred(Math.min(1, maxima)) }
}

/** Entre cores candidatas (os gradientes da marca), a que mais contrasta com o texto. */
export function corQueContrasta(candidatas: string[], coresDoTexto: string[]): string | null {
  const textos = coresDoTexto.length > 0 ? coresDoTexto : ['#FFFFFF']
  let melhor: { cor: string; distancia: number } | null = null
  for (const cor of candidatas) {
    const luz = luzDaCor(cor)
    const distancia = Math.min(...textos.map((t) => Math.abs(luz - luzDaCor(t))))
    if (!melhor || distancia > melhor.distancia) melhor = { cor, distancia }
  }
  return melhor?.cor ?? null
}

/**
 * Põe os gradientes logo ACIMA da foto de fundo (abaixo de texto e logo) e
 * renumera a ordem. Gradiente de leitura que já estava na lista é trocado.
 */
export function inserirAcimaDaFoto(layers: Layer[], novas: Layer[]): Layer[] {
  const ids = new Set(novas.map((l) => l.id))
  const ordenadas = layers
    .filter((l) => !ids.has(l.id))
    .map((l, i) => ({ l, i }))
    .sort((a, b) => (a.l.order ?? a.i) - (b.l.order ?? b.i) || a.i - b.i)
    .map(({ l }) => l)
  const foto = ordenadas.findIndex((l) => l.id === 'bg-foto')
  ordenadas.splice(foto + 1, 0, ...novas)
  return ordenadas.map((l, order) => ({ ...l, order }))
}
