/**
 * Teste: o modelo consegue DESENHAR a logo oficial fielmente?
 *
 * Compara os dois modos na MESMA foto, mesma copy, mesmo projeto:
 *   A) logoMode 'compor' — o sharp cola o PNG oficial (fidelidade 100% por
 *      construção; serve de linha de base visual)
 *   B) logoMode 'modelo' — o arquivo vai como referência e o prompt manda
 *      reproduzir (é o caminho do insta-automatico)
 *
 * Projeto 7 (By Rock) de propósito: é a marca cuja logomarca o gpt-image
 * INVENTOU em 09/08 — palheta com "BY ROCK" em sans-serif, quando a real é uma
 * palheta com "By Rock" manuscrito. Se funcionar aqui, funciona.
 *
 * Custa 2 gerações (~50 créditos). Faz cleanup das duas Generations.
 * Rodar: npx tsx scripts/.tmp-teste-logo-pelo-modelo.ts
 */
import { config } from 'dotenv'
config({ path: '.env' })
import * as fs from 'fs'

const PROJECT_ID = 7
const OUT = '/tmp/teste-logo-modelo'

async function main() {
  const { db } = await import('../src/lib/db')
  const { startArtGeneration } = await import('../src/lib/ai/creative-generation-service')
  const { processArtGenerationInBackground } = await import('../src/lib/ai/creative-generation-runner')

  fs.mkdirSync(OUT, { recursive: true })

  const project = await db.project.findUnique({
    where: { id: PROJECT_ID },
    select: { id: true, name: true, userId: true },
  })
  if (!project) throw new Error(`projeto ${PROJECT_ID} não encontrado`)
  const user = await db.user.findUnique({ where: { id: project.userId }, select: { clerkId: true } })
  if (!user?.clerkId) throw new Error('dono sem clerkId')

  // Foto real do acervo do projeto — a mesma nos dois modos, para a única
  // variável ser o tratamento da logo.
  const subject = await db.generation.findFirst({
    where: {
      projectId: PROJECT_ID,
      status: 'COMPLETED',
      resultUrl: { contains: 'public.blob.vercel-storage.com' },
    },
    orderBy: { createdAt: 'desc' },
    select: { resultUrl: true },
  })
  if (!subject?.resultUrl) throw new Error('sem imagem no Blob para usar de subject')
  console.log('subject:', subject.resultUrl.slice(0, 95), '\n')

  const criados: string[] = []

  for (const modo of ['compor', 'modelo'] as const) {
    console.log(`\n${'='.repeat(60)}\nMODO: ${modo}\n${'='.repeat(60)}`)
    const started = await startArtGeneration({
      projectId: PROJECT_ID,
      track: 'arte',
      copy: ['SEGUNDA DO ROCK', 'a casa toca a noite inteira'],
      // `pedido` diferente por modo também serve para escapar do dedupe por
      // hash do pedido — senão a 2ª chamada devolveria a 1ª Generation.
      pedido: `peça de teste — modo de logo: ${modo}`,
      formato: 'feed',
      referencias: [{ role: 'subject', url: subject.resultUrl, label: 'foto do acervo' }],
      actorClerkId: user.clerkId,
    })
    if (!started.runnerArgs) throw new Error('sem runnerArgs')
    criados.push(started.jobGenerationId)

    const t0 = Date.now()
    await processArtGenerationInBackground({ ...started.runnerArgs, logoMode: modo })
    const secs = Math.round((Date.now() - t0) / 1000)

    const r = await db.generation.findUnique({
      where: { id: started.jobGenerationId },
      select: { status: true, resultUrl: true, fieldValues: true },
    })
    const fv = (r?.fieldValues ?? {}) as Record<string, unknown>
    console.log(
      `status ${r?.status} em ${secs}s | logoMode=${fv.logoMode} logoComposta=${fv.logoComposta} ` +
        `canto=${fv.logoCanto ?? '—'} contraste=${fv.logoContraste ?? '—'}`,
    )
    console.log(`refs: ${JSON.stringify(fv.refsUsadas)}`)
    console.log(`qa: ${fv.qaResumo ?? '—'} | textCheck: ${fv.textCheck}`)

    if (r?.resultUrl) {
      const res = await fetch(r.resultUrl)
      fs.writeFileSync(`${OUT}/${modo}.jpg`, Buffer.from(await res.arrayBuffer()))
      console.log(`arte salva: ${OUT}/${modo}.jpg`)
    } else {
      console.log('SEM resultUrl — erro:', String(fv.error).slice(0, 200))
    }
  }

  // Cleanup: teste não deixa lixo na galeria do By Rock.
  for (const id of criados) {
    await db.generation.delete({ where: { id } }).catch(() => {})
  }
  console.log(`\ncleanup: ${criados.length} Generation(s) removida(s)`)
  await db.$disconnect()
}

main().catch(async (e) => {
  console.error('erro:', e)
  process.exit(1)
})
