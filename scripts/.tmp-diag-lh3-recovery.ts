/**
 * Diagnóstico de recuperação das páginas com fileUrl lh3 (thumbnailLink morto).
 * Para cada página afetada, testa as fontes de recuperação do fileId do Drive:
 *   A) Generation.fieldValues.pageId === page.id (com driveImageId)
 *   B) Generation.fieldValues.imageUrl === fileUrl da camada (match exato)
 *   C) Generation.resultUrl === page.thumbnail (thumbnail ainda é o PNG do render)
 *   D) SocialPost.slotValues._driveImageId (posts ligados à página)
 * Também faz deep-scan por lh3 fora de fileUrl e conta posts DRAFT/SCHEDULED.
 * Só lê — não escreve nada.
 */
import { db } from '@/lib/db'

const LH3 = /lh3\.googleusercontent\.com\/(drive-storage|.*=s\d+)/

function parseLayers(raw: unknown): { layers: any[]; depth: number } {
  let v: unknown = raw
  let d = 0
  while (typeof v === 'string' && d < 3) {
    try {
      v = JSON.parse(v)
      d++
    } catch {
      return { layers: [], depth: -1 }
    }
  }
  return Array.isArray(v) ? { layers: v, depth: d } : { layers: [], depth: -1 }
}

/** Caminhos de propriedades string contendo lh3, fora de fileUrl direto. */
function deepScanLh3(obj: unknown, path = '', out: string[] = []): string[] {
  if (typeof obj === 'string') {
    if (LH3.test(obj)) out.push(path)
    return out
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => deepScanLh3(v, `${path}[${i}]`, out))
    return out
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) deepScanLh3(v, path ? `${path}.${k}` : k, out)
  }
  return out
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const arr = map.get(key)
  if (arr) arr.push(value)
  else map.set(key, [value])
}

async function main() {
  const pages = await db.page.findMany({
    select: {
      id: true,
      name: true,
      createdAt: true,
      isTemplate: true,
      thumbnail: true,
      layers: true,
      Template: { select: { id: true, projectId: true, name: true } },
      scheduledPosts: {
        select: { id: true, status: true, renderStatus: true, slotValues: true },
      },
    },
  })

  const affected: Array<{
    page: (typeof pages)[number]
    layers: any[]
    depth: number
    lh3Urls: string[]
    extraPaths: string[]
  }> = []

  for (const p of pages) {
    const { layers, depth } = parseLayers(p.layers)
    const lh3Urls = [
      ...new Set(
        layers
          .filter((l: any) => typeof l.fileUrl === 'string' && LH3.test(l.fileUrl))
          .map((l: any) => l.fileUrl as string),
      ),
    ]
    const allPaths = deepScanLh3(layers)
    const extraPaths = allPaths.filter((path) => !/\.fileUrl$/.test(path))
    if (lh3Urls.length === 0 && extraPaths.length === 0) continue
    affected.push({ page: p, layers, depth, lh3Urls, extraPaths })
  }

  console.log(`páginas afetadas: ${affected.length}`)

  const projectIds = [...new Set(affected.map((a) => a.page.Template.projectId))]
  const gens = await db.generation.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, projectId: true, resultUrl: true, fieldValues: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  console.log(`generations carregadas (projetos ${projectIds.join(', ')}): ${gens.length}`)

  const byPageId = new Map<string, typeof gens>()
  const byImageUrl = new Map<string, typeof gens>()
  const byResultUrl = new Map<string, typeof gens>()
  for (const g of gens) {
    const fv = (g.fieldValues ?? {}) as Record<string, unknown>
    if (typeof fv.pageId === 'string') push(byPageId, fv.pageId, g)
    if (typeof fv.imageUrl === 'string') push(byImageUrl, fv.imageUrl, g)
    if (typeof g.resultUrl === 'string' && g.resultUrl) push(byResultUrl, g.resultUrl, g)
  }

  const stats = { A: 0, B: 0, C: 0, D: 0, none: 0, multiUrl: 0, extra: 0 }
  const semFonte: string[] = []
  const porProjeto = new Map<number, { total: number; ok: number }>()

  for (const a of affected) {
    const { page, lh3Urls, extraPaths, depth } = a
    const proj = porProjeto.get(page.Template.projectId) ?? { total: 0, ok: 0 }
    proj.total++
    if (lh3Urls.length > 1) stats.multiUrl++
    if (extraPaths.length > 0) {
      stats.extra++
      console.log(`  [extra-paths] page ${page.id} (${page.name}): ${extraPaths.join(' | ')}`)
    }

    const driveIdOf = (g: (typeof gens)[number]) => {
      const fv = (g.fieldValues ?? {}) as Record<string, unknown>
      return typeof fv.driveImageId === 'string' && fv.driveImageId ? fv.driveImageId : null
    }

    const perUrl = lh3Urls.map((url) => {
      const srcA = (byPageId.get(page.id) ?? []).map(driveIdOf).find(Boolean) ?? null
      const genB = (byImageUrl.get(url) ?? []).map(driveIdOf).find(Boolean) ?? null
      const srcC =
        page.thumbnail && page.thumbnail.startsWith('http')
          ? ((byResultUrl.get(page.thumbnail) ?? []).map(driveIdOf).find(Boolean) ?? null)
          : null
      const postIds = page.scheduledPosts
        .map((sp) => {
          let sv: unknown = sp.slotValues
          if (typeof sv === 'string') {
            try {
              sv = JSON.parse(sv)
            } catch {
              sv = null
            }
          }
          const id = (sv as Record<string, unknown> | null)?._driveImageId
          return typeof id === 'string' && id ? id : null
        })
        .filter(Boolean) as string[]
      const srcD = postIds.length === 1 || new Set(postIds).size === 1 ? (postIds[0] ?? null) : null
      return { url, srcA, srcB: genB, srcC, srcD, postIdsCount: new Set(postIds).size }
    })

    let resolvedAll = true
    for (const r of perUrl) {
      if (r.srcB) stats.B++
      else if (r.srcA) stats.A++
      else if (r.srcC) stats.C++
      else if (r.srcD) stats.D++
      else {
        stats.none++
        resolvedAll = false
      }
    }
    if (resolvedAll && perUrl.length > 0) proj.ok++
    else if (perUrl.length > 0) {
      semFonte.push(
        `${page.id} proj=${page.Template.projectId} tpl=${page.Template.name} name="${page.name}" isTemplate=${page.isTemplate} depth=${depth} thumb=${page.thumbnail?.slice(0, 60)} urls=${lh3Urls.length} posts=${page.scheduledPosts.length}`,
      )
    }
    porProjeto.set(page.Template.projectId, proj)

    // consistência entre fontes quando mais de uma existe
    for (const r of perUrl) {
      const ids = [...new Set([r.srcA, r.srcB, r.srcC, r.srcD].filter(Boolean))]
      if (ids.length > 1)
        console.log(`  [conflito] page ${page.id} url=…${r.url.slice(-24)} ids=${ids.join(',')}`)
    }
  }

  console.log('\nfontes usadas (por URL, na ordem B>A>C>D):', stats)
  console.log('\npor projeto:')
  for (const [pid, s] of [...porProjeto.entries()].sort((x, y) => x[0] - y[0]))
    console.log(`  projeto ${pid}: ${s.ok}/${s.total} páginas com todas as URLs recuperáveis`)

  if (semFonte.length) {
    console.log(`\npáginas SEM fonte para alguma URL (${semFonte.length}):`)
    for (const linha of semFonte) console.log('  ' + linha)
  }

  const drafts = affected.flatMap((a) =>
    a.page.scheduledPosts.filter((sp) => sp.status === 'DRAFT' || sp.status === 'SCHEDULED'),
  )
  console.log(`\nposts DRAFT/SCHEDULED apontando para páginas afetadas: ${drafts.length}`)
  for (const d of drafts.slice(0, 20)) console.log(`  ${d.id} ${d.status} render=${d.renderStatus}`)

  const templates = affected.filter((a) => a.page.isTemplate)
  console.log(`\npáginas isTemplate afetadas: ${templates.length}`)
  for (const t of templates)
    console.log(`  ${t.page.id} proj=${t.page.Template.projectId} "${t.page.name}"`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
