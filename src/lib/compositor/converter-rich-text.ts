/**
 * Conversão de camada `rich-text` em camada `text` com `destaques` (T3 do
 * plano "destaque por marcação", 05/11/2026). Módulo PURO — não importa
 * `@/lib/db`; o script `scripts/converter-rich-text.ts` é quem fala com o banco.
 *
 * Uma rich-text vira `text` + `destaques` + `destaque` quando o que ela tem
 * cabe nos dois campos: UM estilo de destaque (o mesmo em todo trecho que
 * difere do estilo base) e, no máximo, uma sombra igual em todo o conteúdo
 * (que passa para `effects.shadow` da camada). Qualquer coisa além disso
 * (duas cores na mesma frase, tamanho, espaçamento ou contorno por trecho)
 * continua rich-text — o conversor nunca "arredonda" o que a equipe fez.
 *
 * 🔴 `diferencaDaBase` é a MESMA regra de `destaques.ts` (não exportada lá,
 * para esse arquivo não conflitar com os PRs #297 e #298): trecho que difere
 * da base é o que tem cor, família, itálico/negrito ou sublinhado diferentes.
 */
import type { Layer, RichTextStyle } from '@/types/template'
import { linhasComColchetes } from './destaques'

export interface EstiloDeDestaqueGravado {
  fill?: string
  fontFamily?: string
  fontStyle?: RichTextStyle['fontStyle']
  textDecoration?: RichTextStyle['textDecoration']
}

export type MotivoNaoConversivel =
  | 'nao-e-rich-text'
  | 'sem-trechos'
  | 'sem-destaque'
  | 'dois-estilos'
  | 'tamanho-por-trecho'
  | 'espacamento-por-trecho'
  | 'contorno-por-trecho'
  | 'sombra-diferente-por-trecho'
  | 'sombra-parcial'
  | 'sombra-da-camada-diferente'
  | 'sombra-so-na-camada'

export type Classificacao =
  | {
      veredito: 'conversivel'
      destaques: Array<{ inicio: number; fim: number }>
      destaque: EstiloDeDestaqueGravado
      /** A sombra por trecho, igual em todo o conteúdo, no formato de `effects.shadow`; null sem sombra. */
      sombra: NonNullable<NonNullable<Layer['effects']>['shadow']> | null
      /** O `content` com [colchetes], como a caixa do editor e o MCP mostram. */
      conteudoMarcado: string
    }
  | { veredito: 'nao-conversivel'; motivo: MotivoNaoConversivel; detalhe?: string }

function diferencaDaBase(s: RichTextStyle, fill: string, fontFamily: string): EstiloDeDestaqueGravado {
  const d: EstiloDeDestaqueGravado = {}
  if (s.fill && s.fill.toLowerCase() !== fill) d.fill = s.fill
  if (s.fontFamily && s.fontFamily !== fontFamily) d.fontFamily = s.fontFamily
  if (s.fontStyle && s.fontStyle !== 'normal') d.fontStyle = s.fontStyle
  if (s.textDecoration && s.textDecoration !== 'none') d.textDecoration = s.textDecoration
  return d
}

/** JSON com as chaves em ordem — dois objetos iguais comparam iguais. */
function chaveEstavel(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(chaveEstavel).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${chaveEstavel(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v) ?? 'undefined'
}

/** `rgba(r,g,b,a)` / `#rrggbb` → cor hex + opacidade (o formato de `effects.shadow`). */
function corDaSombra(cor: string): { color: string; opacity: number } {
  const m = cor.trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i)
  if (!m) return { color: cor, opacity: 1 }
  const hex = [m[1], m[2], m[3]].map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0')).join('')
  return { color: `#${hex}`, opacity: m[4] === undefined ? 1 : Number(m[4]) }
}

/** Os trechos marcados (offsets no content), sem quebra de linha e sem espaço nas bordas — a mesma forma que o colchete tem. */
function trechosMarcados(conteudo: string, marcado: boolean[]): Array<{ inicio: number; fim: number }> {
  const saida: Array<{ inicio: number; fim: number }> = []
  let i = 0
  while (i < conteudo.length) {
    if (!marcado[i] || conteudo[i] === '\n') {
      i++
      continue
    }
    let j = i
    while (j < conteudo.length && marcado[j] && conteudo[j] !== '\n') j++
    let inicio = i
    let fim = j
    while (inicio < fim && /\s/.test(conteudo[inicio])) inicio++
    while (fim > inicio && /\s/.test(conteudo[fim - 1])) fim--
    if (fim > inicio) saida.push({ inicio, fim })
    i = j
  }
  return saida
}

export function classificarRichText(camada: Layer): Classificacao {
  if (camada.type !== 'rich-text') return { veredito: 'nao-conversivel', motivo: 'nao-e-rich-text' }
  const estilos = (Array.isArray(camada.richTextStyles) ? camada.richTextStyles : []).filter(
    (s): s is RichTextStyle => !!s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start,
  )
  if (estilos.length === 0) return { veredito: 'nao-conversivel', motivo: 'sem-trechos' }

  const conteudo = typeof camada.content === 'string' ? camada.content : ''
  const fill = String(camada.style?.color ?? '').toLowerCase()
  const fontFamily = String(camada.style?.fontFamily ?? '')
  const tamanhoBase = camada.style?.fontSize
  const espacamentoBase = camada.style?.letterSpacing ?? 0

  // O que o `destaque` não representa, trecho a trecho.
  for (const s of estilos) {
    if (s.fontSize !== undefined && s.fontSize !== tamanhoBase) return { veredito: 'nao-conversivel', motivo: 'tamanho-por-trecho', detalhe: `${s.fontSize}` }
    if (s.letterSpacing !== undefined && s.letterSpacing !== espacamentoBase) return { veredito: 'nao-conversivel', motivo: 'espacamento-por-trecho', detalhe: `${s.letterSpacing}` }
    if (s.stroke) return { veredito: 'nao-conversivel', motivo: 'contorno-por-trecho' }
  }

  // Um estilo de destaque só.
  const marcado = new Array<boolean>(conteudo.length).fill(false)
  const distintos = new Map<string, EstiloDeDestaqueGravado>()
  for (const s of estilos) {
    const d = diferencaDaBase(s, fill, fontFamily)
    if (Object.keys(d).length === 0) continue
    distintos.set(chaveEstavel(d), d)
    for (let i = Math.max(0, s.start); i < Math.min(conteudo.length, s.end); i++) marcado[i] = true
  }
  if (distintos.size === 0) return { veredito: 'nao-conversivel', motivo: 'sem-destaque' }
  if (distintos.size > 1) return { veredito: 'nao-conversivel', motivo: 'dois-estilos', detalhe: [...distintos.values()].map((d) => JSON.stringify(d)).join(' | ') }

  // A sombra: igual em todo trecho E cobrindo o conteúdo inteiro (só então ela é a sombra da camada).
  let sombra: Extract<Classificacao, { veredito: 'conversivel' }>['sombra'] = null
  const comSombra = estilos.filter((s) => s.shadow)
  const daCamada = camada.effects?.shadow?.enabled ? camada.effects.shadow : null
  // O rich-text IGNORA `effects.shadow` da camada (só desenha a sombra por trecho); o `text` a desenha. Sombra só
  // na camada, sem trecho, apareceria depois da conversão — não converte.
  if (daCamada && comSombra.length === 0) return { veredito: 'nao-conversivel', motivo: 'sombra-so-na-camada' }
  if (comSombra.length > 0) {
    if (new Set(comSombra.map((s) => chaveEstavel(s.shadow))).size > 1) return { veredito: 'nao-conversivel', motivo: 'sombra-diferente-por-trecho' }
    const coberto = new Array<boolean>(conteudo.length).fill(false)
    for (const s of comSombra) for (let i = Math.max(0, s.start); i < Math.min(conteudo.length, s.end); i++) coberto[i] = true
    if (coberto.some((c) => !c)) return { veredito: 'nao-conversivel', motivo: 'sombra-parcial' }
    const sh = comSombra[0].shadow!
    const { color, opacity } = corDaSombra(sh.color)
    const doTrecho = { enabled: true, shadowColor: color, shadowBlur: sh.blur, shadowOffsetX: sh.offset?.x ?? 0, shadowOffsetY: sh.offset?.y ?? 0, shadowOpacity: opacity }
    if (daCamada) {
      // O compositor gravava a MESMA sombra na camada e em cada trecho: igual, a camada já a tem — não se mexe em `effects`.
      const c = corDaSombra(daCamada.shadowColor ?? '')
      const igual =
        c.color.toLowerCase() === color.toLowerCase() &&
        (daCamada.shadowBlur ?? 0) === doTrecho.shadowBlur &&
        (daCamada.shadowOffsetX ?? 0) === doTrecho.shadowOffsetX &&
        (daCamada.shadowOffsetY ?? 0) === doTrecho.shadowOffsetY &&
        Math.abs((daCamada.shadowOpacity ?? 1) * c.opacity - opacity) < 0.01
      if (!igual) return { veredito: 'nao-conversivel', motivo: 'sombra-da-camada-diferente' }
    } else {
      sombra = doTrecho
    }
  }

  const destaques = trechosMarcados(conteudo, marcado)
  if (destaques.length === 0) return { veredito: 'nao-conversivel', motivo: 'sem-destaque' }
  return {
    veredito: 'conversivel',
    destaques,
    destaque: [...distintos.values()][0],
    sombra,
    conteudoMarcado: (linhasComColchetes(camada) ?? [conteudo]).join('\n'),
  }
}

/** A camada convertida (uma cópia): `text` + `destaques` + `destaque`, sem `richTextStyles`; a sombra por trecho vira `effects.shadow`. */
export function converterCamada(camada: Layer, c: Extract<Classificacao, { veredito: 'conversivel' }>): Layer {
  const { richTextStyles: _descartado, ...resto } = camada
  void _descartado
  // O rich-text desenha cada linha no TOPO do line-box (editor e servidor); a camada text, como o Konva.Text,
  // no CENTRO — meia-entrelinha abaixo. Sem compensar, todo convertido descia (lineHeight − 1) · fontSize / 2
  // (piloto no Ciro Trigo, 06/11/2026: 8 px). A entrelinha é a que a camada text vai usar (textboxConfig.autoWrap primeiro).
  const fontSize = camada.style?.fontSize ?? 16
  const lineHeight = camada.textboxConfig?.autoWrap?.lineHeight ?? camada.style?.lineHeight ?? 1.2
  const meiaEntrelinha = ((lineHeight - 1) * fontSize) / 2
  return {
    ...resto,
    ...(camada.position ? { position: { ...camada.position, y: camada.position.y - meiaEntrelinha } } : {}),
    type: 'text',
    destaques: c.destaques,
    destaque: c.destaque,
    ...(c.sombra ? { effects: { ...(camada.effects ?? {}), shadow: c.sombra } } : {}),
  } as Layer
}

/** As camadas de uma página com as conversíveis trocadas; `convertidas` traz o id das que mudaram. */
export function converterCamadasDaPagina(camadas: Layer[]): { camadas: Layer[]; convertidas: string[] } {
  const convertidas: string[] = []
  const novas = camadas.map((l) => {
    const c = classificarRichText(l)
    if (c.veredito !== 'conversivel') return l
    convertidas.push(l.id)
    return converterCamada(l, c)
  })
  return { camadas: novas, convertidas }
}
