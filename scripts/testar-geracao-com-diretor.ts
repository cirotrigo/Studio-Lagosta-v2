/**
 * Teste REAL da GERAÇÃO de arte (trilha `arte`, peça avulsa) com o diretor de
 * arte (F6 do plano de 05/09/2026): REPETE uma geração recente — mesma foto,
 * mesma copy, mesmo formato, mesmo pedido — pelo caminho de produção
 * (`startArtGeneration` + `processArtGenerationInBackground`), agora com o
 * planejador escrevendo o prompt. A peça nova fica na galeria, ao lado da
 * antiga, para comparação visual.
 *
 * ⚠️ ESCREVE NO BANCO DE PRODUÇÃO e COBRA 25 créditos por peça. Custo OpenAI
 * ~US$ 0,01 (low) a 0,05 (medium) + ~0,02 do planejador.
 *
 * Uso:
 *   npx tsx scripts/testar-geracao-com-diretor.ts --gen=<id da arte-ia a repetir>
 *   npx tsx scripts/testar-geracao-com-diretor.ts --gen=<id> --pedido="<direção de arte>" --tier=medium
 */
import 'dotenv/config'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { db } from '../src/lib/db'
import { startArtGeneration } from '../src/lib/ai/creative-generation-service'
import { processArtGenerationInBackground, type ArtGenerationReference } from '../src/lib/ai/creative-generation-runner'
import { fetchImageSource } from '../src/lib/ai/fetch-image-source'

function arg(nome: string): string | undefined {
  const i = process.argv.findIndex((a) => a === `--${nome}` || a.startsWith(`--${nome}=`))
  if (i < 0) return undefined
  const a = process.argv[i]
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : process.argv[i + 1]
}

async function main() {
  const genId = arg('gen')
  if (!genId) throw new Error('--gen=<generationId> é obrigatório')
  const pasta = arg('pasta') ?? path.join(process.cwd(), '.tmp-medicao-estilo-chatgpt', 'testes-reais')
  await fs.mkdir(pasta, { recursive: true })

  const antiga = await db.generation.findUnique({
    where: { id: genId },
    select: { id: true, projectId: true, projectName: true, createdBy: true, resultUrl: true, fieldValues: true },
  })
  if (!antiga) throw new Error('Generation não encontrada')
  const fv = (antiga.fieldValues ?? {}) as Record<string, unknown>
  if (fv.source !== 'arte-ia' || fv.track !== 'arte') throw new Error(`a origem precisa ser arte-ia/arte (é ${fv.source}/${fv.track})`)
  const slotValues = (fv.slotValues ?? {}) as Record<string, string>
  const copy = Object.keys(slotValues)
    .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))
    .map((k) => slotValues[k])
  const referencias = ((fv.referencias ?? []) as ArtGenerationReference[]).filter((r) => r && r.role)
  const formato = (fv.formato as 'story' | 'feed' | 'quadrado') ?? 'story'
  const pedido = arg('pedido') ?? (typeof fv.pedido === 'string' ? fv.pedido : '')
  const clerk = arg('clerk') ?? antiga.createdBy
  if (!clerk?.startsWith('user_')) throw new Error(`createdBy não é clerkId (${clerk}); passe --clerk=user_…`)

  console.log(`repetindo ${antiga.id} · ${antiga.projectName} · ${formato} · copy=${JSON.stringify(copy)} · refs=${referencias.map((r) => r.role).join(',')}`)
  console.log(`pedido="${pedido.slice(0, 200)}"`)

  const started = await startArtGeneration({
    projectId: antiga.projectId,
    track: 'arte',
    copy,
    pedido,
    formato,
    referencias,
    qualidade: arg('tier') as 'low' | 'medium' | 'high' | undefined,
    actorClerkId: clerk,
    canal: 'claude-code',
  })
  if (!started.runnerArgs) throw new Error(`caiu no dedupe (${started.jobGenerationId}) — espere a geração em andamento terminar`)
  console.log(`Generation nova: ${started.jobGenerationId} · ${started.creditosCobrados} créditos`)

  const t0 = Date.now()
  await processArtGenerationInBackground(started.runnerArgs)
  const segs = Math.round((Date.now() - t0) / 1000)
  const nova = await db.generation.findUnique({ where: { id: started.jobGenerationId }, select: { status: true, resultUrl: true, fieldValues: true } })
  const nfv = (nova?.fieldValues ?? {}) as Record<string, unknown>
  console.log(`\n${nova?.status} em ${segs}s · ${nova?.resultUrl ?? '(sem imagem)'}`)
  for (const k of ['planejador', 'planejadorMs', 'planejadorTentativas', 'leitura', 'quality', 'qualidade', 'textCheck', 'textCheckAlert', 'numerosAlerta', 'vazamentoAlerta', 'logoComposta', 'error']) {
    if (nfv[k] !== undefined) console.log(`  ${k}: ${JSON.stringify(nfv[k]).slice(0, 500)}`)
  }
  if (typeof nfv.prompt === 'string') console.log(`\n--- PROMPT (${nfv.prompt.length} chars) ---\n${nfv.prompt}\n---`)
  if (nova?.resultUrl) {
    const img = await fetchImageSource(nova.resultUrl)
    const arquivo = path.join(pasta, `geracao-${started.jobGenerationId}.jpg`)
    await fs.writeFile(arquivo, img.buffer)
    if (antiga.resultUrl) {
      const ant = await fetchImageSource(antiga.resultUrl)
      await fs.writeFile(path.join(pasta, `geracao-${started.jobGenerationId}-ANTES.jpg`), ant.buffer)
    }
    console.log(`arquivo: ${arquivo}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
