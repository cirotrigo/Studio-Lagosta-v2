/**
 * Lê as peças aprovadas de um cliente (ou de todos) por visão e grava o
 * estilo observado em `BrandDNA.estiloDasReferencias` — a assinatura real da
 * marca, que o diretor de arte passa a receber e o manual gerado desenha.
 * Ver `src/lib/ai/analise-de-referencias.ts`.
 *
 * Dry-run por padrão: mostra as referências colhidas e o estilo lido, sem
 * gravar. `--confirmar` grava. Custo: uma chamada de visão (gpt-5.2, até 8
 * imagens) por cliente — centavos.
 *
 * Uso:
 *   npx tsx scripts/analisar-referencias-de-estilo.ts --projeto 6
 *   npx tsx scripts/analisar-referencias-de-estilo.ts --projeto 6 --urls "https://…,https://…" --confirmar
 *   npx tsx scripts/analisar-referencias-de-estilo.ts --todos --exceto 6 --confirmar
 */
import 'dotenv/config'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { db } from '../src/lib/db'
import { analisarReferenciasDeEstilo, salvarEstiloDasReferencias } from '../src/lib/ai/analise-de-referencias'
import { formatarEstiloParaPrompt } from '../src/lib/brand/estilo-das-referencias'

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const flag = (nome: string) => process.argv.includes(`--${nome}`)

async function main() {
  const confirmar = flag('confirmar')
  const urls = (arg('urls') ?? '').split(',').map((u) => u.trim()).filter(Boolean)
  const saida = path.join(process.cwd(), '.tmp-medicao-estilo-chatgpt', 'estilo')
  await fs.mkdir(saida, { recursive: true })

  // `--exceto 6,9`: pula clientes já analisados com URLs à mão (a rodada
  // `--todos` não recebe URLs e sobrescreveria aquela análise).
  const exceto = new Set((arg('exceto') ?? '').split(',').map((v) => Number(v.trim())).filter((n) => Number.isFinite(n) && n > 0))
  const projetos = flag('todos')
    ? (await db.project.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } })).filter((p) => !exceto.has(p.id))
    : await db.project.findMany({ where: { id: Number(arg('projeto')) }, select: { id: true, name: true } })
  if (projetos.length === 0) throw new Error('informe --projeto <id> ou --todos')

  for (const p of projetos) {
    console.log(`\n══ ${p.name} (${p.id}) ══`)
    try {
      const { estilo, referencias } = await analisarReferenciasDeEstilo(p.id, {
        urlsManuais: projetos.length === 1 ? urls : [],
        nomeDaMarca: p.name,
      })
      console.log(`referências: ${referencias.map((r) => `${r.origem}${r.generationId ? `:${r.generationId}` : ''}`).join(', ')}`)
      console.log(formatarEstiloParaPrompt(estilo))
      await fs.writeFile(path.join(saida, `${p.id}.json`), JSON.stringify(estilo, null, 2))
      if (confirmar) {
        await salvarEstiloDasReferencias(p.id, estilo)
        console.log('→ gravado em BrandDNA.estiloDasReferencias')
      }
    } catch (e) {
      console.log(`sem análise: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  if (!confirmar) console.log('\ndry-run — nada gravado. Rode com --confirmar para gravar.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
