/**
 * Mede o REPOST — SOMENTE LEITURA.
 *
 * Duas perguntas, as mesmas que embasaram o desenho de 05/09/2026:
 *
 * 1. O hábito: quanto do que vai ao ar é repost (arte que já tinha sido
 *    publicada), com que intervalo, e se cai no mesmo dia da semana e na
 *    mesma faixa de horário (contra a linha de base de dois posts ao acaso do
 *    mesmo cliente). Largada medida em 05/09/2026: 2.605 reposts em 8.649
 *    publicados (31%); dia+faixa em 49% dos reposts × 8% ao acaso; mediana
 *    13 dias; 2.595 dos 2.605 são story.
 * 2. A ferramenta: das propostas da faixa "Repostar" (`LearningSignal tipo
 *    'repost'`), quantas viraram post com uma arte proposta (aceita-como-veio)
 *    e quantas foram ignoradas em favor de outra mídia (trocada). O
 *    denominador é o que foi EMITIDO — por isso a proposta é registrada na
 *    emissão, com chave por (projeto, dia, hora, safra).
 *
 * Uso:
 *   npx tsx scripts/medir-repost.ts             # 90 dias
 *   npx tsx scripts/medir-repost.ts --dias=30
 *   npx tsx scripts/medir-repost.ts --projeto=3
 *
 * Não escreve nada, não gasta crédito.
 */
import { db } from '../src/lib/db'
import { chaveDaImagem } from '../src/lib/posts/repostar'

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]
const DIAS = Number(arg('dias') ?? 90)
const PROJETO = arg('projeto') ? Number(arg('projeto')) : undefined
const brt = (d: Date) => new Date(d.getTime() - 3 * 3600_000)

async function main() {
  const desde = new Date(Date.now() - DIAS * 86_400_000)
  const projetos = new Map((await db.project.findMany({ select: { id: true, name: true } })).map((p) => [p.id, p.name]))

  // ── 1. O hábito ─────────────────────────────────────────────────────────
  const posts = await db.socialPost.findMany({
    where: { status: 'POSTED', ...(PROJETO ? { projectId: PROJETO } : {}) },
    select: { projectId: true, postType: true, generationId: true, mediaUrls: true, sentAt: true, scheduledDatetime: true, createdAt: true },
  })
  const quando = (p: (typeof posts)[number]) => brt(p.sentAt ?? p.scheduledDatetime ?? p.createdAt)
  const porArte = new Map<string, typeof posts>()
  for (const p of posts) {
    const c = p.mediaUrls?.[0] ? chaveDaImagem(p.mediaUrls[0]) : p.generationId
    if (!c) continue
    const a = porArte.get(c) ?? []
    a.push(p)
    porArte.set(c, a)
  }
  const naJanela = posts.filter((p) => quando(p) >= brt(desde))
  let reposts = 0, mesmoDia = 0, mesmaFaixa = 0, ambos = 0
  const intervalos: number[] = []
  const porTipo: Record<string, number> = {}
  for (const lista of porArte.values()) {
    const ord = [...lista].sort((a, b) => quando(a).getTime() - quando(b).getTime())
    for (let i = 1; i < ord.length; i++) {
      const b = quando(ord[i])
      if (b < brt(desde)) continue
      const a = quando(ord[i - 1])
      reposts++
      porTipo[ord[i].postType] = (porTipo[ord[i].postType] ?? 0) + 1
      intervalos.push((b.getTime() - a.getTime()) / 86_400_000)
      const md = a.getUTCDay() === b.getUTCDay()
      const mf = Math.abs(a.getUTCHours() - b.getUTCHours()) <= 2
      if (md) mesmoDia++
      if (mf) mesmaFaixa++
      if (md && mf) ambos++
    }
  }
  // linha de base: pares ao acaso do mesmo cliente
  const porProjeto = new Map<number, Date[]>()
  for (const p of naJanela) { const a = porProjeto.get(p.projectId) ?? []; a.push(quando(p)); porProjeto.set(p.projectId, a) }
  let acasoN = 0, acasoAmbos = 0
  for (const ds of porProjeto.values()) {
    for (let i = 0; i < 2000 && ds.length > 1; i++) {
      const a = ds[Math.floor(Math.random() * ds.length)], b = ds[Math.floor(Math.random() * ds.length)]
      if (a === b) continue
      acasoN++
      if (a.getUTCDay() === b.getUTCDay() && Math.abs(a.getUTCHours() - b.getUTCHours()) <= 2) acasoAmbos++
    }
  }
  intervalos.sort((x, y) => x - y)
  const mediana = intervalos.length ? intervalos[Math.floor(intervalos.length / 2)] : 0
  const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}%` : '—')

  console.log(`O HÁBITO — últimos ${DIAS} dias${PROJETO ? ` (${projetos.get(PROJETO)})` : ''}`)
  console.log(`  publicados: ${naJanela.length} | reposts: ${reposts} (${pct(reposts, naJanela.length)}) | por tipo: ${JSON.stringify(porTipo)}`)
  console.log(`  mediana do intervalo: ${mediana.toFixed(0)} dias | <7d: ${intervalos.filter((d) => d < 7).length} | <14d: ${intervalos.filter((d) => d < 14).length}`)
  console.log(`  mesmo dia da semana: ${pct(mesmoDia, reposts)} | mesma faixa ±2h: ${pct(mesmaFaixa, reposts)} | dia+faixa: ${pct(ambos, reposts)} (ao acaso: ${pct(acasoAmbos, acasoN)})`)

  // ── 2. A ferramenta ─────────────────────────────────────────────────────
  const sinais = await db.learningSignal.findMany({
    where: { tipo: 'repost', createdAt: { gte: desde }, ...(PROJETO ? { projectId: PROJETO } : {}) },
    select: { projectId: true, desfecho: true, sugeridoEm: true, postId: true, sugerido: true },
  })
  const emitidas = sinais.filter((s) => s.sugeridoEm)
  const conta = (d: string) => emitidas.filter((s) => s.desfecho === d).length
  const chat = emitidas.filter((s) => (s.sugerido as { superficie?: string } | null)?.superficie === 'chat').length
  console.log(`\nA FERRAMENTA — propostas da faixa "Repostar" nos últimos ${DIAS} dias`)
  console.log(`  emitidas: ${emitidas.length} (${chat} pelo chat) | aceita-como-veio: ${conta('aceita-como-veio')} | trocada: ${conta('trocada')} | expirada: ${conta('expirada')} | pendente: ${emitidas.filter((s) => !s.desfecho).length}`)
  const decididas = conta('aceita-como-veio') + conta('trocada')
  console.log(`  taxa de aceitação (entre as decididas): ${pct(conta('aceita-como-veio'), decididas)}`)
  const porCliente = new Map<number, { e: number; a: number }>()
  for (const s of emitidas) {
    const l = porCliente.get(s.projectId) ?? { e: 0, a: 0 }
    l.e++
    if (s.desfecho === 'aceita-como-veio') l.a++
    porCliente.set(s.projectId, l)
  }
  for (const [id, l] of [...porCliente.entries()].sort((a, b) => b[1].e - a[1].e)) {
    console.log(`    ${(projetos.get(id) ?? String(id)).slice(0, 26).padEnd(26)} emitidas ${String(l.e).padStart(4)} · aceitas ${String(l.a).padStart(3)}`)
  }
  if (emitidas.length === 0) console.log('  (nenhuma proposta ainda — a faixa nasceu em 06/09/2026)')

  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
