/**
 * Gera a prancha tipográfica (type-specimen) de cada cliente e grava os PNGs
 * num diretório local, para conferência a olho — a mesma prancha que a trilha
 * `arte` passa a enviar ao modelo como referência de letra.
 *
 * Somente leitura no banco; a escrita é só em disco.
 *
 * Uso: npx tsx scripts/gerar-pranchas-tipograficas.ts [dir-de-saida]
 *      (default: /tmp/pranchas-tipograficas)
 */

import * as fs from 'fs'
import * as path from 'path'
import { db } from '../src/lib/db'
import { loadBrandContext } from '../src/lib/brand/brand-context'
import { renderTypeSpecimen } from '../src/lib/ai/type-specimen'

async function main() {
  const outDir = process.argv[2] || '/tmp/pranchas-tipograficas'
  fs.mkdirSync(outDir, { recursive: true })

  const projetos = await db.project.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  })

  const semFonte: string[] = []
  for (const projeto of projetos) {
    const brand = await loadBrandContext(projeto.id)
    const prancha = await renderTypeSpecimen(brand).catch((error) => {
      console.error(`✗ ${projeto.name}: falhou —`, error)
      return null
    })
    if (!prancha) {
      semFonte.push(`${projeto.name} (id ${projeto.id})`)
      continue
    }
    const slug = projeto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const arquivo = path.join(outDir, `${projeto.id}-${slug}.png`)
    fs.writeFileSync(arquivo, prancha)
    console.log(`✓ ${projeto.name} → ${arquivo}`)
  }

  if (semFonte.length > 0) {
    console.log(
      `\nSem prancha (nenhuma fonte com arquivo registrado): ${semFonte.join(', ')}` +
        '\nEsses projetos seguem gerando arte sem a referência de alfabeto — cadastrar as fontes na aba Marca resolve.',
    )
  }
}

main().finally(() => db.$disconnect())
