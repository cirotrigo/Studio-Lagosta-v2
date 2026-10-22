/**
 * `lerCor` (CP-X2a): o leitor ÚNICO de cor do vetor, sem DOM. Contrato da arquitetura §3.3:
 * `lerCor(valor) → { hex, alfa } | 'transparente' | null`.
 *
 * - `hex` sempre `#rrggbb` minúsculo; `alfa` em [0, 1];
 * - lê, depois de `trim` e sem diferenciar maiúsculas: hex de 3/4/6/8 dígitos; `rgb()`/`rgba()` e
 *   `hsl()`/`hsla()` com vírgulas (canais todos números ou todos %, como o CSS exige) ou com espaços e
 *   `/ alfa`; canal fora do intervalo é LIMITADO, como no CSS; matiz em número, `deg`, `rad`, `grad` ou
 *   `turn`; os 148 nomes do CSS Color 4; `transparent` → `'transparente'`;
 * - `currentcolor` e as palavras CSS-wide (`inherit`, `initial`, `unset`, `revert`, `revert-layer`) → `null`:
 *   dependem do contexto e não têm cor própria;
 * - qualquer outra coisa (inclusive não-texto, `none`, `lab()`, `oklch()`, notação `1e2`) → `null`. Nunca lança.
 *
 * A gramática cobre o que o campo de cor da UI grava (`corDigitadaParaGravar`, `shape-style.ts`), e a
 * conferência cruzada com o `CSS.supports` do Chromium mora em `tests/harness/cp-x2a`.
 */

export type CorLida = { hex: string; alfa: number } | 'transparente' | null

const NOMES: Record<string, string> = {
  aliceblue: 'f0f8ff', antiquewhite: 'faebd7', aqua: '00ffff', aquamarine: '7fffd4', azure: 'f0ffff',
  beige: 'f5f5dc', bisque: 'ffe4c4', black: '000000', blanchedalmond: 'ffebcd', blue: '0000ff',
  blueviolet: '8a2be2', brown: 'a52a2a', burlywood: 'deb887', cadetblue: '5f9ea0', chartreuse: '7fff00',
  chocolate: 'd2691e', coral: 'ff7f50', cornflowerblue: '6495ed', cornsilk: 'fff8dc', crimson: 'dc143c',
  cyan: '00ffff', darkblue: '00008b', darkcyan: '008b8b', darkgoldenrod: 'b8860b', darkgray: 'a9a9a9',
  darkgreen: '006400', darkgrey: 'a9a9a9', darkkhaki: 'bdb76b', darkmagenta: '8b008b', darkolivegreen: '556b2f',
  darkorange: 'ff8c00', darkorchid: '9932cc', darkred: '8b0000', darksalmon: 'e9967a', darkseagreen: '8fbc8f',
  darkslateblue: '483d8b', darkslategray: '2f4f4f', darkslategrey: '2f4f4f', darkturquoise: '00ced1',
  darkviolet: '9400d3', deeppink: 'ff1493', deepskyblue: '00bfff', dimgray: '696969', dimgrey: '696969',
  dodgerblue: '1e90ff', firebrick: 'b22222', floralwhite: 'fffaf0', forestgreen: '228b22', fuchsia: 'ff00ff',
  gainsboro: 'dcdcdc', ghostwhite: 'f8f8ff', gold: 'ffd700', goldenrod: 'daa520', gray: '808080',
  green: '008000', greenyellow: 'adff2f', grey: '808080', honeydew: 'f0fff0', hotpink: 'ff69b4',
  indianred: 'cd5c5c', indigo: '4b0082', ivory: 'fffff0', khaki: 'f0e68c', lavender: 'e6e6fa',
  lavenderblush: 'fff0f5', lawngreen: '7cfc00', lemonchiffon: 'fffacd', lightblue: 'add8e6', lightcoral: 'f08080',
  lightcyan: 'e0ffff', lightgoldenrodyellow: 'fafad2', lightgray: 'd3d3d3', lightgreen: '90ee90', lightgrey: 'd3d3d3',
  lightpink: 'ffb6c1', lightsalmon: 'ffa07a', lightseagreen: '20b2aa', lightskyblue: '87cefa',
  lightslategray: '778899', lightslategrey: '778899', lightsteelblue: 'b0c4de', lightyellow: 'ffffe0',
  lime: '00ff00', limegreen: '32cd32', linen: 'faf0e6', magenta: 'ff00ff', maroon: '800000',
  mediumaquamarine: '66cdaa', mediumblue: '0000cd', mediumorchid: 'ba55d3', mediumpurple: '9370db',
  mediumseagreen: '3cb371', mediumslateblue: '7b68ee', mediumspringgreen: '00fa9a', mediumturquoise: '48d1cc',
  mediumvioletred: 'c71585', midnightblue: '191970', mintcream: 'f5fffa', mistyrose: 'ffe4e1', moccasin: 'ffe4b5',
  navajowhite: 'ffdead', navy: '000080', oldlace: 'fdf5e6', olive: '808000', olivedrab: '6b8e23',
  orange: 'ffa500', orangered: 'ff4500', orchid: 'da70d6', palegoldenrod: 'eee8aa', palegreen: '98fb98',
  paleturquoise: 'afeeee', palevioletred: 'db7093', papayawhip: 'ffefd5', peachpuff: 'ffdab9', peru: 'cd853f',
  pink: 'ffc0cb', plum: 'dda0dd', powderblue: 'b0e0e6', purple: '800080', rebeccapurple: '663399',
  red: 'ff0000', rosybrown: 'bc8f8f', royalblue: '4169e1', saddlebrown: '8b4513', salmon: 'fa8072',
  sandybrown: 'f4a460', seagreen: '2e8b57', seashell: 'fff5ee', sienna: 'a0522d', silver: 'c0c0c0',
  skyblue: '87ceeb', slateblue: '6a5acd', slategray: '708090', slategrey: '708090', snow: 'fffafa',
  springgreen: '00ff7f', steelblue: '4682b4', tan: 'd2b48c', teal: '008080', thistle: 'd8bfd8',
  tomato: 'ff6347', turquoise: '40e0d0', violet: 'ee82ee', wheat: 'f5deb3', white: 'ffffff',
  whitesmoke: 'f5f5f5', yellow: 'ffff00', yellowgreen: '9acd32',
}

/** Nomes CSS reconhecidos (exportado para os testes e a conferência no Chromium). */
export const NOMES_DE_COR = Object.keys(NOMES)

/** Palavras que o navegador aceita como cor mas que não têm cor própria (dependem do contexto). */
export const PALAVRAS_DE_CONTEXTO = ['currentcolor', 'inherit', 'initial', 'unset', 'revert', 'revert-layer'] as const

const NUM = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)`
const ehNumero = new RegExp(`^${NUM}$`)
const ehPorcento = new RegExp(`^${NUM}%$`)
const ehAngulo = new RegExp(`^(${NUM})(deg|rad|grad|turn)?$`, 'i')

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const hex2 = (n: number) => Math.round(limitar(n, 0, 255)).toString(16).padStart(2, '0')
/** Última trava do contrato: só sai `#rrggbb` com alfa finito; qualquer não-finito vira `null` (nunca `#NaN…`). */
const montar = (r: number, g: number, b: number, alfa: number): CorLida =>
  [r, g, b, alfa].every(Number.isFinite) ? { hex: `#${hex2(r)}${hex2(g)}${hex2(b)}`, alfa: limitar(alfa, 0, 1) } : null

/** Alfa: número (limitado a [0,1]) ou porcentagem. */
function lerAlfa(t: string): number | null {
  if (ehPorcento.test(t)) return limitar(parseFloat(t) / 100, 0, 1)
  if (ehNumero.test(t)) return limitar(parseFloat(t), 0, 1)
  return null
}

/** Canal de RGB: número (0..255) ou porcentagem. Devolve o valor e o tipo, para a regra das vírgulas. */
function lerCanal(t: string): { v: number; pct: boolean } | null {
  if (ehPorcento.test(t)) return { v: (limitar(parseFloat(t), 0, 100) * 255) / 100, pct: true }
  if (ehNumero.test(t)) return { v: limitar(parseFloat(t), 0, 255), pct: false }
  return null
}

function lerMatiz(t: string): number | null {
  const m = ehAngulo.exec(t)
  if (!m) return null
  const n = parseFloat(m[1])
  // overflow no parse (mais de ~308 dígitos vira Infinity) ou na conversão de unidade (1e306turn × 360):
  // sem matiz finito não há cor — nunca inventar uma
  if (!Number.isFinite(n)) return null
  const unidade = (m[2] ?? 'deg').toLowerCase()
  const graus = unidade === 'rad' ? (n * 180) / Math.PI : unidade === 'grad' ? n * 0.9 : unidade === 'turn' ? n * 360 : n
  if (!Number.isFinite(graus)) return null
  return ((graus % 360) + 360) % 360
}

/**
 * Separa os argumentos: `a, b, c[, d]` (vírgulas) ou `a b c[ / d]` (espaços). Mistura de sintaxes é
 * recusada, como no CSS.
 */
function argumentos(corpo: string): { partes: string[]; alfa?: string; virgulas: boolean } | null {
  const c = corpo.trim()
  if (c.includes(',')) {
    if (c.includes('/')) return null
    const partes = c.split(',').map((p) => p.trim())
    if (partes.some((p) => p === '' || /\s/.test(p))) return null
    if (partes.length === 3) return { partes, virgulas: true }
    if (partes.length === 4) return { partes: partes.slice(0, 3), alfa: partes[3], virgulas: true }
    return null
  }
  const [base, alfa, ...resto] = c.split('/')
  if (resto.length > 0) return null
  const partes = base.trim().split(/\s+/)
  if (partes.length !== 3 || partes.some((p) => p === '')) return null
  if (alfa !== undefined) {
    const a = alfa.trim()
    if (!a || /\s/.test(a)) return null
    return { partes, alfa: a, virgulas: false }
  }
  return { partes, virgulas: false }
}

function lerRgb(corpo: string): CorLida {
  const a = argumentos(corpo)
  if (!a) return null
  const canais = a.partes.map(lerCanal)
  if (canais.some((c) => c === null)) return null
  // Na sintaxe de vírgulas o CSS exige os três canais do mesmo tipo (todos números ou todos %).
  if (a.virgulas && new Set(canais.map((c) => c!.pct)).size > 1) return null
  const alfa = a.alfa === undefined ? 1 : lerAlfa(a.alfa)
  if (alfa === null) return null
  return montar(canais[0]!.v, canais[1]!.v, canais[2]!.v, alfa)
}

function hslParaRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const a = s * Math.min(l, 1 - l)
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [f(0) * 255, f(8) * 255, f(4) * 255]
}

function lerHsl(corpo: string): CorLida {
  const a = argumentos(corpo)
  if (!a) return null
  const h = lerMatiz(a.partes[0])
  if (h === null || !ehPorcento.test(a.partes[1]) || !ehPorcento.test(a.partes[2])) return null
  const s = limitar(parseFloat(a.partes[1]), 0, 100) / 100
  const l = limitar(parseFloat(a.partes[2]), 0, 100) / 100
  const alfa = a.alfa === undefined ? 1 : lerAlfa(a.alfa)
  if (alfa === null) return null
  const [r, g, b] = hslParaRgb(h, s, l)
  return montar(r, g, b, alfa)
}

function lerHex(t: string): CorLida {
  const d = t.slice(1)
  if (!/^[0-9a-f]+$/i.test(d) || ![3, 4, 6, 8].includes(d.length)) return null
  const longo = d.length <= 4 ? d.split('').map((x) => x + x).join('') : d
  const n = (i: number) => parseInt(longo.slice(i, i + 2), 16)
  return montar(n(0), n(2), n(4), longo.length === 8 ? n(6) / 255 : 1)
}

export function lerCor(valor: unknown): CorLida {
  if (typeof valor !== 'string') return null
  const t = valor.trim().toLowerCase()
  if (!t) return null
  if (t.startsWith('#')) return lerHex(t)
  if (t === 'transparent') return 'transparente'
  if (Object.prototype.hasOwnProperty.call(NOMES, t)) return montar(...hexParaCanais(NOMES[t]), 1)
  const f = /^(rgba?|hsla?)\(([\s\S]*)\)$/.exec(t)
  if (f) return f[1].startsWith('rgb') ? lerRgb(f[2]) : lerHsl(f[2])
  return null
}

function hexParaCanais(h: string): [number, number, number] {
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
