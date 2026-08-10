import { db } from '@/lib/db'
function layersOf(raw: unknown): any[] {
  let v = raw; let d = 0
  while (typeof v === 'string' && d < 3) { try { v = JSON.parse(v); d++ } catch { return [] } }
  return Array.isArray(v) ? v : []
}
async function main() {
  const pages = await db.page.findMany({ select: { id: true, name: true, createdAt: true, layers: true, Template: { select: { projectId: true, name: true } } } })
  let afetadas = 0
  const porProjeto = new Map<number, number>()
  for (const p of pages) {
    const temLh3 = layersOf(p.layers).some(
      (l: any) => typeof l.fileUrl === 'string' && /lh3\.googleusercontent\.com\/(drive-storage|.*=s\d+)/.test(l.fileUrl),
    )
    if (!temLh3) continue
    afetadas++
    porProjeto.set(p.Template.projectId, (porProjeto.get(p.Template.projectId) ?? 0) + 1)
  }
  console.log(`páginas com fileUrl lh3 (link expira): ${afetadas} de ${pages.length}`)
  for (const [pid, n] of [...porProjeto.entries()].sort((a, b) => a[0] - b[0])) console.log(`  projeto ${pid}: ${n}`)
  const posts = await db.socialPost.count({
    where: { status: { in: ['DRAFT', 'SCHEDULED'] }, pageId: { not: null }, renderStatus: 'PENDING' },
  })
  console.log(`posts na fila de render agora (contexto): ${posts}`)
}
main().finally(() => db.$disconnect())
