/** Confere a última Generation arte-ia no banco de DEV (o que o dev server usa). */
import { config } from 'dotenv'
config({ path: '.env.development.local' })
config({ path: '.env' })

async function main() {
  const { PrismaClient } = await import('../prisma/generated/client')
  const db = new PrismaClient()
  const gens = await db.generation.findMany({
    where: { projectId: 7, templateName: { startsWith: 'Arte IA' } },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { id: true, status: true, resultUrl: true, fieldValues: true, createdAt: true },
  })
  for (const g of gens) {
    const fv = (g.fieldValues ?? {}) as Record<string, unknown>
    console.log('—', g.id, g.status, g.createdAt.toISOString().slice(11, 19))
    console.log('  track:', fv.track, '| formato:', fv.formato, '| copy:', JSON.stringify(fv.slotValues))
    console.log('  refs:', JSON.stringify(fv.referencias))
    console.log('  refsUsadas:', JSON.stringify(fv.refsUsadas ?? null))
    console.log('  textCheck:', fv.textCheck ?? '(ainda não)', '| erro:', fv.error ?? '—')
    console.log('  resultUrl:', g.resultUrl ?? '(gerando)')
  }
  if (gens.length === 0) console.log('nenhuma Generation arte-ia no projeto 7 (dev)')
  await db.$disconnect()
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
