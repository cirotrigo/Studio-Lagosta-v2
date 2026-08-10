/**
 * Recorta a logo desenhada pelo modelo e põe lado a lado com o arquivo oficial,
 * ampliados, para julgar fidelidade a olho.
 */
import * as fs from 'fs'

async function main() {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas')
  const sharp = (await import('sharp')).default

  const OFICIAL = 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/projects/7/logos/1760576188203-By_Rock_-_logo.png'

  // Canto inferior direito da arte gerada no modo `modelo`
  const arte = fs.readFileSync('/tmp/teste-logo-modelo/modelo.jpg')
  const meta = await sharp(arte).metadata()
  const W = meta.width ?? 1080
  const H = meta.height ?? 1350
  const cropModelo = await sharp(arte)
    .extract({ left: Math.round(W * 0.72), top: Math.round(H * 0.76), width: Math.round(W * 0.26), height: Math.round(H * 0.2) })
    .toBuffer()

  // Canto superior esquerdo da arte do modo `compor` (a logo COLADA)
  const arteC = fs.readFileSync('/tmp/teste-logo-modelo/compor.jpg')
  const cropColada = await sharp(arteC)
    .extract({ left: Math.round(W * 0.03), top: Math.round(H * 0.03), width: Math.round(W * 0.24), height: Math.round(H * 0.16) })
    .toBuffer()

  const res = await fetch(OFICIAL)
  const oficial = Buffer.from(await res.arrayBuffer())

  const CELL = 460
  const canvas = createCanvas(CELL * 3, CELL + 50)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#141414'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 21px sans-serif'
  ctx.textBaseline = 'top'

  const painel = async (buf: Buffer, i: number, titulo: string) => {
    ctx.fillStyle = '#fff'
    ctx.fillText(titulo, i * CELL + 14, 12)
    const img = await loadImage(buf)
    const s = Math.min((CELL - 28) / img.width, (CELL - 20) / img.height)
    ctx.drawImage(img, i * CELL + (CELL - img.width * s) / 2, 46 + (CELL - 30 - img.height * s) / 2, img.width * s, img.height * s)
  }

  await painel(oficial, 0, 'OFICIAL (arquivo)')
  await painel(cropColada, 1, 'COLADA pelo sharp')
  await painel(cropModelo, 2, 'DESENHADA pelo modelo')

  fs.writeFileSync('/tmp/teste-logo-modelo/comparacao.png', canvas.toBuffer('image/png'))
  console.log('/tmp/teste-logo-modelo/comparacao.png')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
