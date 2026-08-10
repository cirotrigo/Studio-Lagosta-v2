/**
 * Agrupa as páginas afetadas por URL lh3 IDÊNTICA (mesmo lote de criação =
 * mesma foto) e propaga os fileIds conhecidos para cada grupo:
 *   - Generation.fieldValues.imageUrl === URL  → driveImageId (match exato)
 *   - Generation.fieldValues.pageId === page   → driveImageId
 *   - SocialPost.slotValues._driveImageId (posts da página)
 *   - Doc TERO 07-13/abr: página numerada "Seg 1. …" → story N → fileId
 *     (docs/tero-copies-semana-07-13-abril.md + scripts/create-tero-week-posts.ts)
 * Valida conflitos entre fontes e salva o mapa em JSON para o reparador.
 * Só lê o banco — não escreve nada.
 */
import { db } from '@/lib/db'
import * as fs from 'fs'

const LH3 = /lh3\.googleusercontent\.com\/(drive-storage|.*=s\d+)/

// Ordem exata das 21 stories do doc/script da semana TERO 07-13/abr.
// Stories 9 e 15 compartilham a MESMA foto (1fJJg…) — vira validação interna:
// se as páginas 9 e 15 tiverem a mesma URL lh3, o mapeamento está certo.
const TERO_STORY_FILE_IDS = [
  '174xg29vef6zRTPuHNlW4cx-yjk_4ObKW', // 1 Seg Empanada
  '1NagYBQVVFWmkGz2gNWSA1fBL2YuOV6bz', // 2 Seg Ambiente
  '18PK3Xuw2RirgalgmH7J5KYs1pvVUVof2', // 3 Seg Croissant
  '14moa1BLm2swcd_qeh80L_G-pihN4ShLB', // 4 Ter Cupim
  '1rFZr3eaoecD6L9lhEwRKoTQTEQfpbXjW', // 5 Ter Executivo Ancho
  '1FaPEjWNza8lLkShqkd4QQEle92FsZzmH', // 6 Ter Happy Wine
  '1n_ZPmgzwTf13B25abiTBxKckf6hTwcQF', // 7 Qua Carbonara
  '10zoPNEpOZeWT9C0eYZPilRMWsP-onRIF', // 8 Qua Nhoque
  '1fJJgNzLCJL8ORjE3WC04Wk2408GDSBG8', // 9 Qua RW Urgência
  '1TlzGaby85_NF_aenzzAwUf19mLK55deM', // 10 Qui Executivo Salmão
  '1LEIG7SkC4ideXibUKNGWte7SZJu7hSSv', // 11 Qui Chorizo
  '1W4DQtpybO0yYBewoPyr5dGW3MkNgPK88', // 12 Qui Siciliano Brûlée
  '1LpI5g7Cp-5AH960SGvBhjl4hfMaHYqve', // 13 Sex Carpaccio
  '1pjLlDM9jHXary5LAjyS_1eLaEV65mBxw', // 14 Sex Happy Wine
  '1fJJgNzLCJL8ORjE3WC04Wk2408GDSBG8', // 15 Sex Entrecôte (mesma foto da 9)
  '1kU2QBA40tx1Re4_uYL9Pct8ZnVSmEKzm', // 16 Sab 4 Seleções
  '1_2T-GcaQcggFaA-1sCsPUpPx2VQ4cSrt', // 17 Sab Parrilla Ancho
  '1ZuROQRlROhR3TSYLBq5g5CGDi8Q0uXS7', // 18 Sab Sobremesas
  '150GRdrnauPC6htboyT1EwsaRpuZPqZ9c', // 19 Dom Mesa Grande
  '1lFs2ajO6y6oIJ3RTCR3X3qu2wX4M38b6', // 20 Dom Varanda
  '1GuPXYxyy8tnsF0cJvxlx8CRMD7Eu3_Go', // 21 Dom Contagem
]

function parseLayers(raw: unknown): any[] {
  let v: unknown = raw
  let d = 0
  while (typeof v === 'string' && d < 3) {
    try {
      v = JSON.parse(v)
      d++
    } catch {
      return []
    }
  }
  return Array.isArray(v) ? v : []
}

interface Evidence {
  source: string
  fileId: string
  detail: string
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
        select: { id: true, status: true, slotValues: true, mediaUrls: true, caption: true },
      },
    },
  })

  type PageRow = (typeof pages)[number]
  const affected: Array<{ page: PageRow; urls: string[] }> = []
  for (const p of pages) {
    const urls = [
      ...new Set(
        parseLayers(p.layers)
          .filter((l: any) => typeof l.fileUrl === 'string' && LH3.test(l.fileUrl))
          .map((l: any) => l.fileUrl as string),
      ),
    ]
    if (urls.length) affected.push({ page: p, urls })
  }

  const projectIds = [...new Set(affected.map((a) => a.page.Template.projectId))]
  const gens = await db.generation.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, resultUrl: true, fieldValues: true },
  })

  const genByImageUrl = new Map<string, string>() // url lh3 -> driveImageId
  const genByPageId = new Map<string, string>() // pageId -> driveImageId
  for (const g of gens) {
    const fv = (g.fieldValues ?? {}) as Record<string, unknown>
    const driveId = typeof fv.driveImageId === 'string' && fv.driveImageId ? fv.driveImageId : null
    if (!driveId) continue
    if (typeof fv.imageUrl === 'string' && LH3.test(fv.imageUrl) && !genByImageUrl.has(fv.imageUrl))
      genByImageUrl.set(fv.imageUrl, driveId)
    if (typeof fv.pageId === 'string' && !genByPageId.has(fv.pageId)) genByPageId.set(fv.pageId, driveId)
  }

  // grupos por URL
  const groups = new Map<
    string,
    { url: string; pages: Array<{ page: PageRow; urls: string[] }>; evidences: Evidence[] }
  >()
  const teroDia = /^(Seg|Ter|Qua|Qui|Sex|Sab|Dom)\s+(\d+)\.\s*(.*)$/

  for (const a of affected) {
    for (const url of a.urls) {
      let g = groups.get(url)
      if (!g) {
        g = { url, pages: [], evidences: [] }
        groups.set(url, g)
      }
      g.pages.push(a)

      // evidências por página
      const byGenUrl = genByImageUrl.get(url)
      if (byGenUrl)
        g.evidences.push({ source: 'gen-imageUrl', fileId: byGenUrl, detail: `url match` })
      const byGenPage = genByPageId.get(a.page.id)
      if (byGenPage)
        g.evidences.push({ source: 'gen-pageId', fileId: byGenPage, detail: a.page.id })
      for (const sp of a.page.scheduledPosts) {
        let sv: unknown = sp.slotValues
        if (typeof sv === 'string') {
          try {
            sv = JSON.parse(sv)
          } catch {
            sv = null
          }
        }
        const id = (sv as Record<string, unknown> | null)?._driveImageId
        if (typeof id === 'string' && id)
          g.evidences.push({ source: 'post-slotValues', fileId: id, detail: sp.id })
      }
      // doc TERO: página numerada do template "TERO — Semana Temática"
      if (a.page.Template.projectId === 3) {
        const m = teroDia.exec(a.page.name)
        if (m) {
          const n = Number(m[2])
          if (n >= 1 && n <= 21 && a.page.Template.name.startsWith('TERO — Semana Temática'))
            g.evidences.push({
              source: 'doc-tero',
              fileId: TERO_STORY_FILE_IDS[n - 1],
              detail: `story ${n} (${a.page.name})`,
            })
        }
      }
    }
  }

  // resolve cada grupo
  const out: Array<{
    url: string
    fileId: string | null
    conflict: string[] | null
    sources: string[]
    pages: Array<{
      id: string
      name: string
      projectId: number
      template: string
      isTemplate: boolean
      posts: Array<{ id: string; status: string; mediaUrls: string[] }>
      thumbnailKind: string
    }>
  }> = []

  let resolved = 0
  let conflicted = 0
  for (const g of [...groups.values()].sort((a, b) => b.pages.length - a.pages.length)) {
    const ids = [...new Set(g.evidences.map((e) => e.fileId))]
    const fileId = ids.length === 1 ? ids[0] : null
    const conflict = ids.length > 1 ? ids : null
    if (fileId) resolved++
    if (conflict) conflicted++
    out.push({
      url: g.url,
      fileId,
      conflict,
      sources: [...new Set(g.evidences.map((e) => e.source))],
      pages: g.pages.map((a) => ({
        id: a.page.id,
        name: a.page.name,
        projectId: a.page.Template.projectId,
        template: a.page.Template.name,
        isTemplate: a.page.isTemplate,
        posts: a.page.scheduledPosts.map((sp) => ({
          id: sp.id,
          status: sp.status as string,
          mediaUrls: (sp.mediaUrls ?? []) as string[],
        })),
        thumbnailKind: a.page.thumbnail
          ? a.page.thumbnail.startsWith('data:')
            ? 'data'
            : 'url'
          : 'none',
      })),
    })
  }

  fs.writeFileSync('scripts/.tmp-lh3-groups.json', JSON.stringify(out, null, 2))

  const totalPages = affected.length
  const pagesResolved = out.filter((o) => o.fileId).reduce((n, o) => n + o.pages.length, 0)
  console.log(
    `páginas afetadas: ${totalPages} | grupos de URL distinta: ${groups.size} | grupos resolvidos: ${resolved} (${pagesResolved} páginas) | conflitos: ${conflicted}`,
  )

  for (const o of out) {
    const projs = [...new Set(o.pages.map((p) => p.projectId))].join(',')
    const status = o.conflict ? `CONFLITO ${o.conflict.join('|')}` : (o.fileId ?? 'SEM FONTE')
    console.log(
      `\n[proj ${projs}] ${o.pages.length} pág | ${status} | fontes: ${o.sources.join(',') || '-'}`,
    )
    for (const p of o.pages) {
      const arts = p.posts
        .flatMap((sp) => sp.mediaUrls)
        .map((u) => decodeURIComponent(u.split('/').pop() ?? '').slice(0, 60))
      console.log(
        `    ${p.id} "${p.name}" (${p.template})${p.posts.length ? ` posts: ${arts.join(' ; ')}` : ''}`,
      )
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
