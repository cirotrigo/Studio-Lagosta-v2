/**
 * Roda o REVISOR DA ARTE nas últimas peças reais do compositor de cada cliente
 * — é a calibração dos limites de `revisao/regras.ts` e a prova do revisor
 * contra peças que a equipe já viu.
 *
 *   npx tsx scripts/revisar-pecas-reais.ts [--projetos 1,2] [--limite 4] [--dias 10] [--sem-visao] [--saida <pasta>]
 *
 * NÃO GRAVA NADA no banco: `revisarArte` só lê, mede e renderiza em memória.
 * A visão custa uma chamada do modelo por peça (centavos); `--sem-visao` mede
 * só o código. Na saída ficam, por peça, a miniatura com as marcas (.jpg) e o
 * relatório (.json), e no terminal o placar por regra — regra que acusa em
 * quase toda peça boa é limite para recalibrar, não defeito da carteira.
 */
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'

import { db } from '@/lib/db'
import { revisarArte } from '@/lib/creatives/revisao/revisar-arte'

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

async function main() {
  const limite = Number(argumento('--limite') ?? 4)
  const dias = Number(argumento('--dias') ?? 10)
  const semVisao = process.argv.includes('--sem-visao')
  const saida = argumento('--saida') ?? '.tmp-revisor'
  const ids = argumento('--projetos')?.split(',').map((x) => Number(x.trim())).filter(Number.isFinite) ?? null
  await fs.mkdir(saida, { recursive: true })

  const desde = new Date(Date.now() - dias * 86_400_000)
  const projetos = await db.project.findMany({
    where: ids ? { id: { in: ids } } : {},
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  })

  const placar = new Map<string, { problema: number; aviso: number; sugestao: number }>()
  const linhas: string[] = []
  let pecas = 0
  let ajustes = 0
  let falhas = 0

  for (const projeto of projetos) {
    const geracoes = await db.generation.findMany({
      where: {
        projectId: projeto.id,
        createdAt: { gte: desde },
        status: 'COMPLETED',
        fieldValues: { path: ['source'], equals: 'compositor' },
      },
      orderBy: { createdAt: 'desc' },
      take: limite * 5,
      select: { fieldValues: true },
    })
    const paginas = [
      ...new Set(
        geracoes
          .map((g) => (g.fieldValues as Record<string, unknown> | null)?.pageId)
          .filter((x): x is string => typeof x === 'string'),
      ),
    ].slice(0, limite)
    if (paginas.length === 0) continue

    for (const pageId of paginas) {
      try {
        const r = await revisarArte({ projectId: projeto.id, pageId, visao: !semVisao, previa: true })
        pecas++
        ajustes += r.relatorio.ajustes.length
        const base = path.join(saida, `${projeto.id}-${pageId}`)
        if (r.previa) await fs.writeFile(`${base}.jpg`, r.previa)
        await fs.writeFile(
          `${base}.json`,
          JSON.stringify({ pagina: r.pagina, versao: r.versao, visao: r.visao, referencia: r.referencia, ms: r.ms, ...r.relatorio }, null, 2),
        )
        for (const a of r.relatorio.achados) {
          const chave = a.regra === 'visao' ? `visao:${a.evidencia.problema}` : a.regra
          const conta = placar.get(chave) ?? { problema: 0, aviso: 0, sugestao: 0 }
          conta[a.severidade]++
          placar.set(chave, conta)
        }
        const resumo = r.relatorio.achados.map((a) => `${a.regra === 'visao' ? `visao:${a.evidencia.problema}` : a.regra}(${a.severidade[0]})`).join(' ')
        linhas.push(`${projeto.name.padEnd(22).slice(0, 22)} ${r.pagina.slice(0, 40).padEnd(40)} ${String(Math.round(r.ms / 1000)).padStart(3)}s visão:${r.visao.estado.padEnd(9)} ${resumo || '—'}`)
        console.log(linhas[linhas.length - 1])
      } catch (erro) {
        falhas++
        console.warn(`[${projeto.name}] ${pageId}: ${erro instanceof Error ? erro.message : erro}`)
      }
    }
  }

  console.log(`\n${pecas} peças revisadas, ${ajustes} ajustes propostos. Placar por regra (problema/aviso/sugestão):`)
  for (const [regra, c] of [...placar.entries()].sort((a, b) => b[1].problema + b[1].aviso + b[1].sugestao - (a[1].problema + a[1].aviso + a[1].sugestao))) {
    console.log(`  ${regra.padEnd(34)} ${c.problema}/${c.aviso}/${c.sugestao}`)
  }
  console.log(`\nMiniaturas e relatórios em ${saida}`)
  // Prova que não revisou nada, ou que perdeu peças no caminho, não pode sair
  // verde: o placar de uma amostra incompleta mente sobre a calibração.
  if (pecas === 0 || falhas > 0) {
    console.error(`\nProva incompleta: ${pecas} revisadas, ${falhas} com falha.`)
    process.exitCode = 1
  }
  await db.$disconnect()
}

main().catch(async (erro) => {
  console.error(erro)
  await db.$disconnect()
  process.exit(1)
})
