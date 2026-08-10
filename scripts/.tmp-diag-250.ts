import { registerProjectFonts } from '@/lib/posts/register-project-fonts'

async function main() {
  await registerProjectFonts(7)
  const { createCanvas } = await import('@napi-rs/canvas')
  const ctx: any = createCanvas(1, 1).getContext('2d')
  for (const font of [
    '77px "Metrisch Bold"',
    '250 60px "Metrisch ExtraLight"',
    '250 60px Metrisch ExtraLight',
    '200 60px "Metrisch ExtraLight"',
    '60px "Metrisch ExtraLight"',
  ]) {
    ctx.font = '10px sans-serif' // reset conhecido
    ctx.font = font
    const m = ctx.measureText('de domingo')
    console.log(`set="${font}" → lido="${ctx.font}" width=${Math.round(m.width)} asc=${Math.round(m.actualBoundingBoxAscent)} desc=${Math.round(m.actualBoundingBoxDescent)}`)
  }
}
main()
