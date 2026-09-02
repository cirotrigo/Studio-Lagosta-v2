/**
 * HALO — a leitura do texto sobre a foto sem véu, em TypeScript.
 *
 * Porte fiel de `design-canvas/_halo.py` (01/09/2026), o módulo que as 8
 * sessões do canvas calibraram cliente a cliente. O véu era um gradiente sobre
 * a faixa inteira do topo ou do rodapé; o halo é uma caixa escura atrás do
 * BLOCO de texto, desfocada, que desmancha nas bordas e escurece só onde a
 * letra cai. Medido no Espeto: o véu perdia 30% da cor da foto (CIELAB); o
 * halo entrega a foto a 5% do original.
 *
 * 🔴 É `filter: blur()` na PRÓPRIA caixa, nunca `backdrop-filter` — no render
 * server-side isso é desenhar o retângulo num offscreen e borrar os PIXELS
 * DELE, nunca a foto por baixo.
 *
 * Módulo PURO (sem sharp, sem Prisma): a medição da foto mora em
 * `halo-medicao.ts`, e o editor Konva é client.
 *
 * Regras que o docstring do `_halo.py` deixou, e que este porte respeita:
 *  - a tinta sai de um ALVO por cor de texto (`alvoPorContraste` +
 *    `tintaParaAlvo`), não de um número arbitrado; foto já escura → tinta 0;
 *  - a luz se mede no RETÂNGULO DO TEXTO, por percentil, nunca a média
 *    (`luzDeLeitura`: meia média, meio p75);
 *  - o blur é uma gaussiana: caixa mais baixa que ~2× o raio nunca chega à
 *    tinta cheia no miolo (`ajustarPorGeometria`);
 *  - a margem em volta do texto é ~1,4 × raio, para o texto ficar no PLATÔ e
 *    não na rampa (lição do Quintal);
 *  - ornamento fino (< 8px) não vota no alvo.
 */

/** Interpola entre `minimo` e `maximo` conforme o BRILHO MEDIDO (50..210). */
export function op(luz: number, minimo: number, maximo: number): number {
  const t = (Math.max(50, Math.min(210, luz)) - 50) / 160
  return minimo + t * (maximo - minimo)
}

/** Luz que calibra o halo: metade média, metade percentil 75. */
export function luzDeLeitura(media: number, p75: number): number {
  return 0.5 * media + 0.5 * p75
}

/** Percentil `q` de um histograma de 256 posições (imagem em cinza). */
export function percentil(histograma: number[], q = 0.75): number {
  const total = histograma.reduce((a, b) => a + b, 0)
  if (total === 0) return 255
  const alvo = q * total
  let soma = 0
  for (let valor = 0; valor < histograma.length; valor++) {
    soma += histograma[valor]
    if (soma >= alvo) return valor
  }
  return 255
}

function erf(x: number): number {
  // Abramowitz-Stegun 7.1.26, erro < 1.5e-7 — suficiente para calibrar tinta.
  const sinal = x < 0 ? -1 : 1
  const a = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * a)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a)
  return sinal * y
}

/** Quanto da tinta nominal sobra no CENTRO da mancha depois do blur. */
export function atenuacao(meiaLarg: number, meiaAlt: number, raio: number): number {
  const r = Math.max(1, raio) * Math.SQRT2
  return erf(meiaLarg / r) * erf(meiaAlt / r)
}

/** Tinta que chega à PRIMEIRA e à ÚLTIMA linha — centro em X, borda em Y. */
export function atenuacaoNaLinha(larg: number, alt: number, insetY: number, raio: number): number {
  const phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2))
  const r = Math.max(1, raio)
  const x = erf(larg / 2 / (r * Math.SQRT2))
  const y = Math.max(0.02, phi(insetY / r) + phi((alt + insetY) / r) - 1)
  return x * y
}

/**
 * (tinta, raio) corrigidos para o TAMANHO REAL do bloco.
 *
 * O raio é limitado a `min(meiaLarg, meiaAlt) / 1,44` (ponto em que a
 * atenuação ainda devolve ~0,85) e a tinta é dividida pelo que sobrar, para o
 * CENTRO chegar ao valor pretendido. Sem isto a marca de 89px recebia a mesma
 * mancha do lockup de 234px e quase sumia (TERO, 01/09/2026).
 */
export function ajustarPorGeometria(
  tinta: number,
  raio: number,
  larg: number,
  alt: number,
  insetX = 54,
  insetY = 44,
  raioMinimo = 34,
): { tinta: number; raio: number } {
  const mw = (larg + 2 * insetX) / 2
  const mh = (alt + 2 * insetY) / 2
  const raioAjustado = Math.max(raioMinimo, Math.min(raio, Math.floor(Math.min(mw, mh) / 1.44)))
  return {
    tinta: Math.min(0.95, tinta / Math.max(0.35, atenuacao(mw, mh, raioAjustado))),
    raio: raioAjustado,
  }
}

function linear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** Luminância relativa (0..1) de uma cor hex. */
export function luminanciaRelativa(corHex: string): number {
  const hex = corHex.replace('#', '')
  const h = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return 1
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/**
 * Luminância MÁXIMA (0..255) do fundo para `corHex` atingir `ratio` (WCAG).
 *
 * 3:1 para display, 4,5:1 para corpo pequeno. Creme #F5F0E8 → 139; verde
 * #7A9A5C → 69; branco → 149 (Quintal). E revela quando a conta NÃO fecha:
 * o vermelho #F4301A exige fundo ≤ 51 — isso é o véu de volta com outro
 * nome, e a resposta certa é sombra presa ao glifo, não mais halo.
 */
export function alvoPorContraste(corHex: string, ratio = 3): number {
  const y = luminanciaRelativa(corHex)
  const alvo = Math.max(0, Math.min(1, (y + 0.05) / ratio - 0.05))
  const s = alvo <= 0.0031308 ? alvo * 12.92 : 1.055 * alvo ** (1 / 2.4) - 0.055
  return s * 255
}

/**
 * Tinta que põe o fundo do bloco na luminância `alvo`. ZERO quando já está lá.
 *
 * Sobrepor a mancha dá `luz*(1-a) + luzDaTinta*a`, então
 * `a = (luz - alvo) / (luz - luzDaTinta)`. O ganho é o zero: foto noturna não
 * recebe mancha nenhuma (16 dos 63 blocos do TERO).
 */
export function tintaParaAlvo(luz: number, alvo: number, luzDaTinta: number): number {
  if (luz <= alvo) return 0
  return Math.min(0.95, (luz - alvo) / Math.max(1, luz - luzDaTinta))
}

/** Retângulo em pixels da peça. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** O que a medição da foto devolve para um retângulo. */
export interface LuzMedida {
  media: number
  p75: number
}

/** Luminância aproximada (0..255) de uma cor hex, para a tinta do halo. */
export function luzDaCor(corHex: string): number {
  const hex = corHex.replace('#', '')
  const h = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return 17
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export interface CalibrarHaloInput {
  /** Retângulo do TEXTO (união das caixas dos blocos), nunca o do halo. */
  texto: Rect
  /** Luz da foto medida DENTRO do retângulo do texto. */
  luz: LuzMedida
  /** Cores de texto do bloco (hex). A mais exigente manda no alvo. */
  coresDoTexto: string[]
  /** Cor da mancha — o dark da marca, nunca preto puro por default. */
  corDaMancha: string
  /** Raio de partida; blocos baixos são encolhidos por `ajustarPorGeometria`. */
  raioBase?: number
  /** Ratio WCAG: 3 para display (default), 4,5 para corpo pequeno. */
  ratio?: number
}

export interface HaloCalibrado {
  /** Retângulo do halo: o do texto crescido pela margem (1,4 × raio). */
  rect: Rect
  raio: number
  /** Opacidade da mancha (0..0,95). 0 = sem halo: a foto já se lê sozinha. */
  tinta: number
  alvo: number
  luzMedida: number
  /** A conta não fechou: tinta no teto e o alvo não é alcançado. Sinal de curadoria. */
  noTeto: boolean
}

/**
 * Calibra o halo de um bloco de texto pela foto que ele cobre.
 *
 * O caminho é o do Quintal (o mais completo dos 9): alvo por cor de tinta,
 * margem = 1,4 × raio (o texto fica no platô da gaussiana), tinta pelo alvo
 * com compensação pela geometria — e zero quando a foto já é escura.
 */
export function calibrarHalo(input: CalibrarHaloInput): HaloCalibrado {
  const ratio = input.ratio ?? 3
  const cores = input.coresDoTexto.length > 0 ? input.coresDoTexto : ['#FFFFFF']
  // A cor mais exigente (menor luminância → alvo mais escuro) manda.
  const alvo = Math.min(...cores.map((c) => alvoPorContraste(c, ratio)))
  const luz = luzDeLeitura(input.luz.media, input.luz.p75)
  const raioBase = input.raioBase ?? 110
  const luzTinta = luzDaCor(input.corDaMancha)

  const bruta = tintaParaAlvo(luz, alvo, luzTinta)
  if (bruta <= 0) {
    return {
      rect: crescer(input.texto, 0),
      raio: raioBase,
      tinta: 0,
      alvo,
      luzMedida: luz,
      noTeto: false,
    }
  }
  const margem = Math.round(1.4 * raioBase)
  const { tinta, raio } = ajustarPorGeometria(bruta, raioBase, input.texto.width, input.texto.height, margem, margem)
  return {
    rect: crescer(input.texto, Math.round(1.4 * raio)),
    raio,
    tinta: Number(tinta.toFixed(3)),
    alvo,
    luzMedida: luz,
    // `tintaParaAlvo` já devolve no máximo 0,95, então "bruta > 0,95" nunca
    // acontecia e o sinal era morto. No teto de verdade: nem com a tinta
    // cheia o fundo chega ao alvo (é o vermelho do Espeto sobre foto clara).
    noTeto: tinta >= 0.95 && 0.05 * luz + 0.95 * luzTinta > alvo,
  }
}

function crescer(r: Rect, margem: number): Rect {
  return { x: r.x - margem, y: r.y - margem, width: r.width + 2 * margem, height: r.height + 2 * margem }
}

/** União de retângulos (as caixas dos blocos de texto de um grupo). */
export function uniao(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  const x0 = Math.min(...rects.map((r) => r.x))
  const y0 = Math.min(...rects.map((r) => r.y))
  const x1 = Math.max(...rects.map((r) => r.x + r.width))
  const y1 = Math.max(...rects.map((r) => r.y + r.height))
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/**
 * Agrupa caixas de texto em blocos: caixas cujo vão vertical é menor que
 * `folga` pertencem ao mesmo bloco (manchete + apoio), o resto é outro bloco
 * (rodapé de serviço). É o "halo se parte onde o ESPAÇADOR já partia a peça".
 */
export function agruparEmBlocos<T extends { rect: Rect }>(itens: T[], folga = 120): T[][] {
  const ordenados = [...itens].sort((a, b) => a.rect.y - b.rect.y)
  const grupos: T[][] = []
  for (const item of ordenados) {
    const ultimo = grupos[grupos.length - 1]
    if (!ultimo) {
      grupos.push([item])
      continue
    }
    const fim = Math.max(...ultimo.map((i) => i.rect.y + i.rect.height))
    if (item.rect.y - fim <= folga) ultimo.push(item)
    else grupos.push([item])
  }
  return grupos
}
