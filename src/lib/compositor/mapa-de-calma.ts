/**
 * O MAPA DE CALMA da foto — onde o texto pode pousar (§9 do plano).
 *
 * Grade de células sobre a foto COMO ELA APARECE na peça (cover, no corte
 * escolhido), cada célula com a luz que apaga a letra (p98), a luz média (a
 * que a mancha precisa vencer) e a energia de borda (textura, contorno,
 * ruído). Um candidato de bloco é pontuado pelas células que cobre:
 *
 *   calma        — energia baixa: parede, céu, tampo liso, desfoque de fundo;
 *   luz          — quanta tinta de halo aquele texto pediria ali (menos é melhor);
 *   assunto      — cobrir a caixa do assunto DESCARTA o candidato, não penaliza
 *                  (regra 4 da geração por IA, aqui mecânica);
 *   preferência  — a âncora/alinhamento pedidos pela spec ou pelo rodízio.
 *
 * Determinístico e de graça: ~100ms no sharp, zero API, o mesmo resultado
 * para a mesma foto e o mesmo corte. Módulo puro sobre `FotoCinza` — quem
 * decodifica a foto é `halo-medicao.ts`.
 */

import type { FotoCinza } from '@/lib/creatives/halo/halo-medicao'
import { alvoPorContraste, luzDaCor, tintaParaAlvo, type Rect } from '@/lib/creatives/halo/halo'

export interface CelulaDoMapa {
  col: number
  lin: number
  rect: Rect
  media: number
  p98: number
  energia: number
}

export interface MapaDeCalma {
  cols: number
  linhas: number
  celulas: CelulaDoMapa[]
  energiaMaxima: number
  canvas: { width: number; height: number }
}

function percentilDoHistograma(hist: number[], q: number): number {
  const total = hist.reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  let acumulado = 0
  const alvo = q * total
  for (let v = 0; v < 256; v++) {
    acumulado += hist[v]
    if (acumulado >= alvo) return v
  }
  return 255
}

function medirCelula(foto: FotoCinza, x0: number, y0: number, x1: number, y1: number) {
  const hist = new Array<number>(256).fill(0)
  const w = foto.width
  const px = (x: number, y: number) => foto.data[(y * w + x) * foto.stride]
  let n = 0
  let soma = 0
  let lapSoma = 0
  let lapSoma2 = 0
  let lapN = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const v = px(x, y)
      hist[v]++
      soma += v
      n++
      if (x > 0 && y > 0 && x < w - 1 && y < foto.height - 1) {
        const lap = 4 * v - px(x - 1, y) - px(x + 1, y) - px(x, y - 1) - px(x, y + 1)
        lapSoma += lap
        lapSoma2 += lap * lap
        lapN++
      }
    }
  }
  const media = n > 0 ? soma / n : 128
  const energia = lapN > 0 ? Math.sqrt(Math.max(0, lapSoma2 / lapN - (lapSoma / lapN) ** 2)) : 0
  return { media, p98: percentilDoHistograma(hist, 0.98), energia }
}

/** A grade. 6×10 no story cobre células de 180×192px — o tamanho de uma linha de apoio. */
export function mapaDeCalma(foto: FotoCinza, cols = 6, linhas = 10): MapaDeCalma {
  const celulas: CelulaDoMapa[] = []
  let energiaMaxima = 0
  for (let lin = 0; lin < linhas; lin++) {
    for (let col = 0; col < cols; col++) {
      const x0 = Math.floor((col * foto.width) / cols)
      const x1 = Math.floor(((col + 1) * foto.width) / cols)
      const y0 = Math.floor((lin * foto.height) / linhas)
      const y1 = Math.floor(((lin + 1) * foto.height) / linhas)
      const m = medirCelula(foto, x0, y0, x1, y1)
      energiaMaxima = Math.max(energiaMaxima, m.energia)
      celulas.push({
        col,
        lin,
        rect: {
          x: x0 / foto.escala,
          y: y0 / foto.escala,
          width: (x1 - x0) / foto.escala,
          height: (y1 - y0) / foto.escala,
        },
        ...m,
      })
    }
  }
  return { cols, linhas, celulas, energiaMaxima, canvas: foto.canvas }
}

function intersecao(a: Rect, b: Rect): number {
  const x0 = Math.max(a.x, b.x)
  const y0 = Math.max(a.y, b.y)
  const x1 = Math.min(a.x + a.width, b.x + b.width)
  const y1 = Math.min(a.y + a.height, b.y + b.height)
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
}

/** Estatística do mapa sob um retângulo, ponderada pela área coberta de cada célula. */
export function lerMapaSob(mapa: MapaDeCalma, rect: Rect): { energia: number; media: number; p98: number; cobertura: number } {
  let peso = 0
  let energia = 0
  let media = 0
  let p98 = 0
  for (const c of mapa.celulas) {
    const a = intersecao(c.rect, rect)
    if (a <= 0) continue
    peso += a
    energia += c.energia * a
    media += c.media * a
    p98 = Math.max(p98, c.p98)
  }
  if (peso === 0) return { energia: mapa.energiaMaxima, media: 255, p98: 255, cobertura: 0 }
  return { energia: energia / peso, media: media / peso, p98, cobertura: peso / (rect.width * rect.height) }
}

/**
 * Onde está o ASSUNTO, estimado pela energia quando o catálogo não diz: a
 * caixa das células acima do 75º percentil de energia. `null` quando a foto é
 * uniformemente agitada (a caixa cobriria mais de 60% do quadro) — aí não há
 * assunto localizado para proteger, e o mapa de calma manda sozinho.
 */
export function estimarAssunto(mapa: MapaDeCalma): Rect | null {
  const energias = mapa.celulas.map((c) => c.energia).sort((a, b) => a - b)
  if (energias.length === 0) return null
  const corte = energias[Math.floor(energias.length * 0.75)]
  const fortes = mapa.celulas.filter((c) => c.energia >= corte && c.energia > 0)
  if (fortes.length === 0) return null
  const x0 = Math.min(...fortes.map((c) => c.rect.x))
  const y0 = Math.min(...fortes.map((c) => c.rect.y))
  const x1 = Math.max(...fortes.map((c) => c.rect.x + c.rect.width))
  const y1 = Math.max(...fortes.map((c) => c.rect.y + c.rect.height))
  const caixa = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
  const fracao = (caixa.width * caixa.height) / (mapa.canvas.width * mapa.canvas.height)
  return fracao > 0.6 ? null : caixa
}

export interface CandidatoDePosicao<T = unknown> {
  rect: Rect
  /** 0..1 — bônus de preferência (spec ou rodízio). */
  preferencia: number
  rotulo: T
}

export interface PontuacaoDePosicao<T = unknown> extends CandidatoDePosicao<T> {
  pontuacao: number
  calma: number
  tintaNecessaria: number
  cobreAssunto: number
  descartado: boolean
  motivo: string
}

const PESO_CALMA = 0.55
const PESO_LUZ = 0.3
const PESO_PREFERENCIA = 0.15
/** Acima disto o candidato cobre o assunto e é descartado. */
export const TETO_DE_COBERTURA_DO_ASSUNTO = 0.25

/**
 * Pontua cada candidato. `coresDoTexto` decide quanta tinta o bloco pediria
 * ali (a cor mais exigente manda, como no `calibrarHalo`).
 */
export function pontuarCandidatos<T>(args: {
  mapa: MapaDeCalma
  candidatos: CandidatoDePosicao<T>[]
  coresDoTexto: string[]
  corDaMancha: string
  assunto: Rect | null
}): PontuacaoDePosicao<T>[] {
  const cores = args.coresDoTexto.length > 0 ? args.coresDoTexto : ['#FFFFFF']
  const alvo = Math.min(...cores.map((c) => alvoPorContraste(c, 3)))
  const luzTinta = luzDaCor(args.corDaMancha)
  const emax = Math.max(1, args.mapa.energiaMaxima)

  return args.candidatos
    .map((cand) => {
      const leitura = lerMapaSob(args.mapa, cand.rect)
      const calma = 1 - Math.min(1, leitura.energia / emax)
      // A luz que apaga a letra é o p98, não a média (roteiro 8 do _halo.py).
      const luz = 0.5 * leitura.media + 0.5 * leitura.p98
      const tinta = Math.max(0, Math.min(1, tintaParaAlvo(luz, alvo, luzTinta)))
      // Duas frações, vence a maior: quanto do ASSUNTO o bloco cobre (bloco
      // grande sobre prato pequeno) e quanto do BLOCO está sobre o assunto
      // (texto inteiro dentro de um assunto grande). Uma só deixava passar
      // o texto pousado em cima do prato quando o prato ocupa meio quadro.
      const areaAssunto = args.assunto ? args.assunto.width * args.assunto.height : 0
      const areaBloco = cand.rect.width * cand.rect.height
      const inter = args.assunto ? intersecao(cand.rect, args.assunto) : 0
      const cobreAssunto = areaAssunto > 0 && areaBloco > 0 ? Math.max(inter / areaAssunto, inter / areaBloco) : 0
      const descartado = cobreAssunto > TETO_DE_COBERTURA_DO_ASSUNTO
      const pontuacao = PESO_CALMA * calma + PESO_LUZ * (1 - tinta) + PESO_PREFERENCIA * cand.preferencia
      const motivo = descartado
        ? `cobre ${Math.round(cobreAssunto * 100)}% do assunto`
        : `calma ${calma.toFixed(2)}, tinta ${tinta.toFixed(2)}, preferência ${cand.preferencia.toFixed(2)}`
      return { ...cand, pontuacao, calma, tintaNecessaria: tinta, cobreAssunto, descartado, motivo }
    })
    .sort((a, b) => Number(a.descartado) - Number(b.descartado) || b.pontuacao - a.pontuacao)
}
