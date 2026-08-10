import { db } from '@/lib/db'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'

async function main() {
  const fonts = await db.customFont.findMany({ where: { projectId: 7 }, select: { name: true, fontFamily: true, fileUrl: true } })
  console.log('CustomFont rows:', fonts.length)
  await registerProjectFonts(7)
  const { GlobalFonts, createCanvas } = await import('@napi-rs/canvas')
  const familias = new Set((GlobalFonts.families as Array<{ family: string }>).map((f) => f.family))
  for (const f of fonts) {
    console.log(`${familias.has(f.fontFamily) ? 'OK ' : 'FALTA'} | ${f.fontFamily} | ${f.fileUrl.split('/').pop()}`)
  }
  // desenha com a família problemática e conta pixels de tinta
  for (const fam of ['Metrisch ExtraLight', 'Metrisch Bold', 'Metrisch Medium']) {
    const c = createCanvas(400, 80)
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.font = `40px ${fam}`
    ctx.fillText('de domingo', 10, 50)
    const data = ctx.getImageData(0, 0, 400, 80).data
    let ink = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) ink++
    console.log(`desenho com "${fam}": ${ink} px de tinta`)
  }
}
main().finally(() => db.$disconnect())
