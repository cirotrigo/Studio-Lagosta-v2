import type { RichStyleRun } from '@/types/template'

/**
 * A text segment with resolved style (base + overrides merged).
 */
export interface TextSegment {
  text: string
  style: RichStyleRun['style']
}

/**
 * Split text into styled segments based on richStyles runs.
 * Segments that don't match any run use empty style (= base style).
 */
export function splitTextIntoSegments(
  text: string,
  richStyles?: RichStyleRun[],
): TextSegment[] {
  if (!richStyles || richStyles.length === 0) {
    return [{ text, style: {} }]
  }

  // Sort runs by start position
  const sorted = [...richStyles].sort((a, b) => a.start - b.start)

  const segments: TextSegment[] = []
  let cursor = 0

  for (const run of sorted) {
    const start = Math.max(run.start, cursor)
    const end = Math.min(run.end, text.length)
    if (start >= end) continue

    // Gap before this run (plain text)
    if (cursor < start) {
      segments.push({ text: text.slice(cursor, start), style: {} })
    }

    // Styled run
    segments.push({ text: text.slice(start, end), style: run.style })
    cursor = end
  }

  // Remaining text after last run
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), style: {} })
  }

  return segments
}

// ─── richStyles → HTML ──────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

function buildSpanStyle(style: RichStyleRun['style']): string {
  const parts: string[] = []
  if (style.fontFamily) parts.push(`font-family:${style.fontFamily}`)
  if (style.fontSize) parts.push(`font-size:${style.fontSize}px`)
  if (style.fontWeight) parts.push(`font-weight:${style.fontWeight}`)
  if (style.fontStyle) parts.push(`font-style:${style.fontStyle}`)
  if (style.fill) parts.push(`color:${style.fill}`)
  const decorations: string[] = []
  if (style.underline) decorations.push('underline')
  if (style.strikethrough) decorations.push('line-through')
  if (decorations.length > 0) parts.push(`text-decoration:${decorations.join(' ')}`)
  return parts.join(';')
}

function hasStyle(style: RichStyleRun['style']): boolean {
  return !!(
    style.fontFamily ||
    style.fontSize ||
    style.fontWeight ||
    style.fontStyle ||
    style.fill ||
    style.underline ||
    style.strikethrough
  )
}

/**
 * Convert text + richStyles to HTML for contenteditable.
 */
export function richStylesToHtml(
  text: string,
  richStyles?: RichStyleRun[],
): string {
  const segments = splitTextIntoSegments(text, richStyles)

  return segments
    .map((seg) => {
      const escaped = escapeHtml(seg.text)
      if (!hasStyle(seg.style)) return escaped
      const css = buildSpanStyle(seg.style)
      return `<span data-rich="1" style="${css}">${escaped}</span>`
    })
    .join('')
}

// ─── HTML → richStyles + text ───────────────────────────────────────

interface ParsedRichText {
  text: string
  richStyles: RichStyleRun[]
}

function parseInlineStyle(styleAttr: string): RichStyleRun['style'] {
  const style: RichStyleRun['style'] = {}
  if (!styleAttr) return style

  const pairs = styleAttr.split(';').filter(Boolean)
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(':')
    if (colonIdx < 0) continue
    const prop = pair.slice(0, colonIdx).trim().toLowerCase()
    const val = pair.slice(colonIdx + 1).trim()

    switch (prop) {
      case 'font-family':
        style.fontFamily = val.replace(/['"]/g, '')
        break
      case 'font-size':
        style.fontSize = parseFloat(val)
        break
      case 'font-weight':
        style.fontWeight = val
        break
      case 'font-style':
        style.fontStyle = val as 'normal' | 'italic'
        break
      case 'color':
        style.fill = val
        break
      case 'text-decoration':
      case 'text-decoration-line':
        if (val.includes('underline')) style.underline = true
        if (val.includes('line-through')) style.strikethrough = true
        break
    }
  }

  return style
}

/**
 * Parse HTML from contenteditable back to plain text + richStyles.
 * Handles: <span style="...">, <b>, <i>, <u>, <s>/<strike>, <br>, text nodes.
 */
export function htmlToRichStyles(html: string): ParsedRichText {
  const container = document.createElement('div')
  container.innerHTML = html

  let text = ''
  const richStyles: RichStyleRun[] = []

  function walkNode(node: Node, inheritedStyle: RichStyleRun['style'] = {}) {
    if (node.nodeType === Node.TEXT_NODE) {
      const content = node.textContent ?? ''
      if (content.length > 0) {
        const start = text.length
        text += content
        const end = text.length
        if (hasStyle(inheritedStyle)) {
          richStyles.push({ start, end, style: { ...inheritedStyle } })
        }
      }
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return

    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()

    // Handle <br> as newline
    if (tag === 'br') {
      text += '\n'
      return
    }

    // Build style from element
    const style: RichStyleRun['style'] = { ...inheritedStyle }

    // HTML semantic tags
    if (tag === 'b' || tag === 'strong') style.fontWeight = 'bold'
    if (tag === 'i' || tag === 'em') style.fontStyle = 'italic'
    if (tag === 'u') style.underline = true
    if (tag === 's' || tag === 'strike' || tag === 'del') style.strikethrough = true

    // <font> tags generated by document.execCommand (foreColor, fontName)
    if (tag === 'font') {
      const color = el.getAttribute('color')
      if (color) style.fill = color
      const face = el.getAttribute('face')
      if (face) style.fontFamily = face
      const size = el.getAttribute('size')
      if (size) {
        // HTML font sizes 1-7, map to approximate px
        const sizeMap: Record<string, number> = { '1': 10, '2': 13, '3': 16, '4': 18, '5': 24, '6': 32, '7': 48 }
        if (sizeMap[size]) style.fontSize = sizeMap[size]
      }
    }

    // Inline style attribute
    const inlineStyle = el.getAttribute('style')
    if (inlineStyle) {
      const parsed = parseInlineStyle(inlineStyle)
      Object.assign(style, parsed)
    }

    // Process children
    for (const child of Array.from(el.childNodes)) {
      walkNode(child, style)
    }

    // Handle block-level elements adding newlines
    if (tag === 'div' || tag === 'p') {
      if (text.length > 0 && !text.endsWith('\n')) {
        text += '\n'
      }
    }
  }

  for (const child of Array.from(container.childNodes)) {
    walkNode(child)
  }

  // Remove trailing newline
  if (text.endsWith('\n')) {
    text = text.slice(0, -1)
  }

  // Merge adjacent runs with same style
  const merged = mergeAdjacentRuns(richStyles)

  return { text, richStyles: merged }
}

/**
 * Merge adjacent runs that have identical styles.
 */
function mergeAdjacentRuns(runs: RichStyleRun[]): RichStyleRun[] {
  if (runs.length <= 1) return runs

  const result: RichStyleRun[] = [runs[0]]

  for (let i = 1; i < runs.length; i++) {
    const prev = result[result.length - 1]
    const curr = runs[i]

    if (prev.end === curr.start && stylesEqual(prev.style, curr.style)) {
      prev.end = curr.end
    } else {
      result.push(curr)
    }
  }

  return result
}

function stylesEqual(a: RichStyleRun['style'], b: RichStyleRun['style']): boolean {
  return (
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.fontWeight === b.fontWeight &&
    a.fontStyle === b.fontStyle &&
    a.fill === b.fill &&
    a.underline === b.underline &&
    a.strikethrough === b.strikethrough
  )
}
