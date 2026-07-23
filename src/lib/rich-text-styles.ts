import type { RichTextStyle } from '@/types/template'

/**
 * Normalização de richTextStyles.
 *
 * Estilos aplicados em momentos diferentes podem se sobrepor (inclusive dados
 * legados salvos com limites no meio de palavras). Renderizadores que assumem
 * intervalos ordenados e sem sobreposição acabam pintando letras com o estilo
 * errado. `flattenRichTextStyles` resolve isso: divide o texto nos limites de
 * todos os estilos e, em cada intervalo, o ÚLTIMO estilo aplicado que cobre o
 * intervalo inteiro vence. O resultado é uma lista ordenada, sem sobreposição
 * e com intervalos adjacentes idênticos mesclados.
 */

function sameVisualStyle(a: RichTextStyle, b: RichTextStyle): boolean {
  return (
    a.fill === b.fill &&
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.fontStyle === b.fontStyle &&
    a.textDecoration === b.textDecoration &&
    a.letterSpacing === b.letterSpacing &&
    a.stroke?.color === b.stroke?.color &&
    a.stroke?.width === b.stroke?.width &&
    a.shadow?.color === b.shadow?.color &&
    a.shadow?.blur === b.shadow?.blur &&
    a.shadow?.offset?.x === b.shadow?.offset?.x &&
    a.shadow?.offset?.y === b.shadow?.offset?.y
  )
}

export function flattenRichTextStyles(
  contentLength: number,
  styles: RichTextStyle[],
): RichTextStyle[] {
  if (!styles || styles.length === 0) return []

  const clipped = styles
    .map((s) => ({
      ...s,
      start: Math.max(0, Math.min(contentLength, s.start)),
      end: Math.max(0, Math.min(contentLength, s.end)),
    }))
    .filter((s) => s.end > s.start)

  if (clipped.length === 0) return []

  const bounds = new Set<number>()
  for (const s of clipped) {
    bounds.add(s.start)
    bounds.add(s.end)
  }
  const sorted = [...bounds].sort((a, b) => a - b)

  const out: RichTextStyle[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]
    const end = sorted[i + 1]
    if (end <= start) continue

    // O último estilo aplicado (fim do array) que cobre o intervalo vence
    let winner: RichTextStyle | undefined
    for (let j = clipped.length - 1; j >= 0; j--) {
      const s = clipped[j]
      if (s.start <= start && s.end >= end) {
        winner = s
        break
      }
    }
    if (!winner) continue

    const prev = out[out.length - 1]
    if (prev && prev.end === start && sameVisualStyle(prev, winner)) {
      // Mescla intervalos adjacentes com o mesmo visual
      prev.end = end
    } else {
      out.push({ ...winner, start, end })
    }
  }
  return out
}
