/**
 * Validação da melhoria com o diretor de arte em TODOS os clientes (pedido do
 * Ciro, 05/09/2026): uma peça recente por projeto, melhorada pelo caminho REAL
 * (`startImprovement` + `processImprovementInBackground`), no modo que o
 * servidor escolhe pela origem. As artes ficam na galeria de cada cliente para
 * avaliação visual — não são apagadas.
 *
 * ⚠️ ESCREVE NO BANCO DE PRODUÇÃO e COBRA 25 créditos por peça da conta
 * informada. Custo OpenAI ~US$ 0,05 por peça (medium) ou ~0,01 (low), mais a
 * chamada do planejador (gpt-5.2, ~US$ 0,02).
 *
 * Escolha da peça por projeto: a Generation COMPLETED mais recente que não é
 * melhoria, não é da trilha `imagem` (foto de cena) e tem imagem no Blob —
 * preferindo uma com copy conhecida (fieldValues.textos/copy/slotValues).
 *
 * Uso:
 *   npx tsx scripts/validar-melhoria-na-carteira.ts                 # dry-run: lista a peça e o modo de cada cliente
 *   npx tsx scripts/validar-melhoria-na-carteira.ts --confirmar
 *   npx tsx scripts/validar-melhoria-na-carteira.ts --confirmar --projetos=1,2,3 --paralelo=3
 *   npx tsx scripts/validar-melhoria-na-carteira.ts --confirmar --modo=rediagramar
 */
import 'dotenv/config'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { db } from '../src/lib/db'
import { startImprovement } from '../src/lib/ai/creative-improvement-service'
import { processImprovementInBackground } from '../src/lib/ai/creative-improvement-runner'
import { fetchImageSource } from '../src/lib/ai/fetch-image-source'
import { modoPadraoDaMelhoria, type ModoDaMelhoria } from '../src/lib/ai/modo-da-melhoria'

const SAIDA = path.join(process.cwd(), '.tmp-medicao-estilo-chatgpt', 'carteira')
const CLERK_PADRAO = 'user_33lV8r06XupgO7K0lyLgoj1JJF3'

function arg(nome: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nome}=`))?.split('=')[1]
}

interface Escolha {
  projectId: number
  projectName: string
  generationId: string
  resultUrl: string
  source: string | null
  ehMelhoria: boolean
  modo: ModoDaMelhoria
  temCopy: boolean
}

async function escolherPeca(projectId: number, projectName: string, modoForcado?: ModoDaMelhoria): Promise<Escolha | null> {
  const candidatas = await db.generation.findMany({
    where: { projectId, status: 'COMPLETED', sourceGenerationId: null, resultUrl: { contains: 'public.blob.vercel-storage.com' } },
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: { id: true, resultUrl: true, fieldValues: true },
  })
  let melhor: Escolha | null = null
  for (const g of candidatas) {
    const fv = (g.fieldValues ?? {}) as Record<string, unknown>
    if (fv.track === 'imagem') continue
    if (fv.source === 'post-schedule' || fv.source === 'post-midia') continue
    const source = (fv.source as string | undefined) ?? null
    const copy = (fv.textos ?? fv.copy ?? fv.texts) as unknown
    const temCopy = Array.isArray(copy) && copy.length > 0
    const escolha: Escolha = {
      projectId,
      projectName,
      generationId: g.id,
      resultUrl: g.resultUrl!,
      source,
      ehMelhoria: false,
      modo: modoForcado ?? modoPadraoDaMelhoria({ source, ehMelhoria: false }),
      temCopy,
    }
    if (temCopy) return escolha
    melhor ??= escolha
  }
  return melhor
}

async function rodar(escolha: Escolha, clerk: string): Promise<string> {
  const t0 = Date.now()
  try {
    const started = await startImprovement({
      generationId: escolha.generationId,
      userRequest: '',
      modo: escolha.modo,
      actorClerkId: clerk,
      canal: 'claude-code',
    })
    if (!started.runnerArgs) return `${escolha.projectName}: já havia melhoria em andamento (${started.jobGenerationId})`
    await processImprovementInBackground(started.runnerArgs)
    const feita = await db.generation.findUnique({ where: { id: started.jobGenerationId }, select: { status: true, resultUrl: true, fieldValues: true } })
    const fv = (feita?.fieldValues ?? {}) as Record<string, unknown>
    if (feita?.resultUrl) {
      const img = await fetchImageSource(feita.resultUrl)
      await fs.writeFile(path.join(SAIDA, `${escolha.projectId}-${escolha.modo}-${started.jobGenerationId}.jpg`), img.buffer)
      const origem = await fetchImageSource(escolha.resultUrl)
      await fs.writeFile(path.join(SAIDA, `${escolha.projectId}-origem.jpg`), await sharp(origem.buffer).jpeg({ quality: 85 }).toBuffer())
    }
    const segs = Math.round((Date.now() - t0) / 1000)
    return [
      `${escolha.projectName} (${escolha.projectId}) · ${escolha.modo} · ${feita?.status} em ${segs}s`,
      `  origem ${escolha.generationId} (source=${escolha.source ?? 'editor/export'}) → ${started.jobGenerationId}`,
      `  planejador=${fv.planejador} (${fv.planejadorMs}ms, ${fv.planejadorTentativas ?? '-'} tent.) · tier=${fv.quality} · régua=${fv.regua} · texto=${fv.textCheck}${fv.textoAMaisAlerta ? ' · ALERTA: ' + String(fv.textoAMaisAlerta).slice(0, 120) : ''}${fv.numerosAlerta ? ' · números: ' + String(fv.numerosAlerta).slice(0, 80) : ''}${fv.error ? ' · ERRO: ' + String(fv.error).slice(0, 160) : ''}`,
      `  leitura: ${String(fv.leitura ?? '').slice(0, 300)}`,
    ].join('\n')
  } catch (e) {
    return `${escolha.projectName} (${escolha.projectId}) · ${escolha.modo} · FALHOU: ${e instanceof Error ? e.message : String(e)}`
  }
}

async function main() {
  const confirmar = process.argv.includes('--confirmar')
  const clerk = arg('clerk') ?? CLERK_PADRAO
  const paralelo = Number(arg('paralelo') ?? 3)
  const modoForcado = arg('modo') as ModoDaMelhoria | undefined
  const filtro = arg('projetos')?.split(',').map(Number)
  await fs.mkdir(SAIDA, { recursive: true })

  const projetos = await db.project.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } })
  const escolhas: Escolha[] = []
  for (const p of projetos) {
    if (filtro && !filtro.includes(p.id)) continue
    const e = await escolherPeca(p.id, p.name, modoForcado)
    if (!e) {
      console.log(`${p.name} (${p.id}): sem peça elegível`)
      continue
    }
    escolhas.push(e)
    console.log(`${p.name} (${p.id}): ${e.generationId} · source=${e.source ?? 'editor/export'} · copy=${e.temCopy ? 'sim' : 'visão'} → modo ${e.modo}`)
  }
  console.log(`\n${escolhas.length} peças · ${escolhas.length * 25} créditos · ~US$ ${(escolhas.length * 0.07).toFixed(2)}`)
  if (!confirmar) {
    console.log('dry-run — rode com --confirmar para melhorar de verdade.')
    return
  }

  const resultados: string[] = []
  const fila = [...escolhas]
  await Promise.all(
    Array.from({ length: Math.min(paralelo, fila.length) }, async () => {
      while (fila.length) {
        const e = fila.shift()!
        const r = await rodar(e, clerk)
        console.log('\n' + r)
        resultados.push(r)
      }
    }),
  )
  await fs.writeFile(path.join(SAIDA, 'RESULTADO.txt'), resultados.join('\n\n') + '\n')
  console.log(`\nresultados em ${SAIDA}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
