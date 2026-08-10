import { db } from '@/lib/db'

function layersOf(raw: unknown): any[] {
  let v = raw; let d = 0
  while (typeof v === 'string' && d < 3) { try { v = JSON.parse(v); d++ } catch { return [] } }
  return Array.isArray(v) ? v : []
}
function pesosQuebrados(layers: any[]): Set<number> {
  const set = new Set<number>()
  for (const l of layers) {
    if (l.type !== 'text') continue
    const w = l.style?.fontWeight
    const n = typeof w === 'string' ? Number(w) : w
    if (typeof n === 'number' && Number.isFinite(n) && n % 100 !== 0) set.add(n)
  }
  return set
}

async function main() {
  const pages = await db.page.findMany({ select: { id: true, layers: true, Template: { select: { projectId: true } } } })
  const porProjeto = new Map<number, { pages: number; pesos: Set<number> }>()
  const pagesAfetadas = new Set<string>()
  for (const p of pages) {
    const pesos = pesosQuebrados(layersOf(p.layers))
    if (pesos.size === 0) continue
    pagesAfetadas.add(p.id)
    const cur = porProjeto.get(p.Template.projectId) ?? { pages: 0, pesos: new Set() }
    cur.pages++
    pesos.forEach((x) => cur.pesos.add(x))
    porProjeto.set(p.Template.projectId, cur)
  }
  console.log('Páginas com peso quebrado por projeto:')
  for (const [pid, info] of [...porProjeto.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  projeto ${pid}: ${info.pages} páginas, pesos ${[...info.pesos].join(', ')}`)
  }
  console.log(`TOTAL páginas afetadas: ${pagesAfetadas.size} de ${pages.length}`)

  // Posts vivos cuja arte veio do render de uma página afetada
  const posts = await db.socialPost.findMany({
    where: {
      status: { in: ['DRAFT', 'SCHEDULED'] },
      pageId: { in: [...pagesAfetadas] },
    },
    select: { id: true, projectId: true, status: true, renderStatus: true, scheduledDatetime: true, pageId: true },
    orderBy: { scheduledDatetime: 'asc' },
  })
  console.log(`\nPosts DRAFT/SCHEDULED com página afetada: ${posts.length}`)
  for (const p of posts) {
    console.log(`  ${p.id} proj=${p.projectId} ${p.status}/${p.renderStatus} ${p.scheduledDatetime?.toISOString()}`)
  }
}
main().finally(() => db.$disconnect())
