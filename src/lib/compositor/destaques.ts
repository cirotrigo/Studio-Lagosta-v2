/**
 * DESTAQUE de palavra-chave com rich text (Ciro, 11/09/2026: "quem escreve a
 * copy marca, mas marca com []. Sem marcação a peça sai sem destaque").
 *
 * A marcação mora na COPY, e não numa lista à parte, por três razões: é o que
 * quem escreve (o chat, o plano, a proposta da semana) já produz; atravessa a
 * fila, o plano e a recomposição sem campo novo; e a volta (página → spec) é
 * reconstruível a partir dos trechos da camada.
 *
 * O ESTILO do destaque é da marca, nunca de quem escreve: a camada rich-text da
 * página de assinatura (a equipe destaca um trecho lá) ou
 * `Project.assinatura.destaque` — a cor da paleta e a versão mais pesada da
 * mesma família, que é o que a equipe já fazia à mão (medido em 11/09/2026 nas
 * páginas com rich text da carteira: Real laranja em StageGrotesk Medium sobre a
 * Thin, Empório TrajanPro Bold sobre a Regular, TERO salmão em Montserrat).
 *
 * 🔴 O renderer de rich text IGNORA `effects.shadow` da camada e só desenha
 * sombra POR TRECHO. Com sombra na assinatura, os trechos cobrem o conteúdo
 * inteiro — senão a sombra presa ao glifo sumia do texto comum.
 *
 * Módulo PURO.
 */

import type { Layer, RichTextStyle } from '@/types/template'

export interface TrechoDestacado {
  inicio: number
  fim: number
}

export interface LinhaComDestaque {
  /** A linha sem os colchetes — é o que vai para a arte. */
  texto: string
  trechos: TrechoDestacado[]
  /** Colchete sem par: a linha sai sem ele e o trecho não é destacado. */
  problema: string | null
}

/** Lê os [colchetes] de UMA linha. Nunca lança: colchete sem par vira aviso. */
export function lerDestaques(linha: string): LinhaComDestaque {
  let texto = ''
  const trechos: TrechoDestacado[] = []
  let aberto = -1
  let problema: string | null = null
  for (const ch of linha) {
    if (ch === '[') {
      if (aberto >= 0) problema = 'colchete aberto dentro de outro destaque'
      else aberto = texto.length
      continue
    }
    if (ch === ']') {
      if (aberto < 0) problema = 'colchete fechado sem ter sido aberto'
      else {
        if (texto.length > aberto) trechos.push({ inicio: aberto, fim: texto.length })
        aberto = -1
      }
      continue
    }
    texto += ch
  }
  if (aberto >= 0) problema = 'colchete aberto sem fechar'
  // "[ em dobro ]" destaca "em dobro": espaço nas pontas não é destaque.
  const aparados = trechos
    .map((t) => {
      let { inicio, fim } = t
      while (inicio < fim && /\s/.test(texto[inicio])) inicio++
      while (fim > inicio && /\s/.test(texto[fim - 1])) fim--
      return { inicio, fim }
    })
    .filter((t) => t.fim > t.inicio)
  return { texto, trechos: aparados, problema }
}

/** A copy sem a marcação — para quem desenha texto sem rich text (IA, template, comparação). */
export function semColchetes(texto: string): string {
  return texto.replace(/[[\]]/g, '')
}

export function temColchetes(textos: Array<string | null | undefined>): boolean {
  return textos.some((t) => typeof t === 'string' && /[[\]]/.test(t))
}

// ─── A família mais pesada ─────────────────────────────────────────────────

const PESOS: Array<[RegExp, number]> = [
  [/^(thin|hairline)$/, 100],
  [/^(extralight|ultralight)$/, 200],
  [/^light$/, 300],
  [/^(book|regular|normal|roman)$/, 400],
  [/^medium$/, 500],
  [/^(semibold|demibold)$/, 600],
  [/^bold$/, 700],
  [/^(extrabold|ultrabold|heavy)$/, 800],
  [/^black$/, 900],
]

/** Peso e raiz de uma família pelo NOME ("StageGrotesk Thin" → stagegrotesk, 100). */
export function pesoPeloNome(familia: string): { raiz: string; peso: number; italico: boolean } {
  const tokens = familia.trim().split(/\s+/).filter(Boolean)
  let peso = 400
  let italico = false
  let i = tokens.length - 1
  // Só os tokens do FIM descrevem peso/estilo; o primeiro é sempre raiz.
  while (i >= 1) {
    let t = tokens[i].toLowerCase()
    let it = false
    if (t.endsWith('italic')) {
      it = true
      t = t.slice(0, -'italic'.length)
    }
    if (t === '' && it) {
      italico = true
      i--
      continue
    }
    const achado = PESOS.find(([re]) => re.test(t))
    if (!achado) break
    peso = achado[1]
    if (it) italico = true
    i--
  }
  return { raiz: tokens.slice(0, i + 1).join(' ').toLowerCase(), peso, italico }
}

/**
 * A versão mais pesada da MESMA família entre as fontes cadastradas, mirando
 * ~300 acima (e ao menos Medium). Sem nenhuma, null — o destaque fica só na cor.
 */
export function familiaMaisPesada(base: string, familias: string[]): string | null {
  const b = pesoPeloNome(base)
  const alvo = Math.max(500, b.peso + 300)
  const candidatas = [...new Set(familias)]
    .map((f) => ({ f, ...pesoPeloNome(f) }))
    .filter((c) => c.raiz === b.raiz && c.italico === b.italico && c.peso > b.peso)
  if (candidatas.length === 0) return null
  candidatas.sort((x, y) => Math.abs(x.peso - alvo) - Math.abs(y.peso - alvo) || y.peso - x.peso)
  return candidatas[0].f
}

// ─── O estilo e os trechos ─────────────────────────────────────────────────

export interface EstiloDeDestaque {
  fill?: string
  fontFamily?: string
  fontStyle?: RichTextStyle['fontStyle']
  textDecoration?: RichTextStyle['textDecoration']
}

interface Base {
  fill: string
  fontFamily: string
}

function baseDaCamada(camada: Layer): Base {
  return { fill: String(camada.style?.color ?? '').toLowerCase(), fontFamily: String(camada.style?.fontFamily ?? '') }
}

function diferencaDaBase(s: RichTextStyle, base: Base): EstiloDeDestaque {
  const d: EstiloDeDestaque = {}
  if (s.fill && s.fill.toLowerCase() !== base.fill) d.fill = s.fill
  if (s.fontFamily && s.fontFamily !== base.fontFamily) d.fontFamily = s.fontFamily
  if (s.fontStyle && s.fontStyle !== 'normal') d.fontStyle = s.fontStyle
  if (s.textDecoration && s.textDecoration !== 'none') d.textDecoration = s.textDecoration
  return d
}

/** O destaque que a equipe deixou numa camada rich-text da página de assinatura. */
export function destaqueDaCamada(camada: Layer): EstiloDeDestaque | null {
  if (camada.type !== 'rich-text' || !Array.isArray(camada.richTextStyles)) return null
  const base = baseDaCamada(camada)
  for (const s of camada.richTextStyles) {
    const d = diferencaDaBase(s, base)
    if (Object.keys(d).length > 0) return d
  }
  return null
}

/** `#RRGGBB` + opacidade → `rgba()` (a sombra do rich text só lê opacidade na cor). */
export function corComOpacidade(cor: string, opacidade: number): string {
  const hex = cor.trim().replace('#', '')
  const h = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  if (!/^[0-9a-f]{6}$/i.test(h)) return cor
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${Number(Math.max(0, Math.min(1, opacidade)).toFixed(3))})`
}

export interface SombraDoGlifo {
  color: string
  blur: number
  offsetY: number
  opacity: number
}

/**
 * Os trechos de estilo de uma camada rich-text do compositor. Os `trechos`
 * são offsets no conteúdo FINAL (com prefixo e quebras de linha).
 */
export function estilosDoRichText(args: {
  conteudo: string
  trechos: TrechoDestacado[]
  destaque: EstiloDeDestaque
  sombra: SombraDoGlifo | null
}): RichTextStyle[] {
  const n = args.conteudo.length
  const trechos = args.trechos
    .map((t) => ({ inicio: Math.max(0, Math.min(n, t.inicio)), fim: Math.max(0, Math.min(n, t.fim)) }))
    .filter((t) => t.fim > t.inicio)
  const sombra = args.sombra
    ? { color: corComOpacidade(args.sombra.color, args.sombra.opacity), blur: args.sombra.blur, offset: { x: 0, y: args.sombra.offsetY } }
    : null
  const cortes = [...new Set([0, n, ...trechos.flatMap((t) => [t.inicio, t.fim])])].sort((a, b) => a - b)
  const saida: RichTextStyle[] = []
  for (let i = 0; i < cortes.length - 1; i++) {
    const start = cortes[i]
    const end = cortes[i + 1]
    if (end <= start) continue
    const destacado = trechos.some((t) => t.inicio <= start && end <= t.fim)
    if (!destacado && !sombra) continue
    saida.push({ start, end, ...(destacado ? args.destaque : {}), ...(sombra ? { shadow: sombra } : {}) })
  }
  return saida
}

/**
 * A volta: uma camada rich-text vira linhas com [colchetes] nos trechos que
 * DIFEREM do estilo base (sombra sozinha não é destaque). É o que deixa a
 * recomposição refazer a peça sem perder o destaque. Camada que não é rich
 * text → null.
 */
export function linhasComColchetes(camada: Layer): string[] | null {
  if (camada.type !== 'rich-text') return null
  const conteudo = typeof camada.content === 'string' ? camada.content : ''
  const base = baseDaCamada(camada)
  const marcado = new Array<boolean>(conteudo.length).fill(false)
  for (const s of Array.isArray(camada.richTextStyles) ? camada.richTextStyles : []) {
    if (Object.keys(diferencaDaBase(s, base)).length === 0) continue
    for (let i = Math.max(0, s.start); i < Math.min(conteudo.length, s.end); i++) marcado[i] = true
  }
  let saida = ''
  let aberto = false
  for (let i = 0; i < conteudo.length; i++) {
    const ch = conteudo[i]
    const liga = marcado[i] && ch !== '\n'
    if (liga && !aberto) {
      saida += '['
      aberto = true
    } else if (!liga && aberto) {
      saida += ']'
      aberto = false
    }
    saida += ch
  }
  if (aberto) saida += ']'
  // Espaço dentro do colchete na borda sai para fora ("[em dobro ]" → "[em dobro] ").
  return saida.split('\n').map((l) => l.replace(/\[(\s+)/g, '$1[').replace(/(\s+)\]/g, ']$1'))
}

// ─── O destaque de um papel ────────────────────────────────────────────────

/** Abaixo desta distância RGB a cor do destaque não se distingue da cor do texto. */
export const COR_PARECIDA = 90

/** Distância RGB entre duas cores `#RGB`/`#RRGGBB`; null quando alguma não é hex. */
export function distanciaDeCor(a: string | null | undefined, b: string | null | undefined): number | null {
  const rgb = (c: string | null | undefined) => {
    const h = String(c ?? '').trim().replace('#', '')
    const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h
    return /^[0-9a-f]{6}$/i.test(f) ? [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)) : null
  }
  const x = rgb(a)
  const y = rgb(b)
  if (!x || !y) return null
  return Math.round(Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]))
}

export interface DestaquePadraoDaMarca {
  fill?: string
  fontFamily?: string
  pesado?: boolean
  /** A cor para quando o papel JÁ É da cor de destaque (o CTA vermelho do Espeto). */
  alternativa?: string
}

/**
 * O destaque que vale para UM papel. A página manda (a equipe desenhou); sem
 * ela, o padrão da marca, com duas correções sem as quais o destaque não aparece:
 *  - a família mais pesada é a DAQUELE papel (manchete e apoio têm famílias
 *    diferentes);
 *  - papel que JÁ É da cor de destaque (o CTA vermelho do Espeto, a manchete
 *    dourada do Empório) não destaca nada pintando de novo da mesma cor: vale a
 *    `alternativa` da marca. Sem alternativa, fica só o peso — e sem peso, nada
 *    (quem monta o bloco avisa).
 * Medido nas amostras de 11/09/2026: sem esta regra o destaque sumia em três
 * dos dez clientes.
 */
export function destaqueDoPapel(args: {
  daPagina?: EstiloDeDestaque | null
  padrao: DestaquePadraoDaMarca
  corDoPapel: string
  familiaDoPapel: string
  familias: string[]
}): EstiloDeDestaque | null {
  if (args.daPagina && Object.keys(args.daPagina).length > 0) return args.daPagina
  const { padrao } = args
  const fontFamily = padrao.fontFamily ?? (padrao.pesado ? familiaMaisPesada(args.familiaDoPapel, args.familias) ?? undefined : undefined)
  let fill = padrao.fill
  const colide = (cor: string | undefined) => {
    const d = distanciaDeCor(cor, args.corDoPapel)
    return d !== null && d < COR_PARECIDA
  }
  if (fill && colide(fill)) fill = padrao.alternativa && !colide(padrao.alternativa) ? padrao.alternativa : undefined
  const saida: EstiloDeDestaque = { ...(fill ? { fill } : {}), ...(fontFamily ? { fontFamily } : {}) }
  return Object.keys(saida).length > 0 ? saida : null
}
