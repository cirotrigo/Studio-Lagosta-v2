import { db } from '@/lib/db'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'

async function main() {
  const page = await db.page.findUniqueOrThrow({ where: { id: 'cmhz1mkkt0001lg04btppiwqp' }, select: { layers: true } })
  let v: any = page.layers; let d = 0
  while (typeof v === 'string' && d < 3) { v = JSON.parse(v); d++ }
  for (const l of v) {
    if (l.type !== 'text') continue
    console.log(`--- ${l.name}`)
    console.log('style:', JSON.stringify(l.style))
    console.log('textboxConfig:', JSON.stringify(l.textboxConfig))
  }
  await registerProjectFonts(7)
  const { createCanvas } = await import('@napi-rs/canvas')
  const ctx: any = createCanvas(1, 1).getContext('2d')
  for (const [label, font] of [
    ['ExtraLight 60 plain', '60px Metrisch ExtraLight'],
    ['ExtraLight 60 aspas', '60px "Metrisch ExtraLight"'],
    ['ExtraLight 300 60', '300 60px "Metrisch ExtraLight"'],
    ['Bold 60', '60px "Metrisch Bold"'],
  ] as const) {
    ctx.letterSpacing = '0px'
    ctx.font = font
    console.log(`${label}: "de domingo" = ${Math.round(ctx.measureText('de domingo').width)}px | ctx.font lido = ${ctx.font}`)
  }
}
main().finally(() => db.$disconnect())
