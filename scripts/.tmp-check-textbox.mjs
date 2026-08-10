import { config } from 'dotenv'
config({ path: '/Users/cirotrigo/Documents/Studio-Lagosta-v2/.env.local' })
config({ path: '/Users/cirotrigo/Documents/Studio-Lagosta-v2/.env' })
const { PrismaClient } = await import('/Users/cirotrigo/Documents/Studio-Lagosta-v2/prisma/generated/client/index.js')
const db = new PrismaClient()

function parseLayers(layers) {
  let v = layers
  for (let i = 0; i < 3; i++) {
    if (typeof v === 'string') { try { v = JSON.parse(v) } catch { break } } else break
  }
  return Array.isArray(v) ? v : []
}

const pageId = 'cmn91suw00005swlvg9c9iry4'
const page = await db.page.findUnique({ where: { id: pageId } })
if (!page) { console.log('PAGE NOT FOUND') } else {
  const layers = parseLayers(page.layers)
  console.log('page', page.id, page.name, page.width + 'x' + page.height, 'layers=' + layers.length)
  for (const l of layers) {
    if (l.type === 'text' || l.type === 'rich-text') {
      console.log(JSON.stringify({
        name: l.name, id: l.id, hasTextboxConfig: !!l.textboxConfig,
        textboxConfig: l.textboxConfig ?? null,
        size: l.size, fontSize: l.style?.fontSize, fontFamily: l.style?.fontFamily,
        content: (l.content ?? '').slice(0, 80),
      }))
    }
  }
}

// posts using this page
const posts = await db.socialPost.findMany({
  where: { pageId },
  select: { id: true, status: true, scheduledDatetime: true, postType: true, slotValues: true, renderedImageUrl: true },
  take: 10,
})
console.log('posts referencing page:', JSON.stringify(posts, null, 1).slice(0, 2000))

// global stats: how many text layers lack textboxConfig, across pages used by scheduled/future posts
const pages = await db.page.findMany({ select: { id: true, layers: true }, take: 5000 })
let totalText = 0, missing = 0, pagesWithMissing = new Set()
for (const p of pages) {
  for (const l of parseLayers(p.layers)) {
    if (l.type === 'text' || l.type === 'rich-text') {
      totalText++
      if (!l.textboxConfig) { missing++; pagesWithMissing.add(p.id) }
    }
  }
}
console.log(`text layers total=${totalText} withoutTextboxConfig=${missing} pagesAffected=${pagesWithMissing.size}/${pages.length}`)

await db.$disconnect()
