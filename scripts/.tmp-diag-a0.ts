import { db } from '@/lib/db'
import { checkTextGeometry } from '@/lib/creatives/text-geometry'
import { createServerTextBoxMeasurer } from '@/lib/creatives/server-text-measurer'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'
import { parseLayers } from '@/lib/creatives/arte-rapida'

async function main() {
  await registerProjectFonts(7)
  const measure = await createServerTextBoxMeasurer()
  const page = await db.page.findUniqueOrThrow({ where: { id: 'cmhz1mkkt0001lg04btppiwqp' }, select: { layers: true, width: true, height: true } })
  const { issues, metricas } = checkTextGeometry(parseLayers(page.layers), { width: page.width, height: page.height }, measure)
  for (const m of metricas) {
    console.log(`${m.name}: box[y=${m.box.y} h=${Math.round(m.box.height)}] glyphs[${Math.round(m.glyphTop)}..${Math.round(m.glyphBottom)}] fs=${m.fontSize} lineBox=${Math.round(m.lineBox)} linhas=${m.lineCount} autoExpand=${m.autoExpand}`)
  }
  console.log('\nISSUES:')
  for (const i of issues) console.log(`- [${i.tipo}] ${i.detalhe} (px=${i.px})`)
}
main().finally(() => db.$disconnect())
