/**
 * Leitura-só: recupera os carrosséis gerados e imprime, por slide, o prompt
 * que foi REALMENTE enviado (Generation.fieldValues.prompt) — é o registro
 * atômico da run. Serve para confirmar por DADO, não por hipótese, se o
 * elemento gráfico do guia chega ao prompt dos slides irmãos.
 */
import { db } from '../src/lib/db'

async function main() {
  const grupos = await db.generation.findMany({
    where: { carouselGroupId: { not: null } },
    select: {
      id: true,
      carouselGroupId: true,
      slideOrder: true,
      status: true,
      projectId: true,
      resultUrl: true,
      createdAt: true,
      fieldValues: true,
    },
    orderBy: [{ carouselGroupId: 'asc' }, { slideOrder: 'asc' }],
  })

  if (grupos.length === 0) {
    console.log('nenhuma Generation com carouselGroupId neste banco')
    return
  }

  const porGrupo = new Map<string, typeof grupos>()
  for (const g of grupos) {
    const k = g.carouselGroupId!
    if (!porGrupo.has(k)) porGrupo.set(k, [] as never)
    porGrupo.get(k)!.push(g)
  }

  console.log(`grupos: ${porGrupo.size} | slides: ${grupos.length}\n`)

  for (const [groupId, slides] of porGrupo) {
    console.log('='.repeat(78))
    console.log(`GRUPO ${groupId} — projeto ${slides[0].projectId} — ${slides[0].createdAt.toISOString()}`)
    for (const s of slides) {
      const fv = (s.fieldValues ?? {}) as Record<string, unknown>
      const prompt = typeof fv.prompt === 'string' ? fv.prompt : ''
      const refs = fv.refs
      console.log(`\n--- slide ${s.slideOrder} [${s.status}] gen#${s.id}`)
      console.log(`    resultUrl: ${s.resultUrl ? 'sim' : 'NÃO'}`)
      console.log(`    refs: ${JSON.stringify(refs)}`)
      console.log(`    prompt: ${prompt.length} chars`)
      const tem = (t: string) => (prompt.toLowerCase().includes(t) ? 'SIM' : 'não')
      console.log(
        `    LOOK SPINE=${tem('look spine')}  guia-decodificado=${tem('o que o guia faz')}  ` +
          `onda=${tem('onda')}  elemento=${tem('elemento')}`,
      )
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
