/**
 * Limpeza do incidente da fila COMPOR de 04/09/2026 (Espeto Gaúcho, projeto 6).
 *
 * O que aconteceu: `comporPeca` não entregava ao persist a Generation que a
 * fila tinha criado, então cada peça de `compor-leva` nasceu em DUAS linhas —
 * a da fila, PROCESSING para sempre, e uma COMPLETED nova. Depois disso uma
 * re-execução LOCAL do mesmo plano gerou mais 20 COMPLETED (03:08–03:14 UTC),
 * com as Pages delas na pasta da semana 07/09. As que VALEM são as 20
 * COMPLETED do cron (02:54–02:56 UTC), que estão ligadas aos itens do plano.
 *
 * O que este script faz, DRY-RUN por padrão (`--confirmar` apaga):
 *
 *  (A) Generation PROCESSING do compositor na janela da fila, SEM item de
 *      plano nem post apontando para ela → apaga a Generation e o
 *      GenerationJob dela (não há Page: a peça nunca foi gravada nela).
 *  (B) Generation COMPLETED do compositor na janela da re-execução, SEM item
 *      de plano nem post apontando para ela → apaga a Page (se nenhum post a
 *      usa) e a Generation.
 *
 * Linha referenciada por `ItemDePlano.generationId` ou `SocialPost.generationId`
 * NUNCA é tocada, mesmo dentro da janela — é a rede que protege as 20 válidas.
 *
 * ⚠️ Lê o `.env`, que é PRODUÇÃO. É deliberado: a limpeza é lá. Só rode com
 *    `--confirmar` depois de o Ciro olhar a lista do dry-run.
 *
 * Uso:
 *   npx tsx scripts/limpar-compor-duplicado-2026-09-04.ts                # lista
 *   npx tsx scripts/limpar-compor-duplicado-2026-09-04.ts --confirmar    # apaga
 *   opções: --projeto 6 --fila-de <iso> --fila-ate <iso> --dup-de <iso> --dup-ate <iso>
 */

import { db } from '@/lib/db'

const argv = process.argv.slice(2)
const confirmar = argv.includes('--confirmar')
function opcao(nome: string, padrao: string): string {
  const i = argv.indexOf(`--${nome}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : padrao
}

const projectId = Number(opcao('projeto', '6'))
const filaDe = new Date(opcao('fila-de', '2026-09-04T02:50:00.000Z'))
const filaAte = new Date(opcao('fila-ate', '2026-09-04T02:58:00.000Z'))
const dupDe = new Date(opcao('dup-de', '2026-09-04T03:05:00.000Z'))
const dupAte = new Date(opcao('dup-ate', '2026-09-04T03:20:00.000Z'))

interface Linha {
  id: string
  status: string
  createdAt: Date
  fieldValues: unknown
}

function nomeDaPeca(fv: unknown): string {
  const f = (fv && typeof fv === 'object' ? fv : {}) as Record<string, unknown>
  const spec = (f.spec && typeof f.spec === 'object' ? f.spec : {}) as Record<string, unknown>
  return String(spec.nome ?? spec.tema ?? '—')
}

function pageIdDe(fv: unknown): string | null {
  const f = (fv && typeof fv === 'object' ? fv : {}) as Record<string, unknown>
  return typeof f.pageId === 'string' ? f.pageId : null
}

async function referencias(generationId: string): Promise<string[]> {
  const [itens, posts] = await Promise.all([
    db.itemDePlano.findMany({ where: { generationId }, select: { id: true } }),
    db.socialPost.findMany({ where: { generationId }, select: { id: true } }),
  ])
  return [...itens.map((i) => `item ${i.id}`), ...posts.map((p) => `post ${p.id}`)]
}

async function main() {
  console.log(confirmar ? '### APAGANDO' : '### DRY-RUN (use --confirmar para apagar)')
  console.log(`projeto ${projectId} · fila ${filaDe.toISOString()}–${filaAte.toISOString()} · duplicatas ${dupDe.toISOString()}–${dupAte.toISOString()}\n`)

  const base = { projectId, authorName: 'compositor' as const }
  const select = { id: true, status: true, createdAt: true, fieldValues: true }
  const [abertas, duplicatas] = await Promise.all([
    db.generation.findMany({ where: { ...base, status: 'PROCESSING', createdAt: { gte: filaDe, lt: filaAte } }, select, orderBy: { createdAt: 'asc' } }) as Promise<Linha[]>,
    db.generation.findMany({ where: { ...base, status: 'COMPLETED', createdAt: { gte: dupDe, lt: dupAte } }, select, orderBy: { createdAt: 'asc' } }) as Promise<Linha[]>,
  ])

  let apagadas = 0
  let preservadas = 0

  console.log(`(A) Generations da fila ainda PROCESSING: ${abertas.length}`)
  for (const g of abertas) {
    const refs = await referencias(g.id)
    const job = await db.generationJob.findUnique({ where: { generationId: g.id }, select: { id: true, status: true, lastError: true } })
    const rotulo = `${g.id}  ${g.createdAt.toISOString()}  ${nomeDaPeca(g.fieldValues)}  job=${job ? `${job.status}${job.lastError ? ` (${job.lastError.slice(0, 60)})` : ''}` : 'nenhum'}`
    if (refs.length > 0) {
      preservadas++
      console.log(`  PRESERVA  ${rotulo}  ← referenciada por ${refs.join(', ')}`)
      continue
    }
    console.log(`  apaga     ${rotulo}`)
    if (!confirmar) continue
    await db.$transaction(async (tx) => {
      if (job) await tx.generationJob.delete({ where: { id: job.id } })
      await tx.generation.delete({ where: { id: g.id } })
    })
    apagadas++
  }

  console.log(`\n(B) Generations COMPLETED da re-execução: ${duplicatas.length}`)
  for (const g of duplicatas) {
    const refs = await referencias(g.id)
    const pageId = pageIdDe(g.fieldValues)
    const postsDaPagina = pageId ? await db.socialPost.count({ where: { pageId } }) : 0
    const rotulo = `${g.id}  ${g.createdAt.toISOString()}  ${nomeDaPeca(g.fieldValues)}  page=${pageId ?? '—'}`
    if (refs.length > 0) {
      preservadas++
      console.log(`  PRESERVA  ${rotulo}  ← referenciada por ${refs.join(', ')}`)
      continue
    }
    if (postsDaPagina > 0) {
      preservadas++
      console.log(`  PRESERVA  ${rotulo}  ← a página está em ${postsDaPagina} post(s)`)
      continue
    }
    console.log(`  apaga     ${rotulo}`)
    if (!confirmar) continue
    await db.$transaction(async (tx) => {
      if (pageId) await tx.page.deleteMany({ where: { id: pageId, isTemplate: false } })
      await tx.generation.delete({ where: { id: g.id } })
    })
    apagadas++
  }

  console.log(`\n${confirmar ? 'apagadas' : 'seriam apagadas'}: ${apagadas || abertas.length + duplicatas.length - preservadas} · preservadas: ${preservadas}`)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
