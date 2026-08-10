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

// Posts that went through the SERVER-SIDE render path (blob path posts/rendered/)
const posts = await db.socialPost.findMany({
  where: { renderedImageUrl: { contains: '/posts/rendered/' } },
  select: { id: true, pageId: true, status: true, renderStatus: true, scheduledDatetime: true, renderedImageUrl: true, slotValues: true },
  orderBy: { scheduledDatetime: 'desc' },
})
console.log('posts rendered server-side (posts/rendered/):', posts.length)

const pageIds = [...new Set(posts.map(p => p.pageId).filter(Boolean))]
const pages = await db.page.findMany({ where: { id: { in: pageIds } }, select: { id: true, name: true, layers: true } })
const byId = new Map(pages.map(p => [p.id, p]))

let affectedPosts = 0
const samples = []
for (const post of posts) {
  const page = byId.get(post.pageId)
  if (!page) continue
  const bad = parseLayers(page.layers).filter(l => (l.type === 'text' || l.type === 'rich-text') && !l.textboxConfig && (l.content ?? '').trim().length > 0)
  if (bad.length) {
    affectedPosts++
    if (samples.length < 8) {
      samples.push({
        postId: post.id, status: post.status, renderStatus: post.renderStatus,
        scheduled: post.scheduledDatetime, page: page.id + ' ' + page.name,
        layers: bad.map(l => ({ name: l.name, w: l.size?.width, fs: l.style?.fontSize, ff: l.style?.fontFamily, hasNL: (l.content ?? '').includes('\n'), content: (l.content ?? '').slice(0, 70) })),
      })
    }
  }
}
console.log('server-rendered posts whose page has text layer WITHOUT textboxConfig:', affectedPosts)
console.log(JSON.stringify(samples, null, 1))

// upcoming scheduled posts pending render
const upcoming = await db.socialPost.findMany({
  where: { status: 'SCHEDULED', pageId: { not: null } },
  select: { id: true, pageId: true, renderStatus: true, scheduledDatetime: true },
  orderBy: { scheduledDatetime: 'asc' },
  take: 200,
})
const upPages = await db.page.findMany({ where: { id: { in: [...new Set(upcoming.map(p => p.pageId))] } }, select: { id: true, name: true, layers: true } })
const upById = new Map(upPages.map(p => [p.id, p]))
let upAffected = 0
const upSamples = []
for (const post of upcoming) {
  const page = upById.get(post.pageId)
  if (!page) continue
  const bad = parseLayers(page.layers).filter(l => (l.type === 'text' || l.type === 'rich-text') && !l.textboxConfig && (l.content ?? '').trim().length > 0)
  if (bad.length) {
    upAffected++
    if (upSamples.length < 5) upSamples.push({ postId: post.id, renderStatus: post.renderStatus, when: post.scheduledDatetime, page: page.id, layers: bad.map(l => l.name) })
  }
}
console.log(`SCHEDULED posts pending: ${upcoming.length}, with page missing textboxConfig: ${upAffected}`)
console.log(JSON.stringify(upSamples, null, 1))

await db.$disconnect()
