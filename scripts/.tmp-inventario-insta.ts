/**
 * Leitura-só: compara o que existe no insta-automatico com o que o Studio tem.
 * Roda contra o banco do .env (PRODUÇÃO) — nenhuma escrita.
 */
import { db } from '../src/lib/db'

async function main() {
  const projects = await db.project.findMany({
    select: {
      id: true,
      name: true,
      logoUrl: true,
      brandStyleDescription: true,
      Logo: { select: { id: true, name: true, fileUrl: true, isProjectLogo: true } },
      brandDNA: {
        select: {
          toneOfVoice: true,
          contentRules: true,
          composition: true,
          visualStyle: true,
          photoDirection: true,
        },
      },
      anchorImages: { select: { sceneTag: true, label: true } },
    },
    orderBy: { id: 'asc' },
  })

  for (const p of projects) {
    const marcada = p.Logo.filter((l) => l.isProjectLogo)
    console.log(`\n### [${p.id}] ${p.name}`)
    console.log(`  logoUrl(Project): ${p.logoUrl ?? 'NULL'}`)
    console.log(`  logos: ${p.Logo.length} | marcada isProjectLogo: ${marcada.length}`)
    for (const l of p.Logo) {
      const arquivo = l.fileUrl.split('/').pop()?.split('?')[0]
      console.log(`    ${l.isProjectLogo ? '★' : ' '} ${l.name}  <- ${arquivo}`)
    }
    const dna = p.brandDNA
    console.log(
      `  DNA: ${
        dna
          ? Object.entries(dna)
              .map(([k, v]) => `${k}=${v ? String(v).length : 0}`)
              .join(' ')
          : 'AUSENTE'
      }`,
    )
    console.log(
      `  âncoras: ${p.anchorImages.length ? p.anchorImages.map((a) => a.sceneTag).join(', ') : 'nenhuma'}`,
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
