/**
 * E2E do carrossel modo IA (By Rock, 4 slides):
 *   capa (foto pura) + guia (slide 2, com copy) → confirma → slides 3 e 4 em
 *   PARALELO com a arte do guia como referência.
 *
 * Prova o que interessa: os slides seguintes saem com o mesmo look do guia.
 * Custa 4 gerações. Baixa as artes para conferência visual e limpa o banco.
 *
 * Rodar: npx tsx scripts/.tmp-test-carrossel-e2e.ts
 */
import { config } from 'dotenv'
config({ path: '.env' })
import * as fs from 'fs'
import { randomUUID } from 'crypto'

const OUT =
  '/private/tmp/claude-501/-Users-cirotrigo-Documents-Studio-Lagosta-v2/8a8a759e-c60e-4282-ad59-11aa4cdcc3a9/scratchpad'

const PROJECT_ID = 7
const FOTOS = {
  capa: '1uKKVhnL2E_H8pz3C67AC53mRXhLh0aVR',
  guia: '12UCCaqWwCRLgkYbZW3wkPtd2EEsItzox',
  slide3: '1uKKVhnL2E_H8pz3C67AC53mRXhLh0aVR',
  slide4: '12UCCaqWwCRLgkYbZW3wkPtd2EEsItzox',
}

async function main() {
  const { db } = await import('../src/lib/db')
  const { startArtGeneration } = await import('../src/lib/ai/creative-generation-service')
  const { processArtGenerationInBackground } = await import('../src/lib/ai/creative-generation-runner')

  const project = await db.project.findUnique({ where: { id: PROJECT_ID }, select: { userId: true } })
  const user = await db.user.findUnique({ where: { id: project!.userId }, select: { clerkId: true } })
  const clerkId = user!.clerkId
  const groupId = randomUUID()
  const total = 4
  console.log('grupo:', groupId)

  const gerar = async (
    slideOrder: number,
    copy: string[],
    driveFileId: string,
    guideGenerationId?: string,
  ) => {
    const s = await startArtGeneration({
      projectId: PROJECT_ID,
      track: 'arte',
      copy,
      formato: 'feed',
      referencias: [{ role: 'subject', driveFileId, label: `slide ${slideOrder}` }],
      carrossel: { groupId, slideOrder, totalSlides: total, guideGenerationId },
      actorClerkId: clerkId,
    })
    await processArtGenerationInBackground(s.runnerArgs!)
    const g = await db.generation.findUnique({
      where: { id: s.jobGenerationId },
      select: { status: true, resultUrl: true, fieldValues: true, slideOrder: true, carouselGroupId: true },
    })
    const fv = (g!.fieldValues ?? {}) as Record<string, unknown>
    console.log(
      `slide ${slideOrder}: ${g!.status} | texto ${fv.textCheck} | logo ${fv.logoComposta ? fv.logoCanto : 'não'} | refs ${JSON.stringify((fv.refsUsadas as { role: string }[] | undefined)?.map((r) => r.role))}`,
    )
    if (g!.status !== 'COMPLETED') {
      console.error('  erro:', fv.error)
      throw new Error(`slide ${slideOrder} falhou`)
    }
    return { id: s.jobGenerationId, url: g!.resultUrl! }
  }

  // 1. Capa: foto pura, SEM copy (o serviço recusa copy na capa)
  const capa = await gerar(1, [], FOTOS.capa)

  // 2. Guia: primeiro slide com texto — define o look da série
  const guia = await gerar(2, ['O QUE ROLA', 'na segunda do rock'], FOTOS.guia)

  // 3+4. Demais slides EM PARALELO, com a arte do guia como referência
  const t0 = Date.now()
  const [s3, s4] = await Promise.all([
    gerar(3, ['CHOPE EM DOBRO', 'até 20h'], FOTOS.slide3, guia.id),
    gerar(4, ['MÚSICA AO VIVO', 'a partir das 21h'], FOTOS.slide4, guia.id),
  ])
  console.log(`slides 3 e 4 em paralelo: ${Math.round((Date.now() - t0) / 1000)}s (o dobro seria serial)`)

  // Confere o agrupamento no banco
  const doGrupo = await db.generation.findMany({
    where: { carouselGroupId: groupId },
    orderBy: { slideOrder: 'asc' },
    select: { slideOrder: true, authorName: true, resultUrl: true },
  })
  console.log('no banco:', doGrupo.map((g) => `${g.slideOrder}:${g.authorName}`).join(' '))

  for (const g of doGrupo) {
    const r = await fetch(g.resultUrl!)
    fs.writeFileSync(`${OUT}/carrossel-slide-${g.slideOrder}.jpg`, Buffer.from(await r.arrayBuffer()))
  }
  console.log('artes baixadas para carrossel-slide-N.jpg')

  await db.generation.deleteMany({ where: { carouselGroupId: groupId } })
  console.log('cleanup ok')
  console.log(JSON.stringify({ capa: capa.url, guia: guia.url, s3: s3.url, s4: s4.url }, null, 1))
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
