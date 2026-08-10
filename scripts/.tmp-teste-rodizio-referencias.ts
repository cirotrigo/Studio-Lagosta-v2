/**
 * Testa o rodízio de referências de estilo SEM gerar arte nenhuma.
 * Marca 3 artes do By Rock, simula 5 escolhas + usos, confere que elas se
 * alternam, e desfaz tudo ao final.
 */
import { db } from '../src/lib/db'
import {
  definirReferenciaDeEstilo,
  escolherReferenciaDeEstilo,
  registrarUsoDaReferencia,
  listarReferenciasDeEstilo,
} from '../src/lib/ai/style-references'

const PROJECT_ID = 7

async function main() {
  const antes = await listarReferenciasDeEstilo(PROJECT_ID)
  if (antes.length > 0) {
    console.log(`⚠️ o projeto já tem ${antes.length} referência(s); o teste seria destrutivo. Abortando.`)
    return
  }

  const artes = await db.generation.findMany({
    where: { projectId: PROJECT_ID, status: 'COMPLETED', resultUrl: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { id: true },
  })
  if (artes.length < 3) throw new Error('preciso de 3 artes prontas para testar')

  for (const a of artes) await definirReferenciaDeEstilo(a.id, true)
  const rotulo = new Map(artes.map((a, i) => [a.id, `arte${i + 1}`]))
  console.log(`marcadas: ${artes.map((a) => rotulo.get(a.id)).join(', ')}\n`)

  console.log('simulando 5 gerações seguidas:')
  const sequencia: string[] = []
  for (let i = 1; i <= 5; i++) {
    const escolhida = await escolherReferenciaDeEstilo(PROJECT_ID)
    if (!escolhida) throw new Error('nenhuma referência escolhida')
    sequencia.push(rotulo.get(escolhida.generationId)!)
    console.log(`  geração ${i} → ${rotulo.get(escolhida.generationId)}${escolhida.inedita ? ' (inédita)' : ''}`)
    await registrarUsoDaReferencia(escolhida.generationId)
  }

  // O que se espera: as 3 saem uma vez cada antes de qualquer repetição, e
  // depois a ordem se mantém — é isso que evita "toda peça igual".
  const primeiras3 = new Set(sequencia.slice(0, 3))
  const ok = primeiras3.size === 3 && sequencia[3] === sequencia[0] && sequencia[4] === sequencia[1]
  console.log(`\nsequência: ${sequencia.join(' → ')}`)
  console.log(ok ? '✅ rodízio correto: as 3 alternam antes de repetir' : '❌ rodízio NÃO alternou como esperado')

  for (const a of artes) await definirReferenciaDeEstilo(a.id, false)
  const depois = await listarReferenciasDeEstilo(PROJECT_ID)
  console.log(`cleanup: ${depois.length} referência(s) restante(s)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
