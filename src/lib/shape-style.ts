import type { Layer, LayerStyle } from '@/types/template'

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function normalizeOpacityValue(value: unknown): number | undefined {
  const numeric = typeof value === 'string'
    ? (value.trim().endsWith('%') ? Number.parseFloat(value) / 100 : Number(value))
    : value
  if (typeof numeric !== 'number' || Number.isNaN(numeric)) return undefined
  if (numeric > 1 && numeric <= 100) return clamp01(numeric / 100)
  return clamp01(numeric)
}

export function parseColorOpacity(color: string | undefined, fallback = 1): number {
  if (!color) return fallback
  const normalized = color.trim()

  if (/^#[0-9a-f]{8}$/i.test(normalized)) {
    return parseInt(normalized.slice(7, 9), 16) / 255
  }
  if (/^#[0-9a-f]{4}$/i.test(normalized)) {
    return parseInt(`${normalized[4]}${normalized[4]}`, 16) / 255
  }

  const functional = normalized.match(/^(rgba?|hsla?)\(([^)]+)\)$/i)
  if (!functional) return fallback

  const content = functional[2].trim()
  if (content.includes('/')) {
    const alphaPart = content.split('/').at(-1)?.trim()
    if (!alphaPart) return fallback
    return alphaPart.endsWith('%')
      ? Number.parseFloat(alphaPart) / 100
      : Number(alphaPart)
  }

  const parts = content.split(',').map((part) => part.trim())
  if (parts.length >= 4) {
    const alphaPart = parts[3]
    return alphaPart.endsWith('%')
      ? Number.parseFloat(alphaPart) / 100
      : Number(alphaPart)
  }

  return fallback
}

export function stripColorAlpha(color: string | undefined): string | undefined {
  if (!color) return color
  const normalized = color.trim()

  if (/^#[0-9a-f]{8}$/i.test(normalized)) {
    return `#${normalized.slice(1, 7)}`
  }
  if (/^#[0-9a-f]{4}$/i.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
  }

  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i)
  if (rgbMatch) {
    const content = rgbMatch[1].trim()
    if (content.includes('/')) {
      const [base] = content.split('/').map((part) => part.trim())
      return `rgb(${base})`
    }
    const parts = content.split(',').map((part) => part.trim()).slice(0, 3)
    return `rgb(${parts.join(', ')})`
  }

  const hslMatch = normalized.match(/^hsla?\(([^)]+)\)$/i)
  if (hslMatch) {
    const content = hslMatch[1].trim()
    if (content.includes('/')) {
      const [base] = content.split('/').map((part) => part.trim())
      return `hsl(${base})`
    }
    const parts = content.split(',').map((part) => part.trim()).slice(0, 3)
    return `hsl(${parts.join(', ')})`
  }

  return normalized
}

export function applyOpacityToEditableColor(
  color: string | undefined,
  opacity: number,
  fallback: string,
): string {
  const baseColor = (stripColorAlpha(color) ?? fallback).trim()
  const normalizedOpacity = clamp01(opacity)

  if (/^#[0-9a-f]{3}$/i.test(baseColor)) {
    const expanded = `#${baseColor[1]}${baseColor[1]}${baseColor[2]}${baseColor[2]}${baseColor[3]}${baseColor[3]}`
    return applyOpacityToEditableColor(expanded, normalizedOpacity, fallback)
  }

  if (/^#[0-9a-f]{6}$/i.test(baseColor)) {
    const hex = baseColor.slice(1, 7)
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${normalizedOpacity})`
  }

  const rgbMatch = baseColor.match(/^rgba?\(([^)]+)\)$/i)
  if (rgbMatch) {
    const content = rgbMatch[1].trim()
    if (content.includes('/')) {
      const [base] = content.split('/').map((part) => part.trim())
      return `rgb(${base} / ${normalizedOpacity})`
    }
    const parts = content.split(',').map((part) => part.trim()).slice(0, 3)
    return `rgba(${parts.join(', ')}, ${normalizedOpacity})`
  }

  const hslMatch = baseColor.match(/^hsla?\(([^)]+)\)$/i)
  if (hslMatch) {
    const content = hslMatch[1].trim()
    if (content.includes('/')) {
      const [base] = content.split('/').map((part) => part.trim())
      return `hsl(${base} / ${normalizedOpacity})`
    }
    const parts = content.split(',').map((part) => part.trim()).slice(0, 3)
    return `hsla(${parts.join(', ')}, ${normalizedOpacity})`
  }

  return baseColor
}

/**
 * O que o campo de TEXTO da cor grava quando a pessoa confirma (Enter ou sair do campo): a cor com
 * a transparência atual, ou `null` se o texto não for uma cor completa. Nunca chamar por tecla:
 * `#111` é cor completa no meio de `#111827`, virava `rgba(17, 17, 17, 1)` e o resto da digitação
 * colava atrás (`rgba(17, 17, 17, 1)827` gravado no banco, smoke do CP-V1 em 21/10/2026).
 * Aceita os formatos que `applyOpacityToEditableColor` sabe tratar, com números de verdade: hex de
 * 3/4/6/8 dígitos, `rgb()`/`rgba()`/`hsl()`/`hsla()` e nome CSS (`red`, `transparent`), que segue
 * gravado como digitado, sem a transparência do slider. A sintaxe moderna com espaços (`rgb(1 2 3)`,
 * `hsl(10 50% 50% / .5)`) vira a de vírgulas ANTES: o helper só entende espaços quando há `/`, e
 * `rgb(1 2 3)` saía `rgba(1 2 3, 1)`. Entrada E saída têm de passar em `ehCorCss` — no navegador,
 * `CSS.supports('color', …)`, que recusa `banana`; sem ele, nada grava.
 */
export function corDigitadaParaGravar(
  texto: string,
  opacity: number,
  fallback: string,
  ehCorCss: (cor: string) => boolean,
): string | null {
  let cor = texto.trim()
  const n = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)`
  const c = String.raw`${n}%?`
  const h = String.raw`${n}(?:deg|rad|grad|turn)?`
  const p = String.raw`${n}%`
  const virgulas = (a: string, b: string, d: string) => String.raw`\(\s*${a}\s*,\s*${b}\s*,\s*${d}\s*(?:,\s*${c}\s*)?\)`
  const espacos = (a: string, b: string, d: string) => String.raw`\(\s*${a}\s+${b}\s+${d}\s*(?:\/\s*${c}\s*)?\)`
  const formatos = [
    /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
    new RegExp(`^rgba?(?:${virgulas(c, c, c)}|${espacos(c, c, c)})$`, 'i'),
    new RegExp(`^hsla?(?:${virgulas(h, p, p)}|${espacos(h, p, p)})$`, 'i'),
    /^[a-z]+$/i,
  ]
  if (!formatos.some((formato) => formato.test(cor)) || !ehCorCss(cor)) return null
  const moderna = cor.match(/^(rgba?|hsla?)\(([^,()]+)\)$/i)
  if (moderna) {
    const [base, alfa] = moderna[2].split('/').map((parte) => parte.trim())
    cor = `${moderna[1]}(${[...base.split(/\s+/), ...(alfa ? [alfa] : [])].join(', ')})`
  }
  const saida = applyOpacityToEditableColor(cor, opacity, fallback)
  return ehCorCss(saida) ? saida : null
}

export function canonicalizeShapeStyleForPersistence(style: LayerStyle | undefined): LayerStyle | undefined {
  if (!style) return style

  const globalOpacity = normalizeOpacityValue(style.opacity) ?? 1
  const fillOpacity = normalizeOpacityValue(style.fillOpacity) ?? 1
  const borderStyle = style.border as unknown as Record<string, unknown> | undefined
  const strokeOpacity = normalizeOpacityValue(
    style.strokeOpacity ?? borderStyle?.opacity,
  ) ?? 1

  const nextStyle: LayerStyle = {
    ...style,
    opacity: 1,
    fillOpacity: 1,
    strokeOpacity: 1,
  }

  if (style.fill) {
    const combined = parseColorOpacity(style.fill, 1) * globalOpacity * fillOpacity
    nextStyle.fill = applyOpacityToEditableColor(style.fill, combined, '#2563eb')
  }

  if (style.strokeColor) {
    const combined = parseColorOpacity(style.strokeColor, 1) * globalOpacity * strokeOpacity
    nextStyle.strokeColor = applyOpacityToEditableColor(style.strokeColor, combined, '#1e3a8a')
  }

  if (style.border?.color) {
    const combined = parseColorOpacity(style.border.color, 1) * globalOpacity * strokeOpacity
    nextStyle.border = {
      ...style.border,
      color: applyOpacityToEditableColor(style.border.color, combined, '#1e3a8a'),
    }
  }

  return nextStyle
}

export function canonicalizeShapeLayerForPersistence(layer: Layer): Layer {
  if (layer.type !== 'shape') return layer
  return {
    ...layer,
    style: canonicalizeShapeStyleForPersistence(layer.style),
  }
}

export function canonicalizeLayersForPersistence(layers: unknown[]): unknown[] {
  return layers.map((layer) => {
    if (!layer || typeof layer !== 'object') return layer
    const typedLayer = layer as Layer
    return canonicalizeShapeLayerForPersistence(typedLayer)
  })
}
