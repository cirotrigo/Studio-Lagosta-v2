// Confere no Chrome de verdade que o motion toca COM transparência: desenha o
// último quadro do .webm num canvas de fundo vermelho (o caminho do editor:
// drawImage do <video>) e conta os pixels da captura. O fundo tem de continuar
// vermelho onde não há tinta, e tem de haver tinta.
// uso: node scripts/motions/conferir-no-chrome.mjs <arquivo.webm> [saida.png]
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { createCanvas, loadImage } = require('@napi-rs/canvas')

const [webm, png] = process.argv.slice(2)
if (!webm) { console.error('uso: node scripts/motions/conferir-no-chrome.mjs <arquivo.webm> [saida.png]'); process.exit(1) }
const html = path.join(os.tmpdir(), `conferir-motion-${process.pid}.html`)
fs.writeFileSync(html, `<body style="margin:0"><canvas id="c" width="540" height="960"></canvas>
<video id="v" src="${new URL(`file://${path.resolve(webm)}`).href}" muted playsinline style="display:none"></video></body>`)

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 })
await page.goto(`file://${html}`)
const video = await page.evaluate(async () => {
  const v = document.getElementById('v'), ctx = document.getElementById('c').getContext('2d')
  const prazo = (ms, oQue) => new Promise((_, erro) => setTimeout(() => erro(new Error(`${oQue}: passou de ${ms} ms`)), ms))
  // o vídeo pode já ter carregado antes de este código rodar
  if (v.readyState < 2) await Promise.race([new Promise((ok, erro) => { v.onloadeddata = ok; v.onerror = () => erro(new Error('o vídeo não carregou')) }), prazo(15000, 'carregar')])
  const buscou = new Promise((ok) => { v.onseeked = ok })
  v.currentTime = v.duration - 0.05
  await Promise.race([buscou, prazo(15000, 'ir ao fim do vídeo')])
  ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 540, 960)
  ctx.drawImage(v, 0, 0, 540, 960)
  return { duracao: v.duration, largura: v.videoWidth, altura: v.videoHeight }
})
// file:// "suja" o canvas e o getImageData é recusado na página: os pixels saem da captura
const captura = await page.locator('#c').screenshot()
await browser.close()
fs.rmSync(html)
if (png) fs.writeFileSync(png, captura)

const img = await loadImage(captura)
const c = createCanvas(img.width, img.height)
const ctx = c.getContext('2d')
ctx.drawImage(img, 0, 0)
const px = ctx.getImageData(0, 0, img.width, img.height).data
let fundo = 0, tinta = 0
for (let i = 0; i < px.length; i += 4) {
  if (px[i] > 250 && px[i + 1] < 5 && px[i + 2] < 5) fundo++
  else tinta++
}
if (tinta === 0) throw new Error('último quadro sem tinta')
// vídeo sem alfa cobre o quadro inteiro; a logo 1:1 deixa ver só os cantos, e isso basta
if (fundo / (fundo + tinta) < 0.05) throw new Error('o fundo não ficou transparente (quase nada do quadro deixa ver o que está atrás)')
console.log(`ok — transparente em ${((100 * fundo) / (fundo + tinta)).toFixed(0)}% do quadro, ${video.largura}x${video.altura}, ${video.duracao.toFixed(1)} s`)
