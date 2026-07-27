/**
 * Converte layers de texto do canvas de volta para o formato de combinação.
 *
 * É o caminho inverso da aplicação: o usuário ajusta posição, tamanho, cor e
 * efeitos com as ferramentas normais do editor e salva o resultado como
 * combinação reaproveitável.
 */

import { COMBO_BASE_CANVAS_WIDTH, type FontComboElement, type FontComboPair } from './font-combinations'
import type { Layer } from '@/types/template'

/**
 * Descobre o papel do elemento pela família da fonte.
 *
 * Casar com a fonte de título da marca é mais confiável que ordenar por
 * tamanho: um pré-título pequeno pode usar a fonte de título de propósito.
 * Sem correspondência, o maior texto vira título e o resto, corpo.
 */
function resolverPapeis(layers: Layer[], pair: FontComboPair): Array<'title' | 'body'> {
  const normalizar = (v?: string | null) => (v ?? '').trim().toLowerCase()
  const familiaTitulo = normalizar(pair.title)
  const familiaCorpo = normalizar(pair.body)

  const casaAlgum = layers.some((l) => normalizar(l.style?.fontFamily) === familiaTitulo)

  if (casaAlgum && familiaTitulo !== familiaCorpo) {
    return layers.map((l) => (normalizar(l.style?.fontFamily) === familiaTitulo ? 'title' : 'body'))
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

export interface CapturarOpcoes {
  layers: Layer[]
  canvasWidth: number
  canvasHeight: number
  pair: FontComboPair
}

/**
 * Gera os elementos de uma combinação a partir das layers de texto selecionadas.
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
    .filter((l) => l.type === 'text' && (l.content ?? '').trim().length > 0)
    // De cima para baixo, para a combinação nascer na ordem de leitura
    .sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0))

  if (textos.length === 0) return []

  const escala = canvasWidth / COMBO_BASE_CANVAS_WIDTH
  const papeis = resolverPapeis(textos, pair)

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

    return {
      id: (layer.metadata?.elementId as string) ?? `el-${index + 1}`,
      label: (layer.metadata?.elementLabel as string) ?? `Texto ${index + 1}`,
      role: papel,
      ...(familiaOverride ? { fontFamily: familiaOverride } : {}),
      text: layer.content ?? '',
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
    }
  })
}
