/**
 * Regera a MESMA arte do teste anterior (By Rock, mesma copy e mesmas fotos)
 * agora com a logo composta pelo sistema, para comparação direta.
 */
import { config } from 'dotenv'
config({ path: '.env' })
import * as fs from 'fs'

const OUT =
  '/private/tmp/claude-501/-Users-cirotrigo-Documents-Studio-Lagosta-v2/8a8a759e-c60e-4282-ad59-11aa4cdcc3a9/scratchpad'

async function main() {
  const { db } = await import('../src/lib/db')
  const { loadBrandContext } = await import('../src/lib/brand/brand-context')
  const { startArtGeneration } = await import('../src/lib/ai/creative-generation-service')
  const { processArtGenerationInBackground } = await import('../src/lib/ai/creative-generation-runner')

  // Conferência 1: o loader agora acha a logo na tabela Logo
  const brand = await loadBrandContext(7)
  console.log('logoUrl resolvida:', brand?.logoUrl ?? 'AINDA NULL ❌')
  if (!brand?.logoUrl) throw new Error('fallback da logo não funcionou')

  const project = await db.project.findUnique({ where: { id: 7 }, select: { userId: true } })
  const user = await db.user.findUnique({ where: { id: project!.userId }, select: { clerkId: true } })

  const started = await startArtGeneration({
    projectId: 7,
    track: 'arte',
    copy: ['SEGUNDA ROCK', 'HAPPY HOUR', 'chope em dobro até 20h'],
    formato: 'story',
    referencias: [
      { role: 'subject', driveFileId: '1uKKVhnL2E_H8pz3C67AC53mRXhLh0aVR', label: 'prato' },
      { role: 'anchor-ambient', driveFileId: '12UCCaqWwCRLgkYbZW3wkPtd2EEsItzox', label: 'ambiente' },
    ],
    actorClerkId: user!.clerkId,
  })
  console.log('job:', started.jobGenerationId)
  await processArtGenerationInBackground(started.runnerArgs!)

  const g = await db.generation.findUnique({
    where: { id: started.jobGenerationId },
    select: { status: true, resultUrl: true, fieldValues: true },
  })
  const fv = (g!.fieldValues ?? {}) as Record<string, unknown>
  console.log('status:', g!.status, '| textCheck:', fv.textCheck)
  console.log('logoComposta:', fv.logoComposta, '| canto:', fv.logoCanto ?? '—', '| erro:', fv.logoErro ?? '—')
  console.log('refs:', JSON.stringify(fv.refsUsadas))
  console.log('url:', g!.resultUrl)

  if (g!.resultUrl) {
    const r = await fetch(g!.resultUrl)
    fs.writeFileSync(`${OUT}/arte-com-logo.jpg`, Buffer.from(await r.arrayBuffer()))
    console.log('baixada para arte-com-logo.jpg')
  }
  await db.generation.delete({ where: { id: started.jobGenerationId } })
  console.log('cleanup ok')
  await db.$disconnect()
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
