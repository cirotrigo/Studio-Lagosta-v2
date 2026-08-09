/** Smoke do anchor sheet: cria, lista, injeção automática e remove (projeto 8, sem rastro). */
import { config } from 'dotenv'
config({ path: '.env' })

async function main() {
  const { db } = await import('../src/lib/db')
  const { definirAncora, listarAncoras, removerAncora, ancoraAmbienteAutomatica } = await import(
    '../src/lib/ai/anchor-images'
  )
  const gen = await db.generation.findFirst({
    where: { projectId: 8, status: 'COMPLETED', resultUrl: { contains: 'public.blob.vercel-storage.com' } },
    select: { resultUrl: true },
  })
  if (!gen?.resultUrl) throw new Error('sem imagem de teste no projeto 8')

  const a = await definirAncora({ projectId: 8, sceneTag: 'Ambiente', url: gen.resultUrl, label: 'teste smoke' })
  console.log('criada:', a.id, '| tag normalizada:', a.sceneTag)

  const lista = await listarAncoras(8)
  console.log('listadas:', lista.length)

  const auto = await ancoraAmbienteAutomatica(8)
  console.log('auto-ambiente:', auto?.id === a.id ? 'encontrou a criada ✓' : `inesperado: ${auto?.id}`)

  await removerAncora(8, a.id)
  console.log('removida. restantes:', (await listarAncoras(8)).length)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
