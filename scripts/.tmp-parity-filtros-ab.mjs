/**
 * A/B de verdade: o MESMO design renderizado pelo Konva real no Chromium
 * (replicando o wiring do editor: cache, filtros, curvo char a char,
 * rich-text por segmentos) e pelo CanvasRenderer do server, com diff por
 * região. Antialiasing de texto difere entre Skia/Chrome e Skia/napi, então
 * o critério é diff médio baixo + inspeção do composite.
 *
 * Uso: node scripts/.tmp-parity-filtros-ab.mjs
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const ROOT = process.cwd()
const OUT = path.join(ROOT, 'scripts', '.tmp-parity-out')
fs.mkdirSync(OUT, { recursive: true })

const CANVAS_W = 1080
const CANVAS_H = 900

// ---------------------------------------------------------------------------
// Casos (mesmos dados para os dois renderizadores)
// ---------------------------------------------------------------------------
const chainStyle = {
  objectFit: 'cover',
  exposure: 0.15, contrast: 20, highlights: -30, shadows: 25,
  whites: 10, blacks: -10, saturation: 0.5, blur: 4, vignette: 0.5,
}
const flipStyle = {
  objectFit: 'cover', contrast: 30, saturation: 0.8, flipH: true,
  border: { width: 6, color: '#ff0000', radius: 40 },
}
const richStyles = [
  { start: 7, end: 15, fill: '#d64550' },
  { start: 16, end: 20, fontStyle: 'bold' },
  { start: 21, end: 31, textDecoration: 'underline' },
  { start: 44, end: 49, fontSize: 44, fill: '#2d9d78' },
  { start: 55, end: 61, shadow: { color: '#000000', blur: 6, offset: { x: 4, y: 4 } } },
]
const RICH_TEXT = 'Trecho vermelho bold sublinhado e um final maior com sombra'

const layers = [
  { id: 'img-chain', type: 'image', name: 'img-chain', visible: true, locked: false, order: 1, position: { x: 40, y: 40 }, size: { width: 220, height: 220 }, fileUrl: path.join(OUT, 'test-image.png'), style: chainStyle },
  { id: 'img-flip', type: 'image', name: 'img-flip', visible: true, locked: false, order: 1, position: { x: 320, y: 40 }, size: { width: 220, height: 220 }, fileUrl: path.join(OUT, 'test-image.png'), style: flipStyle },
  { id: 'texto-blur', type: 'text', name: 'texto-blur', visible: true, locked: false, order: 2, position: { x: 40, y: 300 }, size: { width: 460, height: 120 }, content: 'Texto com blur 8', style: { fontSize: 44, fontFamily: 'Montserrat', fontWeight: '700', color: '#0b1c3d' }, effects: { blur: { enabled: true, blurRadius: 8 } } },
  { id: 'texto-blur-sombra', type: 'text', name: 'texto-blur-sombra', visible: true, locked: false, order: 2, position: { x: 40, y: 440 }, size: { width: 460, height: 120 }, content: 'Blur 6 + sombra', style: { fontSize: 44, fontFamily: 'Montserrat', fontWeight: '700', color: '#7c2d92' }, effects: { blur: { enabled: true, blurRadius: 6 }, shadow: { enabled: true, shadowColor: '#000000', shadowBlur: 10, shadowOffsetX: 8, shadowOffsetY: 8, shadowOpacity: 0.7 } } },
  { id: 'texto-curvo', type: 'text', name: 'texto-curvo', visible: true, locked: false, order: 2, position: { x: 560, y: 700 }, size: { width: 420, height: 120 }, content: 'TEXTO CURVADO 45', style: { fontSize: 40, fontFamily: 'Montserrat', fontWeight: '700', color: '#b45309' }, effects: { curved: { enabled: true, curvature: 45 } } },
  { id: 'rich-text', type: 'rich-text', name: 'rich-text', visible: true, locked: false, order: 2, position: { x: 40, y: 580 }, size: { width: 460, height: 220 }, content: RICH_TEXT, style: { fontSize: 30, fontFamily: 'Montserrat', color: '#111111', textAlign: 'left', lineHeight: 1.3 }, richTextStyles: richStyles },
]

const design = { canvas: { width: CANVAS_W, height: CANVAS_H, backgroundColor: '#f4f4f5' }, layers }

// ---------------------------------------------------------------------------
// Render server
// ---------------------------------------------------------------------------
async function renderServer() {
  const { CanvasRenderer } = await import('../src/lib/canvas-renderer.ts')
  const renderer = new CanvasRenderer(CANVAS_W, CANVAS_H)
  const buffer = await renderer.renderDesign(design)
  const p = path.join(OUT, 'ab-server.png')
  fs.writeFileSync(p, buffer)
  return p
}

// ---------------------------------------------------------------------------
// Render "editor" (Konva real no Chromium, wiring dos componentes)
// ---------------------------------------------------------------------------
async function renderBrowser() {
  const browser = await chromium.launch({
    executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  })
  const page = await browser.newPage({ viewport: { width: CANVAS_W + 40, height: CANVAS_H + 40 }, deviceScaleFactor: 1 })

  const fontDir = path.join(ROOT, 'assets', 'fonts', 'montserrat')
  const font700 = fs.readFileSync(path.join(fontDir, 'Montserrat-700.ttf')).toString('base64')
  const font400 = fs.readFileSync(path.join(fontDir, 'Montserrat-400.ttf')).toString('base64')
  const imgB64 = fs.readFileSync(path.join(OUT, 'test-image.png')).toString('base64')

  await page.setContent(`<!DOCTYPE html><html><head><style>
    @font-face { font-family: 'Montserrat'; font-weight: 400; src: url(data:font/ttf;base64,${font400}) format('truetype'); }
    @font-face { font-family: 'Montserrat'; font-weight: 700; src: url(data:font/ttf;base64,${font700}) format('truetype'); }
    body { margin: 0; }
  </style></head><body><div id="stage"></div></body></html>`)
  await page.addScriptTag({ path: path.join(ROOT, 'node_modules', 'konva', 'konva.min.js') })

  await page.evaluate(async ({ layers, imgB64, CANVAS_W, CANVAS_H, RICH_TEXT }) => {
    await document.fonts.load('700 44px Montserrat')
    await document.fonts.load('400 30px Montserrat')
    await document.fonts.load('bold 30px Montserrat')
    await document.fonts.ready

    const image = new Image()
    image.src = 'data:image/png;base64,' + imgB64
    await new Promise((res) => { image.onload = res })

    /* global Konva */
    const stage = new Konva.Stage({ container: 'stage', width: CANVAS_W, height: CANVAS_H })
    const layer = new Konva.Layer()
    stage.add(layer)
    layer.add(new Konva.Rect({ x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, fill: '#f4f4f5' }))

    // Filtros custom como o editor os registra (wrappers sobre os mesmos loops)
    const applyHS = (data, highlights, shadows) => {
      const ha = highlights / 100, sa = shadows / 100
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2]
        const nl = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        if (nl > 0.5 && highlights !== 0) {
          const adj = ha * ((nl - 0.5) * 2) * 50
          data[i] = Math.max(0, Math.min(255, r + adj)); data[i + 1] = Math.max(0, Math.min(255, g + adj)); data[i + 2] = Math.max(0, Math.min(255, b + adj))
        }
        if (nl < 0.5 && shadows !== 0) {
          const adj = sa * ((0.5 - nl) * 2) * 50
          data[i] = Math.max(0, Math.min(255, data[i] + adj)); data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + adj)); data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + adj))
        }
      }
    }
    const applyWB = (data, whites, blacks) => {
      const wa = whites / 100, ba = blacks / 100
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2]
        const nl = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        if (nl > 0.7 && whites !== 0) {
          const adj = wa * Math.pow((nl - 0.7) / 0.3, 2) * 60
          data[i] = Math.max(0, Math.min(255, r + adj)); data[i + 1] = Math.max(0, Math.min(255, g + adj)); data[i + 2] = Math.max(0, Math.min(255, b + adj))
        }
        if (nl < 0.3 && blacks !== 0) {
          const adj = ba * Math.pow((0.3 - nl) / 0.3, 2) * 60
          data[i] = Math.max(0, Math.min(255, data[i] + adj)); data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + adj)); data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + adj))
        }
      }
    }
    const applyVig = (data, width, height, vignette) => {
      if (vignette === 0) return
      const cx = width / 2, cy = height / 2
      const maxD = Math.sqrt(cx * cx + cy * cy)
      const inten = vignette * 1.2, size = 0.5
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        const nd = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxD
        let f = 1
        if (nd > size) f = 1 - inten * Math.pow((nd - size) / (1 - size), 1.5)
        data[idx] = Math.max(0, Math.round(data[idx] * f))
        data[idx + 1] = Math.max(0, Math.round(data[idx + 1] * f))
        data[idx + 2] = Math.max(0, Math.round(data[idx + 2] * f))
      }
    }

    const imageNode = (l) => {
      const s = l.style
      // Mesma lista/ordem do useMemo do ImageNode
      const filters = []
      const consts = {}
      if (s.exposure !== undefined || s.brightness !== undefined) filters.push(Konva.Filters.Brighten)
      if (s.contrast !== undefined) filters.push(Konva.Filters.Contrast)
      if ((s.highlights !== undefined && s.highlights !== 0) || (s.shadows !== undefined && s.shadows !== 0)) {
        filters.push(function (imageData) { applyHS(imageData.data, s.highlights ?? 0, s.shadows ?? 0) })
      }
      if ((s.whites !== undefined && s.whites !== 0) || (s.blacks !== undefined && s.blacks !== 0)) {
        filters.push(function (imageData) { applyWB(imageData.data, s.whites ?? 0, s.blacks ?? 0) })
      }
      if (s.saturation !== undefined && s.saturation !== 0) filters.push(Konva.Filters.HSL)
      if (s.blur) filters.push(Konva.Filters.Blur)
      if (s.vignette !== undefined && s.vignette > 0) {
        filters.push(function (imageData) { applyVig(imageData.data, imageData.width, imageData.height, s.vignette) })
      }
      const w = l.size.width, h = l.size.height
      const node = new Konva.Image({
        image,
        // imagem 400×400 em caixa quadrada: cover = imagem inteira
        cropX: 0, cropY: 0, cropWidth: 400, cropHeight: 400,
        width: w, height: h,
        brightness: s.exposure ?? s.brightness ?? 0,
        contrast: s.contrast ?? 0,
        saturation: s.saturation ?? 0,
        blurRadius: s.blur ?? 0,
        cornerRadius: s.border?.radius ?? 0,
        stroke: s.border?.width ? s.border.color : undefined,
        strokeWidth: s.border?.width || undefined,
        filters,
      })
      if (s.flipH) { node.x(w); node.scaleX(-1) }
      const group = new Konva.Group({ x: l.position.x, y: l.position.y })
      group.add(node)
      node.cache()
      layer.add(group)
    }

    imageNode(layers.find((l) => l.id === 'img-chain'))
    imageNode(layers.find((l) => l.id === 'img-flip'))

    // Texto com blur — wiring do KonvaEditableText
    const textNode = (l) => {
      const s = l.style
      const fx = l.effects || {}
      const node = new Konva.Text({
        x: l.position.x, y: l.position.y,
        text: l.content,
        width: l.size.width, height: l.size.height,
        fontSize: s.fontSize, fontFamily: s.fontFamily,
        fontStyle: s.fontStyle ?? 'normal',
        fontVariant: s.fontWeight ? String(s.fontWeight) : undefined,
        fill: s.color, align: s.textAlign ?? 'left',
        verticalAlign: 'top', padding: 6,
        lineHeight: s.lineHeight ?? 1.2, letterSpacing: s.letterSpacing ?? 0,
        wrap: 'word', ellipsis: false,
        perfectDrawEnabled: true, imageSmoothingEnabled: true,
        shadowColor: fx.shadow?.enabled ? fx.shadow.shadowColor : undefined,
        shadowBlur: fx.shadow?.enabled ? fx.shadow.shadowBlur : 0,
        shadowOffsetX: fx.shadow?.enabled ? fx.shadow.shadowOffsetX : 0,
        shadowOffsetY: fx.shadow?.enabled ? fx.shadow.shadowOffsetY : 0,
        shadowOpacity: fx.shadow?.enabled ? fx.shadow.shadowOpacity : 1,
        filters: fx.blur?.enabled && fx.blur.blurRadius > 0 ? [Konva.Filters.Blur] : undefined,
        blurRadius: fx.blur?.enabled ? fx.blur.blurRadius : 0,
      })
      layer.add(node)
      // cache do editor: pixelRatio máx(2, dpr)
      node.cache({ pixelRatio: 2, imageSmoothingEnabled: true })
    }
    textNode(layers.find((l) => l.id === 'texto-blur'))
    textNode(layers.find((l) => l.id === 'texto-blur-sombra'))

    // Texto curvo — loop exato do konva-editable-text.tsx
    const curved = layers.find((l) => l.id === 'texto-curvo')
    {
      const s = curved.style
      const curvature = curved.effects.curved.curvature
      const chars = curved.content.split('')
      const fontSize = s.fontSize
      const width = curved.size.width
      const curvatureRadians = (curvature * Math.PI) / 180
      const radius = curvatureRadians !== 0 ? width / (2 * Math.sin(Math.abs(curvatureRadians) / 2)) : 1000
      const centerX = width / 2
      const centerY = curvature > 0 ? -radius : radius
      const group = new Konva.Group({ x: curved.position.x, y: curved.position.y })
      chars.forEach((char, i) => {
        const charAngle = (curvatureRadians * (i - chars.length / 2)) / chars.length
        const x = centerX + radius * Math.sin(charAngle)
        const y = centerY + radius * (1 - Math.cos(charAngle))
        const rotation = (charAngle * 180) / Math.PI
        group.add(new Konva.Text({
          x, y, rotation, text: char,
          fontSize, fontFamily: s.fontFamily,
          fontStyle: s.fontStyle ?? 'normal',
          fontVariant: s.fontWeight ? String(s.fontWeight) : undefined,
          fill: s.color,
          perfectDrawEnabled: true, imageSmoothingEnabled: true,
        }))
      })
      layer.add(group)
    }

    // rich-text — port do konva-multi-styled-text.tsx (flatten + layout)
    const rich = layers.find((l) => l.id === 'rich-text')
    {
      const base = rich.style
      const text = RICH_TEXT
      const sameVisual = (a, b) => a.fill === b.fill && a.fontFamily === b.fontFamily && a.fontSize === b.fontSize && a.fontStyle === b.fontStyle && a.textDecoration === b.textDecoration && a.letterSpacing === b.letterSpacing && a.stroke?.color === b.stroke?.color && a.stroke?.width === b.stroke?.width && a.shadow?.color === b.shadow?.color && a.shadow?.blur === b.shadow?.blur && a.shadow?.offset?.x === b.shadow?.offset?.x && a.shadow?.offset?.y === b.shadow?.offset?.y
      const flatten = (len, styles) => {
        const clipped = styles.map((s) => ({ ...s, start: Math.max(0, Math.min(len, s.start)), end: Math.max(0, Math.min(len, s.end)) })).filter((s) => s.end > s.start)
        if (!clipped.length) return []
        const bounds = [...new Set(clipped.flatMap((s) => [s.start, s.end]))].sort((a, b) => a - b)
        const out = []
        for (let i = 0; i < bounds.length - 1; i++) {
          const start = bounds[i], end = bounds[i + 1]
          if (end <= start) continue
          let winner
          for (let j = clipped.length - 1; j >= 0; j--) { const s = clipped[j]; if (s.start <= start && s.end >= end) { winner = s; break } }
          if (!winner) continue
          const prev = out[out.length - 1]
          if (prev && prev.end === start && sameVisual(prev, winner)) prev.end = end
          else out.push({ ...winner, start, end })
        }
        return out
      }
      const baseSeg = { fontFamily: base.fontFamily ?? 'Inter', fontSize: base.fontSize ?? 16, fill: base.color ?? '#000000', fontStyle: base.fontStyle ?? 'normal', textDecoration: 'none', letterSpacing: base.letterSpacing ?? 0 }
      const flat = flatten(text.length, rich.richTextStyles)
      const segments = []
      let cursor = 0
      for (const rs of flat) {
        if (rs.start > cursor) segments.push({ text: text.substring(cursor, rs.start), start: cursor, end: rs.start, style: { ...baseSeg } })
        if (rs.end > rs.start) segments.push({ text: text.substring(rs.start, rs.end), start: rs.start, end: rs.end, style: { ...baseSeg, ...Object.fromEntries(Object.entries(rs).filter(([k, v]) => v !== undefined && k !== 'start' && k !== 'end')) } })
        cursor = Math.max(cursor, rs.end)
      }
      if (cursor < text.length) segments.push({ text: text.substring(cursor), start: cursor, end: text.length, style: { ...baseSeg } })

      const tempText = new Konva.Text({ text, width: rich.size.width, fontSize: base.fontSize ?? 16, fontFamily: base.fontFamily ?? 'Inter', fontStyle: base.fontStyle ?? 'normal', lineHeight: base.lineHeight ?? 1.2, letterSpacing: base.letterSpacing ?? 0, padding: 6, wrap: 'word' })
      const konvaLines = tempText.textArr || []

      const padding = 6
      const canvas = document.createElement('canvas')
      const mctx = canvas.getContext('2d')
      const lines = []
      let searchCursor = 0, yOffset = padding, maxLineWidth = 0
      for (const kl of konvaLines) {
        const lineText = kl.text
        let lineStart = lineText.length > 0 ? text.indexOf(lineText, searchCursor) : searchCursor
        if (lineStart === -1) lineStart = searchCursor
        const lineEnd = lineStart + lineText.length
        const lineSegments = []
        for (const seg of segments) {
          if (seg.end <= lineStart || seg.start >= lineEnd) continue
          const iS = Math.max(seg.start, lineStart), iE = Math.min(seg.end, lineEnd)
          const t = text.substring(iS, iE)
          if (!t.length) continue
          const st = seg.style
          mctx.font = (st.fontStyle ?? 'normal') + ' ' + (st.fontSize ?? 16) + 'px ' + (st.fontFamily ?? 'Inter')
          const w = mctx.measureText(t).width + (st.letterSpacing ?? 0) * t.length
          lineSegments.push({ ...seg, text: t, width: w, height: st.fontSize ?? 16 })
        }
        const lineHeight = lineSegments.length ? Math.max(...lineSegments.map((s) => s.style.fontSize ?? 16)) : (base.lineHeight ?? 1.2) * 16
        lines.push({ segments: lineSegments, y: yOffset, width: lineSegments.reduce((a, s) => a + s.width, 0), height: lineHeight })
        maxLineWidth = Math.max(maxLineWidth, lineSegments.reduce((a, s) => a + s.width, 0))
        yOffset += lineHeight * (base.lineHeight ?? 1.2)
        searchCursor = lineEnd
      }
      const containerWidth = rich.size.width - padding * 2
      const group = new Konva.Group({ x: rich.position.x, y: rich.position.y })
      for (const line of lines) {
        let xOff = padding
        if (base.textAlign === 'center') xOff += (containerWidth - line.width) / 2
        else if (base.textAlign === 'right') xOff += containerWidth - line.width
        for (const seg of line.segments) {
          const st = seg.style
          const isBold = st.fontStyle?.includes('bold') ?? false
          const hasCustomStroke = !!st.stroke?.color && (st.stroke?.width ?? 0) > 0
          const fauxBoldWidth = isBold && !hasCustomStroke ? Math.max(0.6, (st.fontSize ?? 16) * 0.03) : undefined
          group.add(new Konva.Text({
            x: xOff, y: line.y, text: seg.text,
            fontSize: st.fontSize, fontFamily: st.fontFamily, fontStyle: st.fontStyle,
            fill: st.fill, textDecoration: st.textDecoration,
            letterSpacing: st.letterSpacing ?? 0,
            stroke: hasCustomStroke ? st.stroke.color : (fauxBoldWidth ? st.fill : undefined),
            strokeWidth: hasCustomStroke ? st.stroke.width : fauxBoldWidth,
            fillAfterStrokeEnabled: true,
            shadowColor: st.shadow?.color, shadowBlur: st.shadow?.blur,
            shadowOffsetX: st.shadow?.offset?.x, shadowOffsetY: st.shadow?.offset?.y,
            perfectDrawEnabled: true, imageSmoothingEnabled: true,
          }))
          xOff += seg.width
        }
      }
      layer.add(group)
    }

    layer.draw()
    window.__stage = stage
  }, { layers, imgB64, CANVAS_W, CANVAS_H, RICH_TEXT })

  const dataUrl = await page.evaluate(() => window.__stage.toDataURL({ pixelRatio: 1 }))
  const p = path.join(OUT, 'ab-browser.png')
  fs.writeFileSync(p, Buffer.from(dataUrl.split(',')[1], 'base64'))
  await browser.close()
  return p
}

// ---------------------------------------------------------------------------
// Diff por região + composite
// ---------------------------------------------------------------------------
async function diff(serverPath, browserPath) {
  const [a, b] = await Promise.all([loadImage(serverPath), loadImage(browserPath)])
  const ca = createCanvas(CANVAS_W, CANVAS_H); ca.getContext('2d').drawImage(a, 0, 0)
  const cb = createCanvas(CANVAS_W, CANVAS_H); cb.getContext('2d').drawImage(b, 0, 0)
  const da = ca.getContext('2d').getImageData(0, 0, CANVAS_W, CANVAS_H).data
  const db = cb.getContext('2d').getImageData(0, 0, CANVAS_W, CANVAS_H).data

  const regions = [
    ['img-chain', 40, 40, 220, 220],
    ['img-flip+radius+borda', 310, 30, 240, 240],
    ['texto-blur', 30, 290, 480, 140],
    ['texto-blur+sombra', 30, 430, 500, 150],
    ['rich-text', 30, 570, 500, 230],
    ['texto-curvo', 540, 60, 540, 320],
  ]

  console.log('\nDiff por região (média |Δ| por canal, % pixels com Δ>16):')
  for (const [name, rx, ry, rw, rh] of regions) {
    let sum = 0, big = 0, n = 0
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
      const i = (y * CANVAS_W + x) * 4
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(da[i + c] - db[i + c])
        sum += d
        if (d > 16) big++
        n++
      }
    }
    console.log(`  ${name.padEnd(24)} média=${(sum / n).toFixed(2)}  Δ>16: ${((big / n) * 100).toFixed(2)}%`)
  }

  // Composite: server | browser | diff ×4
  const comp = createCanvas(CANVAS_W * 3, CANVAS_H)
  const cctx = comp.getContext('2d')
  cctx.drawImage(a, 0, 0)
  cctx.drawImage(b, CANVAS_W, 0)
  const dimg = cctx.createImageData(CANVAS_W, CANVAS_H)
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]))
    const v = Math.min(255, d * 4)
    dimg.data[i] = v; dimg.data[i + 1] = 0; dimg.data[i + 2] = 0; dimg.data[i + 3] = 255
  }
  cctx.putImageData(dimg, CANVAS_W * 2, 0)
  const p = path.join(OUT, 'ab-composite.png')
  fs.writeFileSync(p, comp.toBuffer('image/png'))
  console.log(`\nComposite (server | editor | diff×4): ${p}`)
}

const serverPath = await renderServer()
const browserPath = await renderBrowser()
await diff(serverPath, browserPath)
