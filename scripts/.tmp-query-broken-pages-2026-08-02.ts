/**
 * Read-only: inspeciona as 38 páginas irrecuperáveis do manifesto lh3.
 * Agrupa pela URL morta, extrai textos, salva thumbnails e lista posts ligados.
 */
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

config({ path: '/Users/cirotrigo/Documents/Studio-Lagosta-v2/.env' })

const prisma = new PrismaClient()

const SCRATCH = '/private/tmp/claude-501/-Users-cirotrigo-Documents-Studio-Lagosta-v2--claude-worktrees-inspiring-einstein-8e78c9/d7f4e704-614b-4ce0-90ad-affc6c635dfd/scratchpad'
const MANIFEST = '/Users/cirotrigo/Documents/Studio-Lagosta-v2/scripts/.tmp-lh3-fix-manifest-2026-08-01.json'

function parseLayers(raw: unknown): any[] {
  let v: any = raw
  for (let i = 0; i < 3 && typeof v === 'string'; i++) {
    try { v = JSON.parse(v) } catch { return [] }
  }
  return Array.isArray(v) ? v : []
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  const irrec = manifest.paginas.filter((p: any) => p.acao === 'irrecuperavel')
  const ids = irrec.map((p: any) => p.pageId)
  const cobertaById = new Map(irrec.map((p: any) => [p.pageId, p.coberta]))

  const pages = await prisma.page.findMany({
    where: { id: { in: ids } },
    include: {
      Template: { select: { id: true, name: true, projectId: true } },
      scheduledPosts: {
        select: { id: true, status: true, scheduledDatetime: true, publishType: true, postType: true },
      },
    },
  })

  const thumbsDir = path.join(SCRATCH, 'thumbs')
  fs.mkdirSync(thumbsDir, { recursive: true })

  const out: any[] = []
  for (const page of pages) {
    const layers = parseLayers(page.layers)
    const deadImageLayers = layers.filter(
      (l: any) =>
        (l.type === 'image' || l.type === 'logo') &&
        typeof l.fileUrl === 'string' &&
        l.fileUrl.includes('lh3.googleusercontent.com'),
    )
    const texts = layers
      .filter((l: any) => l.type === 'text' && l.visible !== false && typeof l.content === 'string' && l.content.trim())
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
      .map((l: any) => ({ name: l.name, content: l.content }))

    let thumbFile: string | null = null
    let thumbUrl: string | null = null
    if (page.thumbnail) {
      if (page.thumbnail.startsWith('data:')) {
        const m = page.thumbnail.match(/^data:image\/(\w+);base64,(.+)$/)
        if (m) {
          thumbFile = path.join(thumbsDir, `${page.id}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`)
          fs.writeFileSync(thumbFile, Buffer.from(m[2], 'base64'))
        }
      } else {
        thumbUrl = page.thumbnail
      }
    }

    out.push({
      pageId: page.id,
      nome: page.name,
      isTemplate: page.isTemplate,
      templateId: page.Template?.id,
      template: page.Template?.name,
      projeto: page.Template?.projectId,
      coberta: cobertaById.get(page.id),
      deadUrls: deadImageLayers.map((l: any) => ({
        layerId: l.id, layerName: l.name, visible: l.visible, order: l.order,
        size: l.size, position: l.position,
        url: l.fileUrl,
      })),
      textos: texts,
      posts: page.scheduledPosts,
      thumbFile, thumbUrl,
      updatedAt: page.updatedAt,
    })
  }

  // agrupar por URL morta (hash curto)
  const groups = new Map<string, string[]>()
  for (const p of out) {
    for (const d of p.deadUrls) {
      const key = d.url
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(`${p.pageId} ${p.nome} (coberta=${p.coberta})`)
    }
  }

  fs.writeFileSync(path.join(SCRATCH, 'broken-pages.json'), JSON.stringify(out, null, 2))

  console.log(`Total páginas no banco: ${pages.length} de ${ids.length} do manifesto`)
  console.log(`\n=== GRUPOS POR URL MORTA (${groups.size} URLs distintas) ===`)
  let gi = 0
  for (const [url, members] of groups) {
    gi++
    console.log(`\n[G${gi}] ${url.slice(0, 110)}...`)
    console.log(`  ${members.length} páginas:`)
    for (const m of members) console.log(`   - ${m}`)
  }
  console.log('\n=== PÁGINAS QUEBRADAS À VISTA (coberta=false) ===')
  for (const p of out.filter((x) => !x.coberta)) {
    console.log(`\n${p.pageId} — projeto ${p.projeto} — template "${p.template}" — página "${p.nome}"${p.isTemplate ? ' [MODELO]' : ''}`)
    console.log(`  textos: ${p.textos.map((t: any) => t.content).join(' | ').slice(0, 200)}`)
    console.log(`  posts ligados: ${p.posts.length ? JSON.stringify(p.posts) : 'nenhum'}`)
    console.log(`  thumb: ${p.thumbFile ?? p.thumbUrl ?? 'nenhum'}`)
  }
}

main().finally(() => prisma.$disconnect())
