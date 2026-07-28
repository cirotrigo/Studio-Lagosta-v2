/**
 * Paridade dos filtros de imagem, blur/curvo de texto e rich-text.
 *
 * Parte A — pixel loops de `src/lib/konva/filters/apply.ts` comparados byte a
 * byte com os filtros do Konva core (require direto de konva/lib/filters/*,
 * `this` fake) sobre buffers aleatórios.
 *
 * Parte B — render A/B visual: CanvasRenderer → PNG com grade de casos
 * (cada filtro isolado, cadeia completa, blur de texto, texto curvo,
 * rich-text com segmentos) para inspeção.
 *
 * Uso: npx tsx scripts/.tmp-parity-filtros.ts
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import {
  applyBrighten,
  applyContrast,
  applyGrayscale,
  applyHSLSaturation,
  applyInvert,
  applySepia,
  applyStackBlur,
} from '../src/lib/konva/filters/apply'
import { CanvasRenderer } from '../src/lib/canvas-renderer'
import type { DesignData, Layer } from '../src/types/template'

/* eslint-disable @typescript-eslint/no-require-imports */
const { Brighten } = require('konva/lib/filters/Brighten')
const { Contrast } = require('konva/lib/filters/Contrast')
const { HSL } = require('konva/lib/filters/HSL')
const { Blur } = require('konva/lib/filters/Blur')
const { Grayscale } = require('konva/lib/filters/Grayscale')
const { Sepia } = require('konva/lib/filters/Sepia')
const { Invert } = require('konva/lib/filters/Invert')

const OUT_DIR = path.join(process.cwd(), 'scripts', '.tmp-parity-out')
fs.mkdirSync(OUT_DIR, { recursive: true })

// ---------------------------------------------------------------------------
// Parte A — equivalência byte a byte com o Konva core
// ---------------------------------------------------------------------------

function randomImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  let seed = 42
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed % 256
  }
  for (let i = 0; i < data.length; i++) data[i] = rand()
  return { data, width, height, colorSpace: 'srgb' } as ImageData
}

function clone(img: ImageData): ImageData {
  return {
    data: new Uint8ClampedArray(img.data),
    width: img.width,
    height: img.height,
    colorSpace: 'srgb',
  } as ImageData
}

function diffCount(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let n = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++
  return n
}

let failures = 0
function check(name: string, konvaFn: (this: unknown, img: ImageData) => void, fakeThis: Record<string, () => number>, ours: (img: ImageData) => void) {
  const base = randomImageData(64, 48)
  const konvaImg = clone(base)
  const oursImg = clone(base)
  konvaFn.call(fakeThis, konvaImg)
  ours(oursImg)
  const diff = diffCount(konvaImg.data, oursImg.data)
  if (diff === 0) {
    console.log(`  ✅ ${name}: idêntico (${konvaImg.data.length} bytes)`)
  } else {
    failures++
    console.error(`  ❌ ${name}: ${diff} bytes divergem`)
  }
}

console.log('Parte A — pixel loops vs Konva core:')
for (const v of [-0.5, -0.13, 0.25, 0.9]) {
  check(`Brighten(${v})`, Brighten, { brightness: () => v }, (img) => applyBrighten(img.data, v))
}
for (const v of [-80, -15, 30, 100]) {
  check(`Contrast(${v})`, Contrast, { contrast: () => v }, (img) => applyContrast(img.data, v))
}
for (const v of [-2, -0.7, 0.5, 2]) {
  check(
    `HSL saturation(${v})`,
    HSL,
    { saturation: () => v, hue: () => 0, luminance: () => 0 },
    (img) => applyHSLSaturation(img.data, v),
  )
}
for (const v of [1, 3, 10, 40]) {
  check(`Blur(${v})`, Blur, { blurRadius: () => v }, (img) => applyStackBlur(img.data, img.width, img.height, v))
}
check('Grayscale', Grayscale, {}, (img) => applyGrayscale(img.data))
check('Sepia', Sepia, {}, (img) => applySepia(img.data))
check('Invert', Invert, {}, (img) => applyInvert(img.data))

if (failures > 0) {
  console.error(`\nParte A FALHOU: ${failures} filtros divergem do Konva core`)
  process.exit(1)
}
console.log('Parte A OK — todos os loops batem com o Konva core.\n')

// ---------------------------------------------------------------------------
// Parte B — render A/B visual
// ---------------------------------------------------------------------------

async function makeTestImage(): Promise<string> {
  // Foto sintética: gradiente + formas com faixa completa de tons
  const c = createCanvas(400, 400)
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 400, 400)
  grad.addColorStop(0, '#0b1c3d')
  grad.addColorStop(0.4, '#2f7bbf')
  grad.addColorStop(0.7, '#f2a33c')
  grad.addColorStop(1, '#fdf6e3')
  g.fillStyle = grad
  g.fillRect(0, 0, 400, 400)
  g.fillStyle = '#d64550'
  g.beginPath()
  g.arc(120, 140, 70, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#2d9d78'
  g.fillRect(220, 60, 130, 90)
  g.fillStyle = '#ffffff'
  g.font = 'bold 42px sans-serif'
  g.fillText('FOTO', 140, 320)
  const p = path.join(OUT_DIR, 'test-image.png')
  fs.writeFileSync(p, c.toBuffer('image/png'))
  return p
}

function imageLayer(id: string, x: number, y: number, style: Record<string, unknown>, fileUrl: string): Layer {
  return {
    id,
    type: 'image',
    name: id,
    visible: true,
    locked: false,
    order: 1,
    position: { x, y },
    size: { width: 220, height: 220 },
    fileUrl,
    style: { objectFit: 'cover', ...style },
  } as Layer
}

async function main() {
  const img = await makeTestImage()

  const cases: Array<[string, Record<string, unknown>]> = [
    ['crua', {}],
    ['exposure+0.4', { exposure: 0.4 }],
    ['contrast+45', { contrast: 45 }],
    ['highlights-70', { highlights: -70 }],
    ['shadows+70', { shadows: 70 }],
    ['whites-80', { whites: -80 }],
    ['blacks+80', { blacks: 80 }],
    ['saturation-1.2', { saturation: -1.2 }],
    ['blur12', { blur: 12 }],
    ['vignette0.8', { vignette: 0.8 }],
    ['grayscale', { grayscale: true }],
    ['sepia', { sepia: true }],
    ['invert', { invert: true }],
    ['cadeia-completa', { exposure: 0.15, contrast: 20, highlights: -30, shadows: 25, whites: 10, blacks: -10, saturation: 0.5, blur: 4, vignette: 0.5 }],
    ['filtro+flip+radius', { contrast: 30, saturation: 0.8, flipH: true, border: { width: 6, color: '#ff0000', radius: 40 } }],
    ['filtro+mask', { sepia: true, mask: { shapeId: 'circle', path: 'M 50 0 A 50 50 0 1 1 49.99 0 Z' } }],
  ]

  const layers: Layer[] = []
  const cols = 4
  cases.forEach(([name, style], i) => {
    const x = 40 + (i % cols) * 260
    const y = 60 + Math.floor(i / cols) * 300
    layers.push(imageLayer(`img-${name}`, x, y, style, img))
    layers.push({
      id: `label-${name}`,
      type: 'text',
      name,
      visible: true,
      locked: false,
      order: 2,
      position: { x, y: y + 224 },
      size: { width: 220, height: 40 },
      content: name,
      style: { fontSize: 20, fontFamily: 'Montserrat', color: '#111111' },
    } as Layer)
  })

  // Texto com blur / curvo / rich-text na faixa de baixo
  const textY = 60 + Math.ceil(cases.length / cols) * 300
  layers.push({
    id: 'texto-blur',
    type: 'text',
    name: 'texto-blur',
    visible: true,
    locked: false,
    order: 3,
    position: { x: 40, y: textY },
    size: { width: 460, height: 120 },
    content: 'Texto com blur 8',
    style: { fontSize: 44, fontFamily: 'Montserrat', fontWeight: '700', color: '#0b1c3d' },
    effects: { blur: { enabled: true, blurRadius: 8 } },
  } as Layer)
  layers.push({
    id: 'texto-blur-sombra',
    type: 'text',
    name: 'texto-blur-sombra',
    visible: true,
    locked: false,
    order: 3,
    position: { x: 40, y: textY + 130 },
    size: { width: 460, height: 120 },
    content: 'Blur 6 + sombra',
    style: { fontSize: 44, fontFamily: 'Montserrat', fontWeight: '700', color: '#7c2d92' },
    effects: {
      blur: { enabled: true, blurRadius: 6 },
      shadow: { enabled: true, shadowColor: '#000000', shadowBlur: 10, shadowOffsetX: 8, shadowOffsetY: 8, shadowOpacity: 0.7 },
    },
  } as Layer)
  layers.push({
    id: 'texto-curvo',
    type: 'text',
    name: 'texto-curvo',
    visible: true,
    locked: false,
    order: 3,
    position: { x: 560, y: textY + 320 },
    size: { width: 420, height: 120 },
    content: 'TEXTO CURVADO 45',
    style: { fontSize: 40, fontFamily: 'Montserrat', fontWeight: '700', color: '#b45309' },
    effects: { curved: { enabled: true, curvature: 45 } },
  } as Layer)
  layers.push({
    id: 'rich-text',
    type: 'rich-text',
    name: 'rich-text',
    visible: true,
    locked: false,
    order: 3,
    position: { x: 40, y: textY + 280 },
    size: { width: 460, height: 200 },
    content: 'Trecho vermelho bold sublinhado e um final maior com sombra',
    style: { fontSize: 30, fontFamily: 'Montserrat', color: '#111111', textAlign: 'left', lineHeight: 1.3 },
    richTextStyles: [
      { start: 7, end: 15, fill: '#d64550' },
      { start: 16, end: 20, fontStyle: 'bold' },
      { start: 21, end: 31, textDecoration: 'underline' },
      { start: 44, end: 49, fontSize: 44, fill: '#2d9d78' },
      { start: 55, end: 61, shadow: { color: '#000000', blur: 6, offset: { x: 4, y: 4 } } },
    ],
  } as Layer)

  const design: DesignData = {
    canvas: { width: 1080, height: textY + 500, backgroundColor: '#f4f4f5' },
    layers,
  }

  const renderer = new CanvasRenderer(design.canvas.width, design.canvas.height)
  const buffer = await renderer.renderDesign(design)
  const out = path.join(OUT_DIR, 'parity-filtros.png')
  fs.writeFileSync(out, buffer)
  console.log(`Parte B — render salvo em ${out}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
