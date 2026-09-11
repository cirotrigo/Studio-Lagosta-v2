/**
 * Converte layers do canvas de volta para o formato de combinação.
 *
 * É o caminho inverso da aplicação: o usuário ajusta posição, tamanho, cor e
 * efeitos com as ferramentas normais do editor e salva o resultado como
 * combinação reaproveitável.
 *
 * Desde 11/09/2026 a captura também guarda o que o compositor precisa para
 * usar a combinação como bloco de uma peça: o PAPEL de cada texto, os
 * elementos gráficos presos a ele (filete, selo, ornamento, a logo — além do
 * ícone), o estilo da palavra entre [colchetes] quando o texto é rich text, e a
 * altura do canvas em que foi salva.
 */

import {
  COMBO_BASE_CANVAS_WIDTH,
  caixaVisivel,
  type EixoDoOrnamento,
  type FontComboDestaque,
  type FontComboElement,
  type FontComboOrnamento,
  type FontComboPair,
  type LadoDoOrnamento,
  type PapelDaCombinacao,
} from './font-combinations'
import { destaqueDaCamada, linhasComColchetes } from '@/lib/compositor/destaques'
import { ehPapel, papelDoNome } from '@/lib/compositor/papel-do-nome'
import type { Layer } from '@/types/template'

/** Texto que entra numa combinação: texto simples ou rich text, com conteúdo. */
export function ehTextoDeCombinacao(layer: Layer): boolean {
  return (layer.type === 'text' || layer.type === 'rich-text') && (layer.content ?? '').trim().length > 0
}

/**
 * Camada que pode ser elemento de uma combinação: imagem (ícone, selo), a logo
 * ou uma forma do editor (o filete). Foto de fundo, gradiente e vídeo não.
 */
export function ehElementoDeCombinacao(layer: Layer): boolean {
  if (layer.visible === false) return false
  if (layer.type === 'shape') return true
  const comArquivo = typeof layer.fileUrl === 'string' && layer.fileUrl.length > 0
  return comArquivo && (layer.type === 'image' || layer.type === 'logo' || layer.type === 'icon' || layer.type === 'element')
}

/**
 * O papel do texto para o compositor, na ordem de confiança: o que o painel
 * gravou (`metadata.compositor.papel`), o nome da camada ("headline", "Título")
 * e o rótulo do elemento — inclusive o "Combinação - Título" que a aplicação dá
 * de nome à camada.
 */
export function papelDoTexto(layer: Pick<Layer, 'name' | 'metadata'>): PapelDaCombinacao | null {
  const meta = layer.metadata as { compositor?: { papel?: unknown }; elementLabel?: unknown } | undefined
  if (ehPapel(meta?.compositor?.papel)) return meta!.compositor!.papel as PapelDaCombinacao
  const candidatos = [layer.name, typeof meta?.elementLabel === 'string' ? meta.elementLabel : null]
  for (const candidato of candidatos) {
    if (!candidato) continue
    const direto = papelDoNome(candidato)
    if (direto) return direto
    const sufixo = candidato.split(' - ').pop()
    if (sufixo && sufixo !== candidato) {
      const doSufixo = papelDoNome(sufixo)
      if (doSufixo) return doSufixo
    }
  }
  return null
}

/**
 * Descobre o papel do elemento pela família da fonte.
 *
 * Casar com a fonte de título da marca é mais confiável que ordenar por
 * tamanho: um pré-título pequeno pode usar a fonte de título de propósito.
 * Sem correspondência, o maior texto vira título e o resto, corpo.
 */
function resolverPapeis(layers: Layer[], pair: FontComboPair): Array<'title' | 'subtitle' | 'body'> {
  const normalizar = (v?: string | null) => (v ?? '').trim().toLowerCase()
  const familiaTitulo = normalizar(pair.title)
  const familiaCorpo = normalizar(pair.body)
  // Marcas de três fontes: reconhecer o subtítulo evita que ele seja gravado
  // como corpo e perca a família própria quando a marca trocar de fonte
  const familiaSubtitulo = pair.subtitle ? normalizar(pair.subtitle) : null

  const casaAlgum = layers.some((l) => normalizar(l.style?.fontFamily) === familiaTitulo)

  if (casaAlgum && familiaTitulo !== familiaCorpo) {
    return layers.map((l) => {
      const familia = normalizar(l.style?.fontFamily)
      if (familia === familiaTitulo) return 'title'
      if (familiaSubtitulo && familia === familiaSubtitulo && familiaSubtitulo !== familiaCorpo) return 'subtitle'
      return 'body'
    })
  }

  const maior = layers.reduce(
    (max, l, i) => ((l.style?.fontSize ?? 0) > (layers[max].style?.fontSize ?? 0) ? i : max),
    0,
  )
  return layers.map((_, i) => (i === maior ? 'title' : 'body'))
}

/** Mantém apenas os efeitos que fazem sentido numa combinação (legibilidade) */
function extrairEfeitos(layer: Layer): FontComboElement['effects'] {
  const e = layer.effects
  if (!e) return undefined
  const out: NonNullable<FontComboElement['effects']> = {}
  if (e.stroke?.enabled) out.stroke = { ...e.stroke }
  if (e.shadow?.enabled) out.shadow = { ...e.shadow }
  if (e.background?.enabled) out.background = { ...e.background }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Liga cada ícone (camada de imagem) ao texto que ele acompanha.
 *
 * Primeiro pela marca deixada na aplicação (`metadata.iconeDe`); sem ela, pela
 * geometria: o ícone fica à esquerda do texto, com o centro na altura da caixa
 * dele, e perto (até três larguras do ícone). Cada texto leva um ícone só.
 * Imagem que a aplicação marcou como elemento de outro lado (`ornamentoDe`)
 * nunca vira ícone.
 */
export function associarIcones(textos: Layer[], imagens: Layer[]): Map<string, Layer> {
  const porTexto = new Map<string, Layer>()
  const idDoElemento = (l: Layer) => l.metadata?.elementId as string | undefined

  for (const imagem of imagens) {
    const iconeDe = imagem.metadata?.iconeDe as string | undefined
    const dono = iconeDe ? textos.find((t) => idDoElemento(t) === iconeDe) : undefined
    if (dono && !porTexto.has(dono.id)) porTexto.set(dono.id, imagem)
  }

  const livres = imagens.filter((img) => ![...porTexto.values()].includes(img) && !img.metadata?.ornamentoDe)
  for (const imagem of livres) {
    const ix = imagem.position?.x ?? 0
    const iw = imagem.size?.width ?? 0
    const centroY = (imagem.position?.y ?? 0) + (imagem.size?.height ?? 0) / 2
    let melhor: { texto: Layer; distancia: number } | null = null
    for (const texto of textos) {
      if (porTexto.has(texto.id)) continue
      const tx = texto.position?.x ?? 0
      const ty = texto.position?.y ?? 0
      const th = texto.size?.height ?? 0
      const distancia = tx - (ix + iw)
      const naAltura = centroY >= ty && centroY <= ty + th
      if (!naAltura || distancia < -4 || distancia > iw * 3) continue
      if (!melhor || distancia < melhor.distancia) melhor = { texto, distancia }
    }
    if (melhor) porTexto.set(melhor.texto.id, imagem)
  }

  return porTexto
}

interface Caixa {
  x: number
  y: number
  w: number
  h: number
}

const caixaDe = (l: Layer): Caixa => {
  const c = caixaVisivel(l)
  return { x: c.x, y: c.y, w: c.width, h: c.height }
}

/** Folga (px) para considerar a imagem fora da caixa do texto na horizontal. */
const FOLGA_LATERAL = 8

/**
 * O elemento está na mesma faixa de altura do texto: o centro dele cai dentro
 * da caixa, ou metade da altura do menor dos dois se sobrepõe — o divisor
 * vertical, mais alto que uma linha de serviço, fica ao lado dela, não embaixo.
 */
function naMesmaFaixa(i: Caixa, t: Caixa): boolean {
  const centroY = i.y + i.h / 2
  if (centroY >= t.y && centroY <= t.y + t.h) return true
  const sobreposicao = Math.min(i.y + i.h, t.y + t.h) - Math.max(i.y, t.y)
  return sobreposicao > 0 && sobreposicao >= 0.5 * Math.min(i.h, t.h)
}

function eixoDoOrnamento(i: Caixa, t: Caixa, alinhamento: unknown): EixoDoOrnamento {
  const distancias: Array<[EixoDoOrnamento, number]> = [
    ['inicio', Math.abs(i.x - t.x)],
    ['centro', Math.abs(i.x + i.w / 2 - (t.x + t.w / 2))],
    ['fim', Math.abs(i.x + i.w - (t.x + t.w))],
  ]
  const menor = Math.min(...distancias.map(([, d]) => d))
  const empatados = distancias.filter(([, d]) => d - menor <= 6).map(([e]) => e)
  // No empate, vence a borda que o próprio texto usa
  const doTexto: EixoDoOrnamento = alinhamento === 'right' ? 'fim' : alinhamento === 'center' ? 'centro' : 'inicio'
  return empatados.includes(doTexto) ? doTexto : empatados[0]
}

/** De que lado do texto o elemento está, e a que borda ele se alinha, pela geometria (caixa visível). */
export function ladoDoOrnamento(elemento: Layer, texto: Layer): { lado: LadoDoOrnamento; eixo?: EixoDoOrnamento } {
  const i = caixaDe(elemento)
  const t = caixaDe(texto)
  const centroY = i.y + i.h / 2
  if (naMesmaFaixa(i, t)) {
    if (i.x + i.w <= t.x + FOLGA_LATERAL) return { lado: 'antes' }
    if (i.x >= t.x + t.w - FOLGA_LATERAL) return { lado: 'depois' }
    return { lado: i.x + i.w / 2 < t.x + t.w / 2 ? 'antes' : 'depois' }
  }
  return { lado: centroY < t.y ? 'acima' : 'abaixo', eixo: eixoDoOrnamento(i, t, texto.style?.textAlign) }
}

export interface OrnamentoAssociado {
  imagem: Layer
  lado: LadoDoOrnamento
  eixo?: EixoDoOrnamento
}

/**
 * Liga cada elemento que não é ícone ao texto que ele acompanha.
 *
 * Primeiro pela marca da aplicação (`metadata.ornamentoDe`); sem ela, pela
 * geometria: na mesma faixa de altura, o texto mais perto na horizontal; fora
 * dela, o texto mais perto na vertical. Entre dois textos a distâncias
 * parecidas fica o de BAIXO — o filete entre a manchete e o apoio some junto
 * com o apoio quando a peça não tem apoio —, mas o sublinhado colado à manchete
 * continua dela.
 */
export function associarOrnamentos(textos: Layer[], elementos: Layer[]): Map<string, OrnamentoAssociado[]> {
  const porTexto = new Map<string, OrnamentoAssociado[]>()
  const juntar = (texto: Layer, imagem: Layer) => {
    const lista = porTexto.get(texto.id) ?? []
    lista.push({ imagem, ...ladoDoOrnamento(imagem, texto) })
    porTexto.set(texto.id, lista)
  }

  for (const imagem of elementos) {
    const marca = imagem.metadata?.ornamentoDe
    const dono = typeof marca === 'string' ? textos.find((t) => t.metadata?.elementId === marca) : undefined
    if (dono) {
      juntar(dono, imagem)
      continue
    }

    const i = caixaDe(imagem)
    const centroY = i.y + i.h / 2

    let naFaixa: { texto: Layer; distancia: number } | null = null
    for (const texto of textos) {
      const t = caixaDe(texto)
      if (!naMesmaFaixa(i, t)) continue
      const distancia = i.x + i.w <= t.x ? t.x - (i.x + i.w) : i.x >= t.x + t.w ? i.x - (t.x + t.w) : 0
      if (!naFaixa || distancia < naFaixa.distancia) naFaixa = { texto, distancia }
    }
    if (naFaixa) {
      juntar(naFaixa.texto, imagem)
      continue
    }

    let acimaDe: { texto: Layer; distancia: number } | null = null
    let abaixoDe: { texto: Layer; distancia: number } | null = null
    for (const texto of textos) {
      const t = caixaDe(texto)
      if (centroY < t.y) {
        const distancia = Math.max(0, t.y - (i.y + i.h))
        if (!acimaDe || distancia < acimaDe.distancia) acimaDe = { texto, distancia }
      } else {
        const distancia = Math.max(0, i.y - (t.y + t.h))
        if (!abaixoDe || distancia < abaixoDe.distancia) abaixoDe = { texto, distancia }
      }
    }
    const escolhido =
      acimaDe && abaixoDe
        ? acimaDe.distancia <= abaixoDe.distancia * 1.5 + 12
          ? acimaDe
          : abaixoDe
        : (acimaDe ?? abaixoDe)
    if (escolhido) juntar(escolhido.texto, imagem)
  }

  return porTexto
}

/** A camada sem o que muda ao aplicar (id, posição, tamanho, vínculos) — o molde de uma forma. */
export function moldeDaCamada(layer: Layer): Record<string, unknown> {
  const molde = { ...(layer as unknown as Record<string, unknown>) }
  for (const chave of ['id', 'name', 'position', 'size', 'metadata', 'order', 'locked', 'visible']) delete molde[chave]
  return molde
}

/**
 * O que um elemento é, fora a caixa: a imagem, a logo ou o molde da forma — e,
 * para camada girada ou forma, o tamanho sem giro e onde ela começa em relação
 * à caixa visível, numa escala da base 1080.
 */
export function dadosDoElemento(elemento: Layer, escala: number): Pick<FontComboOrnamento, 'url' | 'camada' | 'logo' | 'tamanhoDaCamada' | 'ajuste'> {
  const arredondar = (v: number) => Math.round((v / escala) * 10) / 10
  const girada = Boolean(elemento.rotation) || elemento.type === 'shape'
  const caixa = caixaVisivel(elemento)
  const geometria = girada
    ? {
        tamanhoDaCamada: { width: arredondar(elemento.size?.width ?? 0), height: arredondar(elemento.size?.height ?? 0) },
        ajuste: { x: arredondar((elemento.position?.x ?? 0) - caixa.x), y: arredondar((elemento.position?.y ?? 0) - caixa.y) },
      }
    : {}
  if (elemento.type === 'shape') return { camada: moldeDaCamada(elemento), ...geometria }
  if (elemento.type === 'logo') return { url: elemento.fileUrl as string, logo: true, ...geometria }
  return { url: elemento.fileUrl as string, ...geometria }
}

export interface CapturarOpcoes {
  layers: Layer[]
  canvasWidth: number
  canvasHeight: number
  pair: FontComboPair
}

/**
 * Gera os elementos de uma combinação a partir das layers selecionadas.
 * Posições e larguras viram frações do canvas; tamanhos de fonte voltam para a
 * base de 1080 de largura.
 */
export function capturarCombinacao({
  layers,
  canvasWidth,
  canvasHeight,
  pair,
}: CapturarOpcoes): FontComboElement[] {
  const textos = layers
    .filter(ehTextoDeCombinacao)
    // De cima para baixo, para a combinação nascer na ordem de leitura
    .sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0))

  if (textos.length === 0) return []

  const escala = canvasWidth / COMBO_BASE_CANVAS_WIDTH
  const papeis = resolverPapeis(textos, pair)
  // Foto de fundo selecionada junto não é elemento
  const elementos = layers.filter(
    (l) => ehElementoDeCombinacao(l) && !((l.size?.width ?? 0) >= canvasWidth * 0.9 && (l.size?.height ?? 0) >= canvasHeight * 0.9),
  )
  const imagens = elementos.filter((l) => l.type === 'image' && !l.rotation)
  const icones = associarIcones(textos, imagens)
  const usadas = new Set([...icones.values()].map((l) => l.id))
  const ornamentos = associarOrnamentos(
    textos,
    elementos.filter((l) => !usadas.has(l.id)),
  )

  const normalizarFamilia = (v?: string | null) => (v ?? '').trim().toLowerCase()

  return textos.map((layer, index) => {
    const style = layer.style ?? {}
    const efeitos = extrairEfeitos(layer)
    const papel = papeis[index]
    const familiaDoPapel = papel === 'title' ? pair.title : pair.body
    const familiaUsada = style.fontFamily
    // Só grava a família quando o usuário escolheu outra que não a da marca
    const familiaOverride =
      familiaUsada && normalizarFamilia(familiaUsada) !== normalizarFamilia(familiaDoPapel)
        ? familiaUsada
        : undefined
    // Rich text volta com os [colchetes] nos trechos destacados: aplicar de novo
    // refaz o destaque no mesmo lugar
    const marcadas = linhasComColchetes(layer)
    const papelDoCompositor = papelDoTexto(layer)
    const destaque = destaqueDaCamada(layer)
    const presos = ornamentos.get(layer.id) ?? []

    return {
      id: (layer.metadata?.elementId as string) ?? `el-${index + 1}`,
      label: (layer.metadata?.elementLabel as string) ?? `Texto ${index + 1}`,
      role: papel,
      ...(familiaOverride ? { fontFamily: familiaOverride } : {}),
      text: marcadas ? marcadas.join('\n') : (layer.content ?? ''),
      fontSize: Math.round((style.fontSize ?? 36) / escala),
      fontWeight: String(style.fontWeight ?? '400'),
      ...(style.fontStyle === 'italic' ? { fontStyle: 'italic' as const } : {}),
      ...(style.textTransform === 'uppercase' ? { textTransform: 'uppercase' as const } : {}),
      ...(style.letterSpacing ? { letterSpacing: Math.round(style.letterSpacing / escala) } : {}),
      lineHeight: style.lineHeight ?? 1.2,
      textAlign: (style.textAlign ?? 'center') as 'left' | 'center' | 'right',
      color: style.color ?? '#FFFFFF',
      ...(efeitos ? { effects: efeitos } : {}),
      x: Math.round(((layer.position?.x ?? 0) / canvasWidth) * 1000) / 1000,
      y: Math.round(((layer.position?.y ?? 0) / canvasHeight) * 1000) / 1000,
      width: Math.round(((layer.size?.width ?? canvasWidth * 0.8) / canvasWidth) * 1000) / 1000,
      // Altura vem do que o usuário ajustou na caixa; sem ela, a aplicação
      // voltava a estimar por número de linhas e desfazia o redimensionamento
      ...(layer.size?.height
        ? { height: Math.round((layer.size.height / canvasHeight) * 10000) / 10000 }
        : {}),
      ...(layer.rotation ? { rotation: Math.round(layer.rotation) } : {}),
      ...(icones.has(layer.id) ? { icon: medirIcone(icones.get(layer.id)!, layer, escala) } : {}),
      ...(papelDoCompositor ? { papel: papelDoCompositor } : {}),
      ...(presos.length > 0 ? { ornamentos: presos.map((o) => medirOrnamento(o, layer, escala)) } : {}),
      ...(destaque ? { destaque: soDestaque(destaque) } : {}),
      alturaDeBase: Math.round(canvasHeight),
    }
  })
}

function soDestaque(d: FontComboDestaque): FontComboDestaque {
  return {
    ...(d.fill ? { fill: d.fill } : {}),
    ...(d.fontFamily ? { fontFamily: d.fontFamily } : {}),
    ...(d.fontStyle ? { fontStyle: d.fontStyle } : {}),
    ...(d.textDecoration ? { textDecoration: d.textDecoration } : {}),
  }
}

const arredondar = (v: number) => Math.round(v * 10) / 10

/** O ícone em px na base de 1080, relativo ao canto superior esquerdo do texto */
function medirIcone(imagem: Layer, texto: Layer, escala: number): NonNullable<FontComboElement['icon']> {
  return {
    url: imagem.fileUrl as string,
    width: arredondar((imagem.size?.width ?? 0) / escala),
    height: arredondar((imagem.size?.height ?? 0) / escala),
    offsetX: arredondar(((imagem.position?.x ?? 0) - (texto.position?.x ?? 0)) / escala),
    offsetY: arredondar(((imagem.position?.y ?? 0) - (texto.position?.y ?? 0)) / escala),
  }
}

/** O elemento em px na base de 1080, preso à borda do texto que o `lado` e o `eixo` dizem (ver `caixaDoOrnamento`) */
function medirOrnamento(o: OrnamentoAssociado, texto: Layer, escala: number): FontComboOrnamento {
  const i = caixaDe(o.imagem)
  const t = caixaDe(texto)
  const base = {
    ...dadosDoElemento(o.imagem, escala),
    width: arredondar(i.w / escala),
    height: arredondar(i.h / escala),
    lado: o.lado,
  }
  if (o.lado === 'antes') return { ...base, offsetX: arredondar((i.x - t.x) / escala), offsetY: arredondar((i.y - t.y) / escala) }
  if (o.lado === 'depois') {
    return { ...base, offsetX: arredondar((i.x - (t.x + t.w)) / escala), offsetY: arredondar((i.y - t.y) / escala) }
  }
  const eixo = o.eixo ?? 'inicio'
  const offsetX = eixo === 'inicio' ? i.x - t.x : eixo === 'centro' ? i.x + i.w / 2 - (t.x + t.w / 2) : i.x + i.w - (t.x + t.w)
  const offsetY = o.lado === 'acima' ? i.y - t.y : i.y - (t.y + t.h)
  return { ...base, eixo, offsetX: arredondar(offsetX / escala), offsetY: arredondar(offsetY / escala) }
}
