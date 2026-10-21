/**
 * Opacidade de cor e de canal da prévia do /gerar-criativo. Eram cópias locais
 * dentro de `canvas-preview.tsx`; vieram para cá para ter teste. Continuam
 * locais à prévia (o editor e o servidor têm as deles).
 *
 * `applyOpacityToColor` ganhou o `trim()` que o editor já tinha: com espaço nas
 * pontas, `" #111111"` caía fora do `startsWith('#')` e a opacidade do canal era
 * ignorada só na prévia (CP-X1).
 */
import type { Layer } from '@/types/template'

function hexToRgba(hex: string, opacity: number): string {
  const normalized = hex.replace('#', '')

  if (normalized.length === 8) {
    const r = parseInt(normalized.slice(0, 2), 16)
    const g = parseInt(normalized.slice(2, 4), 16)
    const b = parseInt(normalized.slice(4, 6), 16)
    const a = parseInt(normalized.slice(6, 8), 16) / 255
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a * opacity))})`
  }

  if (normalized.length === 4) {
    const r = parseInt(`${normalized[0]}${normalized[0]}`, 16)
    const g = parseInt(`${normalized[1]}${normalized[1]}`, 16)
    const b = parseInt(`${normalized[2]}${normalized[2]}`, 16)
    const a = parseInt(`${normalized[3]}${normalized[3]}`, 16) / 255
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a * opacity))})`
  }

  const expanded = normalized.length === 3
    ? `${normalized[0]}${normalized[0]}${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}`
    : normalized

  const r = parseInt(expanded.slice(0, 2), 16)
  const g = parseInt(expanded.slice(2, 4), 16)
  const b = parseInt(expanded.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function parseAlphaValue(value: string): number {
  const normalized = value.trim()
  if (normalized.endsWith('%')) {
    return Number.parseFloat(normalized) / 100
  }
  return Number(normalized)
}

function withAdjustedFunctionalColor(
  family: 'rgb' | 'hsl',
  content: string,
  opacity: number,
): string {
  const normalized = content.trim()

  if (normalized.includes('/')) {
    const [base, alphaValue = '1'] = normalized.split('/').map((part) => part.trim())
    const alpha = Math.max(0, Math.min(1, parseAlphaValue(alphaValue) * opacity))
    return `${family}(${base} / ${alpha})`
  }

  const commaParts = normalized.split(',').map((part) => part.trim())
  if (commaParts.length >= 4) {
    const base = commaParts.slice(0, 3).join(', ')
    const alpha = Math.max(0, Math.min(1, parseAlphaValue(commaParts[3]) * opacity))
    return `${family}a(${base}, ${alpha})`
  }

  if (commaParts.length === 3) {
    return `${family}a(${commaParts.join(', ')}, ${opacity})`
  }

  return `${family}(${normalized} / ${opacity})`
}

export function applyOpacityToColor(color: string, opacity: number): string {
  const normalizedOpacity = Math.max(0, Math.min(1, opacity))
  const trimmed = color.trim()

  if (trimmed.startsWith('#') && [4, 5, 7, 9].includes(trimmed.length)) {
    return hexToRgba(trimmed, normalizedOpacity)
  }

  const rgbMatch = trimmed.match(/rgba?\(([^)]+)\)/i)
  if (rgbMatch) {
    return withAdjustedFunctionalColor('rgb', rgbMatch[1], normalizedOpacity)
  }

  const hslMatch = trimmed.match(/hsla?\(([^)]+)\)/i)
  if (hslMatch) {
    return withAdjustedFunctionalColor('hsl', hslMatch[1], normalizedOpacity)
  }

  return trimmed
}

function normalizeOpacityValue(value: unknown): number | undefined {
  const numeric = typeof value === 'string'
    ? (value.trim().endsWith('%') ? Number.parseFloat(value) / 100 : Number(value))
    : value
  if (typeof numeric !== 'number' || Number.isNaN(numeric)) return undefined
  if (numeric > 1 && numeric <= 100) return Math.max(0, Math.min(1, numeric / 100))
  return Math.max(0, Math.min(1, numeric))
}

export function getShapeChannelOpacity(
  layer: Layer,
  channel: 'fill' | 'stroke',
): number {
  const style = layer.style as Record<string, unknown> | undefined
  const border = (layer.style?.border ?? {}) as Record<string, unknown>
  const keys = channel === 'fill'
    ? ['fillOpacity', 'fillAlpha']
    : ['strokeOpacity', 'strokeAlpha', 'borderOpacity', 'borderAlpha']

  for (const key of keys) {
    const fromStyle = normalizeOpacityValue(style?.[key])
    if (fromStyle !== undefined) return fromStyle
    const fromBorder = normalizeOpacityValue(border[key])
    if (fromBorder !== undefined) return fromBorder
  }

  return 1
}
