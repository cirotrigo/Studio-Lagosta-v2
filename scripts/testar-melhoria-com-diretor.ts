/**
 * Teste REAL da melhoria com o diretor de arte (F1–F5 do plano de 05/09/2026):
 * roda o MESMO caminho da produção — `startImprovement` (valida créditos, cria
 * a Generation PROCESSING) e `processImprovementInBackground` (planejador →
 * gpt-image → régua por visão → Blob → COMPLETED) — sem sessão Clerk e sem
 * passar pela fila, como o teste E2E de 30/07 fazia.
 *
 * ⚠️ ESCREVE NO BANCO DE PRODUÇÃO (uma Generation por rodada, na galeria do
 * cliente) e COBRA crédito da conta informada. É o teste que o Ciro pediu
 * ("pede para melhorar artes já prontas e depois solicite ajustes"): a arte
 * fica visível na galeria para ele julgar.
 *
 * Uso:
 *   npx tsx scripts/testar-melhoria-com-diretor.ts --gen=<id> --modo=redesenhar
 *   npx tsx scripts/testar-melhoria-com-diretor.ts --gen=<id> --modo=refinar --pedido="troque a frase X por Y"
 *   npx tsx scripts/testar-melhoria-com-diretor.ts --gen=<id> --modo=redesenhar --pedido="<direção de arte>"
 *   npx tsx scripts/testar-melhoria-com-diretor.ts --gen=<id> --modo=rediagramar --foto="<ajuste na foto>"
 * Opções: --clerk=<user_…> (padrão: o dono da Generation de origem), --tier=low|medium|high, --pasta=<dir>
 */
import 'dotenv/config'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { db } from '../src/lib/db'
import { startImprovement } from '../src/lib/ai/creative-improvement-service'
import { processImprovementInBackground } from '../src/lib/ai/creative-improvement-runner'
import { fetchImageSource } from '../src/lib/ai/fetch-image-source'
import type { ModoDaMelhoria } from '../src/lib/ai/modo-da-melhoria'

function arg(nome: string): string | undefined {
  const i = process.argv.findIndex((a) => a === `--${nome}` || a.startsWith(`--${nome}=`))
  if (i < 0) return undefined
  const a = process.argv[i]
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : process.argv[i + 1]
}

async function main() {
  const genId = arg('gen')
  if (!genId) throw new Error('--gen=<generationId> é obrigatório')
  const modo = (arg('modo') ?? undefined) as ModoDaMelhoria | undefined
  const pedido = arg('pedido') ?? ''
  const foto = arg('foto') ?? null
  const tier = arg('tier') as 'low' | 'medium' | 'high' | undefined
  const pasta = arg('pasta') ?? path.join(process.cwd(), '.tmp-medicao-estilo-chatgpt', 'testes-reais')
  await fs.mkdir(pasta, { recursive: true })

  const origem = await db.generation.findUnique({
    where: { id: genId },
    select: { id: true, projectId: true, projectName: true, createdBy: true, resultUrl: true, fieldValues: true, sourceGenerationId: true },
  })
  if (!origem) throw new Error('Generation não encontrada')
  const clerk = arg('clerk') ?? origem.createdBy
  if (!clerk || !clerk.startsWith('user_')) throw new Error(`createdBy da origem não é clerkId (${clerk}); passe --clerk=user_…`)

  console.log(`origem ${origem.id} · ${origem.projectName} · source=${((origem.fieldValues ?? {}) as { source?: string }).source ?? 'editor/export'} · melhoria=${!!origem.sourceGenerationId}`)
  console.log(`modo=${modo ?? '(padrão pela origem)'} · pedido="${pedido}" · foto=${foto ? `"${foto}"` : 'não'} · tier=${tier ?? '(padrão)'} · conta ${clerk}`)

  const started = await startImprovement({
    generationId: genId,
    userRequest: pedido,
    instrucaoImagem: foto,
    quality: tier,
    modo,
    actorClerkId: clerk,
    canal: 'claude-code',
  })
  if (!started.runnerArgs) throw new Error('startImprovement reaproveitou um job em andamento — espere ele terminar')
  console.log(`Generation da melhoria: ${started.jobGenerationId} (modo gravado: ${started.runnerArgs.modo}, tier ${started.runnerArgs.quality})`)

  const t0 = Date.now()
  await processImprovementInBackground(started.runnerArgs)
  const segs = Math.round((Date.now() - t0) / 1000)

  const feita = await db.generation.findUnique({
    where: { id: started.jobGenerationId },
    select: { status: true, resultUrl: true, fieldValues: true },
  })
  const fv = (feita?.fieldValues ?? {}) as Record<string, unknown>
  console.log(`\n${feita?.status} em ${segs}s · ${feita?.resultUrl ?? '(sem imagem)'}`)
  for (const k of ['modo', 'planejador', 'planejadorMs', 'planejadorTentativas', 'leitura', 'quality', 'regua', 'textCheck', 'textCheckReason', 'textoAMaisAlerta', 'textoAMaisAviso', 'numerosAlerta', 'copyAntes', 'textos', 'referenceCounts', 'errorMessage', 'error']) {
    if (fv[k] !== undefined) console.log(`  ${k}: ${JSON.stringify(fv[k]).slice(0, 600)}`)
  }
  if (typeof fv.prompt === 'string') {
    console.log(`\n--- PROMPT (${fv.prompt.length} chars) ---\n${fv.prompt}\n---`)
  }
  if (feita?.resultUrl) {
    const img = await fetchImageSource(feita.resultUrl)
    const arquivo = path.join(pasta, `${started.jobGenerationId}-${started.runnerArgs.modo}.jpg`)
    await fs.writeFile(arquivo, img.buffer)
    console.log(`arquivo: ${arquivo}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
