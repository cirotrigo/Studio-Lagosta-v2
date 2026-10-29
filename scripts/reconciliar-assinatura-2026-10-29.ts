/**
 * RECONCILIAÇÃO das margens cadastradas por marca em `Project.assinatura.geometria` com os números de 29/10/2026
 * (decisão do owner): Story laterais 64 · topo 160 · base 160; Feed 4:5 laterais 64 · topo 72 · base 72. Topo e base
 * IGUAIS. Quadrado não foi decidido: não é tocado. `gapEntreBlocos`, `escalaDeFonte` e tudo o mais da assinatura
 * ficam como estão.
 *
 * 🔴 É escrita de DADO em PRODUÇÃO (`@/lib/db` usa o `.env`). Por padrão é SIMULAÇÃO (dry-run): imprime o diff por
 * projeto e não grava. Só grava com `--gravar`, e só depois do ok EXPLÍCITO do Ciro no chat sobre o diff impresso.
 *   npx tsx scripts/reconciliar-assinatura-2026-10-29.ts            # simulação
 *   npx tsx scripts/reconciliar-assinatura-2026-10-29.ts --gravar   # grava (com o ok do Ciro)
 */
import 'dotenv/config'

import { db } from '@/lib/db'
import { GEOMETRIA_PADRAO } from '@/lib/compositor/geometria'

const ALVO = {
  story: { margemH: GEOMETRIA_PADRAO.story.margemH, safeTopo: GEOMETRIA_PADRAO.story.safeTopo, safeRodape: GEOMETRIA_PADRAO.story.safeRodape },
  feed: { margemH: GEOMETRIA_PADRAO.feed.margemH, safeTopo: GEOMETRIA_PADRAO.feed.safeTopo, safeRodape: GEOMETRIA_PADRAO.feed.safeRodape },
} as const

type Geo = Record<string, unknown>

async function main() {
  const gravar = process.argv.includes('--gravar')
  const projetos = await db.project.findMany({ where: { assinatura: { not: null } }, select: { id: true, name: true, assinatura: true }, orderBy: { id: 'asc' } })
  console.log(`${gravar ? 'GRAVANDO' : 'SIMULAÇÃO'} — ${projetos.length} projetos com assinatura`)
  let mudam = 0
  for (const p of projetos) {
    const assinatura = (p.assinatura && typeof p.assinatura === 'object' ? p.assinatura : {}) as Record<string, unknown>
    const geometria = (assinatura.geometria && typeof assinatura.geometria === 'object' ? assinatura.geometria : {}) as Record<string, Geo>
    const nova: Record<string, Geo> = { ...geometria }
    const linhas: string[] = []
    for (const f of ['story', 'feed'] as const) {
      const atual = (geometria[f] && typeof geometria[f] === 'object' ? geometria[f] : {}) as Geo
      const alvo = ALVO[f]
      const diff = (Object.keys(alvo) as Array<keyof typeof alvo>).filter((k) => atual[k] !== alvo[k])
      if (diff.length === 0) continue
      nova[f] = { ...atual, ...alvo }
      linhas.push(`  ${f}: ${diff.map((k) => `${k} ${String(atual[k] ?? '(padrão)')} → ${alvo[k]}`).join(', ')}`)
    }
    if (linhas.length === 0) {
      console.log(`#${p.id} ${p.name}: já está nos números de 29/10`)
      continue
    }
    mudam++
    console.log(`#${p.id} ${p.name}:\n${linhas.join('\n')}`)
    if (gravar) {
      await db.project.update({ where: { id: p.id }, data: { assinatura: { ...assinatura, geometria: nova } } })
      console.log('  gravado')
    }
  }
  console.log(`${mudam} projeto(s) ${gravar ? 'gravados' : 'mudariam'}; Quadrado intocado; gap/escala intocados.`)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
