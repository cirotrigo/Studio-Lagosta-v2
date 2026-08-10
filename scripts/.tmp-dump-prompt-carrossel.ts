/**
 * Leitura-só: dump do registro atômico de uma Generation de carrossel.
 */
import * as fs from 'fs'
import { db } from '../src/lib/db'

async function main() {
  const gens = await db.generation.findMany({
    where: { carouselGroupId: { not: null } },
    select: { id: true, slideOrder: true, status: true, fieldValues: true, carouselGroupId: true },
    orderBy: [{ createdAt: 'desc' }],
    take: 8,
  })

  for (const g of gens) {
    const fv = (g.fieldValues ?? {}) as Record<string, unknown>
    console.log(`\n### gen#${g.id} slide ${g.slideOrder} [${g.status}] grupo ${g.carouselGroupId?.slice(0, 8)}`)
    console.log('   chaves de fieldValues:', Object.keys(fv).join(', '))
    for (const [k, v] of Object.entries(fv)) {
      if (k === 'prompt') continue
      const s = typeof v === 'string' ? v : JSON.stringify(v)
      console.log(`   ${k} = ${s?.slice(0, 200)}`)
    }
    const prompt = typeof fv.prompt === 'string' ? fv.prompt : ''
    if (prompt) {
      const file = `/tmp/prompt-${g.slideOrder}-${g.id.slice(-6)}.txt`
      fs.writeFileSync(file, prompt)
      console.log(`   prompt salvo em ${file} (${prompt.length} chars)`)
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
