import { db } from '@/lib/db'
import { convertPageToDesignData } from '@/lib/posts/page-to-design-data'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'

async function main() {
  const page = await db.page.findUniqueOrThrow({ where: { id: 'cms9v08yn0001jm04oz3hzj80' } })
  const designData = convertPageToDesignData({
    id: page.id, name: page.name, width: page.width, height: page.height,
    layers: page.layers, background: page.background,
  })
  await registerProjectFonts(7)
  const { CanvasRenderer } = await import('@/lib/canvas-renderer')
  const renderer = new CanvasRenderer(designData.canvas.width, designData.canvas.height)
  const buffer = await renderer.renderDesign(designData, {})
  const fs = await import('node:fs')
  fs.writeFileSync('/private/tmp/claude-501/-Users-cirotrigo-Documents-Studio-Lagosta-v2/e3f82999-0603-4b2b-893f-5cd63f90d14d/scratchpad/domingo-local.png', buffer)
  // tinta nas regiões dos dois textos sumidos
  const sharp = (await import('sharp')).default
  for (const [nome, box] of [
    ['de domingo', { left: 320, top: 1534, width: 455, height: 84 }],
    ['rodapé', { left: 249, top: 1775, width: 583, height: 42 }],
  ] as const) {
    const raw = await sharp(buffer).extract(box).greyscale().raw().toBuffer()
    let claros = 0
    for (const px of raw) if (px > 180) claros++
    console.log(`${nome}: ${claros} px claros na região (texto branco esperado)`)
  }
}
main().finally(() => db.$disconnect())
