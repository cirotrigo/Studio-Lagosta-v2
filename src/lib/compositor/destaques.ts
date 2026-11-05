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

/**
 * `lerDestaques` para um texto de VÁRIAS linhas (a caixa do editor, o
 * `content` que chega pelo MCP): os offsets saem no texto limpo inteiro, com
 * as quebras. O colchete não atravessa a linha; o primeiro problema vence.
 */
export function lerDestaquesDoTexto(texto: string): LinhaComDestaque {
  const linhas = texto.split('\n').map(lerDestaques)
  const trechos: TrechoDestacado[] = []
  let base = 0
  for (const l of linhas) {
    for (const t of l.trechos) trechos.push({ inicio: base + t.inicio, fim: base + t.fim })
    base += l.texto.length + 1
  }
  return { texto: linhas.map((l) => l.texto).join('\n'), trechos, problema: linhas.find((l) => l.problema)?.problema ?? null }
}

/**
 * O ÚNICO jeito de trocar o `content` de uma camada: texto novo com [colchetes]
 * vira `content` limpo + `destaques`; sem colchetes, os `destaques` antigos
 * são apagados (offsets de um texto que não existe mais pintariam letras ao
 * acaso). Quem grava `content` por fora da caixa do canvas (painel de
 * propriedades, gerador, fieldValues, slotValues, bake) passa por aqui.
 * Camada que não é `text`: só o conteúdo. `problema` é o aviso do colchete
 * sem par; o `destaque` (estilo) é de quem grava, pela marca.
 */
export function trocarConteudo(
  camada: { type?: unknown; destaques?: unknown },
  texto: string,
): { content: string; destaques: TrechoDestacado[] | undefined; problema: string | null } {
  if (camada.type !== 'text') return { content: texto, destaques: undefined, problema: null }
  const lido = lerDestaquesDoTexto(texto)
  return { content: lido.texto, destaques: lido.trechos.length > 0 ? lido.trechos : undefined, problema: lido.problema }
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

/**
 * O destaque que a equipe deixou numa camada da página de assinatura: o
 * `destaque` de uma camada `text` com marcação, ou o trecho que difere da
 * base numa rich-text.
 */
export function destaqueDaCamada(camada: Layer): EstiloDeDestaque | null {
  const base = baseDaCamada(camada)
  if (camada.type === 'text') {
    if (!trechosDaCamada(camada).length || !camada.destaque) return null
    const d = diferencaDaBase({ start: 0, end: 0, ...camada.destaque }, base)
    return Object.keys(d).length > 0 ? d : null
  }
  if (camada.type !== 'rich-text' || !Array.isArray(camada.richTextStyles)) return null
  for (const s of camada.richTextStyles) {
    const d = diferencaDaBase(s, base)
    if (Object.keys(d).length > 0) return d
  }
  return null
}

/** Os `destaques` de uma camada `text`, só os válidos dentro do `content`. */
function trechosDaCamada(camada: Layer): TrechoDestacado[] {
  if (!Array.isArray(camada.destaques)) return []
  const n = typeof camada.content === 'string' ? camada.content.length : 0
  return camada.destaques
    .filter((t) => t && Number.isFinite(t.inicio) && Number.isFinite(t.fim))
    .map((t) => ({ inicio: Math.max(0, Math.min(n, Math.floor(t.inicio))), fim: Math.max(0, Math.min(n, Math.floor(t.fim))) }))
    .filter((t) => t.fim > t.inicio)
}

/** A sombra da camada no formato por glifo do rich text; null quando desligada. */
export function sombraDaCamada(camada: Layer): SombraDoGlifo | null {
  const s = camada.effects?.shadow
  if (!s?.enabled) return null
  return { color: s.shadowColor ?? '#000000', blur: s.shadowBlur ?? 0, offsetX: s.shadowOffsetX ?? 0, offsetY: s.shadowOffsetY ?? 0, opacity: s.shadowOpacity ?? 1 }
}

/** O contorno da camada `text` (effects.stroke, senão style.border) no formato por segmento; null sem contorno. */
export function contornoDaCamada(camada: Layer): { color: string; width: number } | null {
  const fx = camada.effects?.stroke
  if (fx?.enabled && (fx.strokeWidth ?? 0) > 0) return { color: fx.strokeColor ?? '#000000', width: fx.strokeWidth }
  const borda = camada.style?.border
  if (borda?.width && borda.width > 0) return { color: borda.color ?? '#000000', width: borda.width }
  return null
}

/**
 * Os segmentos (no formato do rich text) de uma camada `text` com
 * `destaques`: os offsets são no `content` CRU (ver
 * `segmentosNoTextoTransformado` para o textTransform). O estilo é o
 * `destaque` gravado; sem ele, a família mais pesada da mesma família quando
 * há uma lista de famílias à mão. Sem estilo nenhum, null: o texto desenha
 * como texto comum, nunca um destaque invisível. Camada sem `destaques`, ou
 * que não é `text`: null — e nada muda no desenho.
 *
 * `comEfeitos`: a sombra e o contorno da camada entram em TODOS os segmentos
 * — é o que o editor precisa, porque o Konva.Text fica transparente e os
 * segmentos desenham tudo. O servidor NÃO pede: lá o texto com destaques
 * passa pelo mesmo `renderText` do texto comum (sombra no ctx, contorno por
 * linha), e só a tinta de cada trecho é por segmento.
 */
export function segmentosDoTexto(camada: Layer, opcoes: { familias?: string[]; comEfeitos?: boolean } = {}): RichTextStyle[] | null {
  if (camada.type !== 'text') return null
  const trechos = trechosDaCamada(camada)
  if (trechos.length === 0) return null
  const conteudo = typeof camada.content === 'string' ? camada.content : ''
  let destaque: EstiloDeDestaque = { ...(camada.destaque ?? {}) }
  if (Object.keys(destaque).length === 0 && opcoes.familias?.length) {
    const pesada = familiaMaisPesada(baseDaCamada(camada).fontFamily, opcoes.familias)
    destaque = pesada ? { fontFamily: pesada } : {}
  }
  if (Object.keys(destaque).length === 0) return null
  return estilosDoRichText({
    conteudo,
    trechos,
    destaque,
    sombra: opcoes.comEfeitos ? sombraDaCamada(camada) : null,
    contorno: opcoes.comEfeitos ? contornoDaCamada(camada) : null,
  })
}

/**
 * Leva segmentos com offsets no texto CRU para o texto TRANSFORMADO
 * (`textTransform`): fatia o cru, transforma cada pedaço e soma os
 * comprimentos. "ß" → "SS" e ligaduras mudam o comprimento, então transformar
 * o texto inteiro antes de fatiar deslocava os offsets. Os pedaços sem
 * segmento são transformados do mesmo jeito; `texto` é o conteúdo final.
 */
export function segmentosNoTextoTransformado(
  segmentos: RichTextStyle[],
  conteudoCru: string,
  transformar: (pedaco: string) => string,
): { texto: string; segmentos: RichTextStyle[] } {
  const n = conteudoCru.length
  const ordenados = [...segmentos]
    .map((s) => ({ ...s, start: Math.max(0, Math.min(n, s.start)), end: Math.max(0, Math.min(n, s.end)) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start)
  let texto = ''
  let cursor = 0
  const saida: RichTextStyle[] = []
  for (const s of ordenados) {
    if (s.start > cursor) texto += transformar(conteudoCru.slice(cursor, s.start))
    const inicio = texto.length
    texto += transformar(conteudoCru.slice(Math.max(s.start, cursor), s.end))
    saida.push({ ...s, start: inicio, end: texto.length })
    cursor = Math.max(cursor, s.end)
  }
  if (cursor < n) texto += transformar(conteudoCru.slice(cursor))
  return { texto, segmentos: saida }
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
  /** Ausente = 0 (a sombra da assinatura só desloca na vertical). */
  offsetX?: number
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
  /** Contorno da camada inteira (como a sombra, cobre todo o conteúdo). */
  contorno?: { color: string; width: number } | null
}): RichTextStyle[] {
  const n = args.conteudo.length
  const trechos = args.trechos
    .map((t) => ({ inicio: Math.max(0, Math.min(n, t.inicio)), fim: Math.max(0, Math.min(n, t.fim)) }))
    .filter((t) => t.fim > t.inicio)
  const sombra = args.sombra
    ? { color: corComOpacidade(args.sombra.color, args.sombra.opacity), blur: args.sombra.blur, offset: { x: args.sombra.offsetX ?? 0, y: args.sombra.offsetY } }
    : null
  const contorno = args.contorno ?? null
  const cortes = [...new Set([0, n, ...trechos.flatMap((t) => [t.inicio, t.fim])])].sort((a, b) => a - b)
  const saida: RichTextStyle[] = []
  for (let i = 0; i < cortes.length - 1; i++) {
    const start = cortes[i]
    const end = cortes[i + 1]
    if (end <= start) continue
    const destacado = trechos.some((t) => t.inicio <= start && end <= t.fim)
    if (!destacado && !sombra && !contorno) continue
    saida.push({
      start,
      end,
      ...(destacado ? args.destaque : {}),
      ...(sombra ? { shadow: sombra } : {}),
      ...(contorno ? { stroke: contorno } : {}),
    })
  }
  return saida
}

/**
 * A volta: uma camada com destaque vira linhas com [colchetes] — nos
 * `destaques` de uma camada `text`, ou nos trechos de uma rich-text que
 * DIFEREM do estilo base (sombra sozinha não é destaque). É o que deixa a
 * recomposição refazer a peça sem perder o destaque, e o que a caixa do
 * editor mostra. Camada `text` sem destaques, ou de outro tipo → null.
 */
export function linhasComColchetes(camada: Layer): string[] | null {
  const conteudo = typeof camada.content === 'string' ? camada.content : ''
  const marcado = new Array<boolean>(conteudo.length).fill(false)
  if (camada.type === 'text') {
    const trechos = trechosDaCamada(camada)
    if (trechos.length === 0) return null
    for (const t of trechos) for (let i = t.inicio; i < t.fim; i++) marcado[i] = true
  } else if (camada.type === 'rich-text') {
    const base = baseDaCamada(camada)
    for (const s of Array.isArray(camada.richTextStyles) ? camada.richTextStyles : []) {
      if (Object.keys(diferencaDaBase(s, base)).length === 0) continue
      for (let i = Math.max(0, s.start); i < Math.min(conteudo.length, s.end); i++) marcado[i] = true
    }
  } else return null
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

/** O destaque padrão da marca quando `Project.assinatura` não diz nada: só o peso. */
export const DESTAQUE_PADRAO: DestaquePadraoDaAssinatura = { pesado: true }

export type DestaquePadraoDaAssinatura = { fill?: string; fontFamily?: string; pesado: boolean; alternativa?: string }

/** `Project.assinatura.destaque` cru sobre a base — a regra do compositor (`mesclarNumeros`). */
export function mesclarDestaque(base: DestaquePadraoDaAssinatura, extra: unknown): DestaquePadraoDaAssinatura {
  if (!extra || typeof extra !== 'object') return base
  const e = extra as Record<string, unknown>
  return {
    ...(typeof e.fill === 'string' && e.fill ? { fill: e.fill } : base.fill ? { fill: base.fill } : {}),
    ...(typeof e.fontFamily === 'string' && e.fontFamily ? { fontFamily: e.fontFamily } : base.fontFamily ? { fontFamily: base.fontFamily } : {}),
    pesado: typeof e.pesado === 'boolean' ? e.pesado : base.pesado,
    ...(typeof e.alternativa === 'string' && e.alternativa ? { alternativa: e.alternativa } : base.alternativa ? { alternativa: base.alternativa } : {}),
  }
}

/**
 * O destaque padrão da marca a partir do JSON cru de `Project.assinatura` — a
 * MESMA regra do compositor, para o editor não ter outra: cor só de
 * `assinatura.destaque.fill`; sem ela, só o peso. Módulo puro: o hook do
 * editor importa daqui (assinatura.ts arrasta o canvas do servidor).
 */
export function destaquePadraoDaAssinatura(numerosDoProjeto: unknown): DestaquePadraoDaAssinatura {
  const cru = numerosDoProjeto && typeof numerosDoProjeto === 'object' ? (numerosDoProjeto as { destaque?: unknown }).destaque : undefined
  return mesclarDestaque(DESTAQUE_PADRAO, cru)
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
