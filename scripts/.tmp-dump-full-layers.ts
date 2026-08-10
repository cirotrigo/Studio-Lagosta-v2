/** Inventário completo de camadas (tipo, nome, visível, fileUrl) das páginas By Rock amostradas. Só lê. */
import { db } from '@/lib/db'

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

const IDS = [
  'cmn7s0b7j0001swcks2kl813o', // A pag19 desejo (post alfajor, thumb gnocchi)
  'cmn7s0bk60005swckkyog8t09', // A pag21 (post petit, thumb petit)
  'cmn7s0bsr0009swck16aj4say', // A pag36 (post tropeiro, thumb grego moka)
  'cmn6yx0zu0001swe3xrr3gaa2', // A pag10 (sem post, thumb RW mix)
  'cmn83juch0015l7047d7swx44', // A feed pag19
  'cmn7jq6kw0003swugc6u6hiuy', // B pag12 (gnocchi)
  'cmn7s0boh0007swckz28hepud', // C pag22 (fish)
]

async function main() {
  for (const id of IDS) {
    const p = await db.page.findUnique({
      where: { id },
      select: { id: true, name: true, updatedAt: true, layers: true, Template: { select: { name: true } } },
    })
    if (!p) continue
    console.log(`\n===== ${p.id} "${p.name}" (${p.Template.name}) updatedAt=${p.updatedAt.toISOString()}`)
    for (const l of parseLayers(p.layers)) {
      const url = typeof l.fileUrl === 'string' ? l.fileUrl : ''
      const kind = url.includes('lh3.googleusercontent') ? 'LH3' : url.includes('blob.vercel') ? 'BLOB' : url ? 'OUTRA' : '-'
      console.log(
        `  [${l.order ?? '?'}] ${l.type} "${l.name ?? l.id}" visible=${l.visible !== false} dyn=${!!l.isDynamic} ${kind} ${url.slice(0, 80)}${l.type === 'text' ? ` | "${String(l.content ?? '').slice(0, 40)}"` : ''}`,
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
