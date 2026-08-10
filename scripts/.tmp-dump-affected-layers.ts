/**
 * Dump das camadas de imagem lh3 + slotValues dos posts ligados, para páginas
 * afetadas representativas (By Rock Desejo/Week Feed, TERO numerada). Só lê.
 */
import { db } from '@/lib/db'

const LH3 = /lh3\.googleusercontent\.com\/(drive-storage|.*=s\d+)/

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

async function main() {
  const ids = [
    'cmn7s0dot0015swckk0q95js1', // By Rock - Desejo Pag.04
    'cmn7jq6kw0003swugc6u6hiuy', // By Rock - Desejo Pag.12 (posts=1)
    'cmn83jucg000tl704qrees9ha', // By Rock - Week Feed Pag.13
    'cmnifpn140001swnvuljc1qfg', // TERO Seg 1. Empanada
    'cmnifneln0003jy048v68hhva', // TERO (Cópia) MODELO — RW Jantar
  ]
  for (const id of ids) {
    const p = await db.page.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        createdAt: true,
        layers: true,
        Template: { select: { projectId: true, name: true } },
        scheduledPosts: {
          select: { id: true, status: true, slotValues: true, caption: true, mediaUrls: true, createdAt: true },
        },
      },
    })
    if (!p) continue
    console.log(`\n===== ${p.id} "${p.name}" (${p.Template.name}) criada=${p.createdAt.toISOString()}`)
    const layers = parseLayers(p.layers)
    for (const l of layers) {
      if (typeof l.fileUrl === 'string' && LH3.test(l.fileUrl)) {
        console.log('camada lh3:', JSON.stringify(l, null, 2).slice(0, 1800))
      }
    }
    for (const sp of p.scheduledPosts) {
      console.log(
        `post ${sp.id} ${sp.status} criado=${sp.createdAt.toISOString()} slotValues=${JSON.stringify(sp.slotValues)?.slice(0, 400)} mediaUrls=${JSON.stringify(sp.mediaUrls)?.slice(0, 200)}`,
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
