/**
 * KPI da sugestão de fotos — SOMENTE LEITURA.
 *
 * É a medição VIVA do plano docs/PLANO-2026-08-29-SUGESTAO-DE-FOTOS.md
 * (§ "Validação e KPI"): nenhuma instrumentação nova, só lê o que a captura já
 * grava (`LearningSignal` tipo 'foto' + `PhotoUsage`). Promovido do
 * `.tmp-analise-sugestao-de-fotos.ts` que produziu o diagnóstico do plano.
 *
 * OS DOIS NÚMEROS NOMEADOS DO KPI — referência medida em 29/08/2026, antes de
 * qualquer melhoria de ranking (`acervo-v1`, rodízio puro):
 *
 *   - taxa de aceita-como-veio = aceitas / (aceitas + trocadas)   → 12%
 *   - % de trocas fora do top-10 (a foto usada não estava entre as
 *     10 propostas registradas)                                   → 53%
 *
 * A meta da F1+F2 é dobrar a aceitação; rode antes e depois de cada mudança de
 * ranking e compare com a referência. As taxas saem em duas janelas: todo o
 * histórico e últimos 30 dias (em 29/08 as duas coincidiam — a captura nasceu
 * em 11/08).
 *
 * Mede também: desfechos por janela, posição da foto usada nas trocadas,
 * tamanho das listas devolvidas, PhotoUsage por origem/projeto (o combustível
 * do rodízio) e buscas registradas por projeto (30d).
 *
 * USO
 *   npx tsx scripts/medir-sugestao-de-fotos.ts          # relatório legível
 *   npx tsx scripts/medir-sugestao-de-fotos.ts --json   # a mesma medição em JSON
 */
import { db } from '../src/lib/db'

const emJson = process.argv.includes('--json')

/** As propostas registradas guardam o top-10 da lista (`PROPOSTAS_REGISTRADAS`). */
const TOPO_REGISTRADO = 10

interface Proposta {
  topo?: string
  total?: number
  criterios?: { theme?: string | null }
  propostas?: Array<{ posicao: number; driveFileId: string }>
}

interface TaxaAceitacao {
  aceitas: number
  trocadas: number
  /** aceitas / (aceitas + trocadas), em %, 1 casa. `null` sem denominador. */
  pct: number | null
}

interface TrocasForaDoTop10 {
  /** Trocadas com `escolhido.driveFileId` e lista de propostas registrada. */
  avaliaveis: number
  fora: number
  /** fora / avaliaveis, em %, 1 casa. `null` sem denominador. */
  pct: number | null
  /** Trocadas sem escolhido ou sem lista registrada — fora da conta. */
  naoAvaliaveis: number
}

function pct(numerador: number, denominador: number): number | null {
  if (denominador === 0) return null
  return Math.round((numerador / denominador) * 1000) / 10
}

function taxaAceitacao(desfechos: Record<string, number>): TaxaAceitacao {
  const aceitas = desfechos['aceita-como-veio'] ?? 0
  const trocadas = desfechos['trocada'] ?? 0
  return { aceitas, trocadas, pct: pct(aceitas, aceitas + trocadas) }
}

function fmtPct(valor: number | null): string {
  return valor === null ? '—' : `${valor.toFixed(1)}%`
}

async function desfechosPorJanela(desde?: Date): Promise<Record<string, number>> {
  const linhas = await db.learningSignal.groupBy({
    by: ['desfecho'],
    where: { tipo: 'foto', ...(desde ? { sugeridoEm: { gte: desde } } : {}) },
    _count: { _all: true },
  })
  const resultado: Record<string, number> = {}
  for (const l of linhas) resultado[l.desfecho ?? 'pendente'] = l._count._all
  return resultado
}

async function main() {
  const desde30 = new Date(Date.now() - 30 * 86_400_000)

  // 1. Desfechos dos sinais de foto, nas duas janelas
  const [historico, ultimos30d] = await Promise.all([
    desfechosPorJanela(),
    desfechosPorJanela(desde30),
  ])

  // 2. Nas trocadas: posição da foto realmente usada dentro da lista proposta
  const trocadas = await db.learningSignal.findMany({
    where: { tipo: 'foto', desfecho: 'trocada' },
    select: { sugerido: true, escolhido: true, sugeridoEm: true },
  })

  const contagemPosicoes = new Map<number, number>()
  const foraPorJanela = { historico: 0, ultimos30d: 0 }
  const avaliaveisPorJanela = { historico: 0, ultimos30d: 0 }
  let naoAvaliaveis = 0
  let naoAvaliaveis30d = 0
  for (const t of trocadas) {
    const s = t.sugerido as Proposta
    const escolhidoId = (t.escolhido as { driveFileId?: string } | null)?.driveFileId
    const recente = !!t.sugeridoEm && t.sugeridoEm >= desde30
    if (!escolhidoId || !Array.isArray(s?.propostas)) {
      naoAvaliaveis++
      if (recente) naoAvaliaveis30d++
      continue
    }
    const p = s.propostas.find((x) => x.driveFileId === escolhidoId)
    // Fora do top-10: a foto usada não está entre as propostas registradas
    // (a lista guarda só o top-10) — ou, defensivamente, veio além da 10ª.
    const fora = !p || p.posicao > TOPO_REGISTRADO
    if (p) contagemPosicoes.set(p.posicao, (contagemPosicoes.get(p.posicao) ?? 0) + 1)
    avaliaveisPorJanela.historico++
    if (fora) foraPorJanela.historico++
    if (recente) {
      avaliaveisPorJanela.ultimos30d++
      if (fora) foraPorJanela.ultimos30d++
    }
  }

  const trocasForaDoTop10 = {
    historico: {
      avaliaveis: avaliaveisPorJanela.historico,
      fora: foraPorJanela.historico,
      pct: pct(foraPorJanela.historico, avaliaveisPorJanela.historico),
      naoAvaliaveis,
    } satisfies TrocasForaDoTop10,
    ultimos30d: {
      avaliaveis: avaliaveisPorJanela.ultimos30d,
      fora: foraPorJanela.ultimos30d,
      pct: pct(foraPorJanela.ultimos30d, avaliaveisPorJanela.ultimos30d),
      naoAvaliaveis: naoAvaliaveis30d,
    } satisfies TrocasForaDoTop10,
  }

  // 2b. Tamanho típico das listas propostas (últimas 200 buscas)
  const amostra = await db.learningSignal.findMany({
    where: { tipo: 'foto' },
    orderBy: { sugeridoEm: 'desc' },
    take: 200,
    select: { sugerido: true },
  })
  const totais = amostra
    .map((a) => (a.sugerido as Proposta)?.total)
    .filter((t): t is number => typeof t === 'number')
  const comTema = amostra.filter((a) => (a.sugerido as Proposta)?.criterios?.theme).length
  const ordenados = [...totais].sort((a, b) => a - b)
  const listas = ordenados.length
    ? {
        amostra: amostra.length,
        mediana: ordenados[Math.floor(ordenados.length / 2)],
        min: ordenados[0],
        max: ordenados[ordenados.length - 1],
        comTema,
      }
    : null

  // 3. PhotoUsage — combustível do rodízio
  const porOrigemLinhas = await db.photoUsage.groupBy({ by: ['origem'], _count: { _all: true } })
  const porOrigem: Record<string, number> = {}
  for (const l of porOrigemLinhas) porOrigem[l.origem] = l._count._all

  const nomes = await db.project.findMany({ select: { id: true, name: true } })
  const nome = new Map(nomes.map((p) => [p.id, p.name]))

  const usosPorProjeto = await db.photoUsage.groupBy({ by: ['projectId'], _count: { _all: true } })
  const photoUsagePorProjeto: Array<{
    projectId: number
    projeto: string
    usos: number
    fotosDistintas: number
  }> = []
  for (const l of usosPorProjeto.sort((a, b) => b._count._all - a._count._all)) {
    const distintas = await db.photoUsage.findMany({
      where: { projectId: l.projectId },
      distinct: ['driveFileId'],
      select: { driveFileId: true },
    })
    photoUsagePorProjeto.push({
      projectId: l.projectId,
      projeto: nome.get(l.projectId) ?? `projeto ${l.projectId}`,
      usos: l._count._all,
      fotosDistintas: distintas.length,
    })
  }

  // 4. Buscas de foto registradas por projeto (30d)
  const sinaisPorProjeto = await db.learningSignal.groupBy({
    by: ['projectId'],
    where: { tipo: 'foto', sugeridoEm: { gte: desde30 } },
    _count: { _all: true },
  })
  const buscas30dPorProjeto = sinaisPorProjeto
    .sort((a, b) => b._count._all - a._count._all)
    .map((l) => ({
      projectId: l.projectId,
      projeto: nome.get(l.projectId) ?? `projeto ${l.projectId}`,
      buscas: l._count._all,
    }))

  const medicao = {
    geradoEm: new Date().toISOString(),
    referencia: {
      medidoEm: '2026-08-29',
      taxaAceitaComoVeioPct: 12,
      trocasForaDoTop10Pct: 53,
    },
    kpi: {
      taxaAceitaComoVeio: {
        historico: taxaAceitacao(historico),
        ultimos30d: taxaAceitacao(ultimos30d),
      },
      trocasForaDoTop10,
    },
    desfechos: { historico, ultimos30d },
    trocadas: {
      total: trocadas.length,
      posicoes: Object.fromEntries(
        [...contagemPosicoes.entries()].sort((a, b) => a[0] - b[0]),
      ) as Record<string, number>,
      foraDaListaRegistrada: foraPorJanela.historico,
    },
    ultimas200Buscas: listas,
    photoUsage: { porOrigem, porProjeto: photoUsagePorProjeto },
    buscas30dPorProjeto,
  }

  if (emJson) {
    console.log(JSON.stringify(medicao, null, 2))
    await db.$disconnect()
    return
  }

  // ── Relatório legível ──────────────────────────────────────────────────
  console.log('── KPI da sugestão de fotos (referência 29/08/2026: 12% e 53%) ──')
  const kh = medicao.kpi.taxaAceitaComoVeio.historico
  const k30 = medicao.kpi.taxaAceitaComoVeio.ultimos30d
  console.log(
    `  taxa de aceita-como-veio:  histórico ${fmtPct(kh.pct)} (${kh.aceitas} de ${kh.aceitas + kh.trocadas})  |  30d ${fmtPct(k30.pct)} (${k30.aceitas} de ${k30.aceitas + k30.trocadas})`,
  )
  const fh = trocasForaDoTop10.historico
  const f30 = trocasForaDoTop10.ultimos30d
  console.log(
    `  % de trocas fora do top-10: histórico ${fmtPct(fh.pct)} (${fh.fora} de ${fh.avaliaveis})  |  30d ${fmtPct(f30.pct)} (${f30.fora} de ${f30.avaliaveis})`,
  )
  if (fh.naoAvaliaveis > 0) {
    console.log(`  (${fh.naoAvaliaveis} trocada(s) sem escolhido/lista registrada — fora da conta)`)
  }

  console.log('\n── Sinais tipo FOTO por desfecho (todo o histórico) ──')
  for (const [d, n] of Object.entries(historico).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${d === 'pendente' ? '(pendente)' : d}: ${n}`)
  }

  console.log('\n── Últimos 30 dias ──')
  for (const [d, n] of Object.entries(ultimos30d).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${d === 'pendente' ? '(pendente)' : d}: ${n}`)
  }

  console.log(`\n── Trocadas: onde estava a foto realmente usada (${trocadas.length} sinais) ──`)
  for (const [pos, n] of [...contagemPosicoes.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  posição ${pos}: ${n}`)
  }
  if (foraPorJanela.historico > 0) {
    console.log(`  fora do top-10 registrado: ${foraPorJanela.historico}`)
  }

  if (listas) {
    console.log(`\n── Últimas 200 buscas: tamanho da lista devolvida ──`)
    console.log(`  mediana: ${listas.mediana}, min: ${listas.min}, max: ${listas.max}`)
    console.log(`  com tema: ${listas.comTema} de ${listas.amostra}`)
  }

  console.log('\n── PhotoUsage por origem ──')
  for (const [origem, n] of Object.entries(porOrigem)) console.log(`  ${origem}: ${n}`)

  console.log('\n── PhotoUsage por projeto (total de registros / fotos distintas) ──')
  for (const l of photoUsagePorProjeto) {
    console.log(`  ${l.projeto}: ${l.usos} usos, ${l.fotosDistintas} fotos distintas`)
  }

  console.log('\n── Buscas de foto registradas por projeto (30d) ──')
  for (const l of buscas30dPorProjeto) console.log(`  ${l.projeto}: ${l.buscas}`)

  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
