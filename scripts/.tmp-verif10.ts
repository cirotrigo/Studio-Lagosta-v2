import * as fs from 'fs'
import { list } from '/Users/cirotrigo/Documents/Studio-Lagosta-v2/node_modules/@vercel/blob/dist/index.js'
import { PrismaClient } from '/Users/cirotrigo/Documents/Studio-Lagosta-v2/prisma/generated/client'

for (const line of fs.readFileSync('/Users/cirotrigo/Documents/Studio-Lagosta-v2/.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const db = new PrismaClient()

async function main() {
  let cursor: string | undefined
  const konvaBlobs: { url: string; pathname: string }[] = []
  let total = 0
  do {
    const res: any = await list({ cursor, limit: 1000 })
    total += res.blobs.length
    for (const b of res.blobs) {
      if (b.pathname.includes('story-scheduled-')) konvaBlobs.push({ url: b.url, pathname: b.pathname })
    }
    cursor = res.cursor
  } while (cursor)

  console.log('blobs varridos:', total)
  console.log('blobs story-scheduled-* (export Konva do modal):', konvaBlobs.length)

  const posts = await db.socialPost.findMany({
    select: { id: true, status: true, pageId: true, renderStatus: true, mediaUrls: true, renderedImageUrl: true, nextRenderAt: true, createdAt: true },
  })
  const referenced = new Set<string>()
  for (const p of posts) {
    for (const u of p.mediaUrls || []) referenced.add(u)
    if (p.renderedImageUrl) referenced.add(p.renderedImageUrl)
  }
  const orfaos = konvaBlobs.filter(b => !referenced.has(b.url))
  console.log('export Konva AINDA referenciado:', konvaBlobs.length - orfaos.length)
  console.log('export Konva ORFAO:', orfaos.length)

  const comPage = posts.filter(p => p.pageId)
  const nunca = comPage.filter(p => p.nextRenderAt === null)
  const fila = comPage.filter(p => p.nextRenderAt !== null)
  console.log('pageId + nextRenderAt NULL (nasceu com export, nunca foi p/ fila):', nunca.length,
    '| story-scheduled:', nunca.filter(p => (p.mediaUrls?.[0]||'').includes('story-scheduled-')).length,
    '| posts/rendered:', nunca.filter(p => (p.mediaUrls?.[0]||'').includes('posts/rendered/')).length)
  console.log('pageId + nextRenderAt != null (passou pela fila):', fila.length,
    '| story-scheduled:', fila.filter(p => (p.mediaUrls?.[0]||'').includes('story-scheduled-')).length,
    '| posts/rendered:', fila.filter(p => (p.mediaUrls?.[0]||'').includes('posts/rendered/')).length)

  let casados = 0
  const ex: any[] = []
  for (const b of orfaos) {
    const m = b.pathname.match(/story-scheduled-(\d{13})/)
    if (!m) continue
    const ts = Number(m[1])
    const hit = comPage.find(p => Math.abs(p.createdAt.getTime() - ts) < 5 * 60 * 1000)
    if (hit) {
      casados++
      if (ex.length < 6) ex.push({ post: hit.id, status: hit.status, renderStatus: hit.renderStatus,
        criado: hit.createdAt.toISOString(), konvaOrfao: b.pathname, arteAtual: (hit.mediaUrls?.[0]||'').slice(-55) })
    }
  }
  console.log('orfaos casados com post por timestamp (<5min):', casados)
  console.log(JSON.stringify(ex, null, 1))
}
main().finally(() => db.$disconnect())
